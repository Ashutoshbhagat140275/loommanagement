import type { FastifyInstance } from "fastify";
import {
  createProductionEntrySchema,
  reviewProductionEntrySchema,
  toIsoDate,
  weekStartOf,
} from "@loom/shared";

import { requireAuth, requireFactory, requireRole } from "../auth/plugin.js";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.js";
import { approvedInches } from "../services/sareeJobs.js";

const entrySelect = {
  id: true,
  weekStart: true,
  inches: true,
  ratePerInchPaise: true,
  status: true,
  createdAt: true,
  sareeJob: {
    select: {
      id: true,
      label: true,
      lengthInches: true,
      loom: { select: { id: true, number: true } },
      workers: {
        where: { active: true },
        select: { worker: { select: { id: true, name: true } } },
      },
    },
  },
} as const;

export async function productionEntryRoutes(app: FastifyInstance) {
  /** The saree a signed-in weaver is currently on, so they can report on it. */
  app.get("/api/my/saree-jobs", async (request) => {
    const { db } = requireFactory(request);
    const context = requireAuth(request);

    const worker = await db.worker.findFirst({
      where: { userId: context.userId },
      select: { id: true },
    });
    if (!worker) return { sareeJobs: [] };

    const links = await db.sareeJobWorker.findMany({
      where: { workerId: worker.id, active: true, sareeJob: { status: "RUNNING" } },
      select: {
        sareeJob: {
          select: {
            id: true,
            label: true,
            lengthInches: true,
            loom: { select: { id: true, number: true } },
          },
        },
      },
    });

    const jobs = links.map((link) => link.sareeJob);
    const entries = await db.productionEntry.findMany({
      where: { sareeJobId: { in: jobs.map((job) => job.id) } },
      select: { sareeJobId: true, weekStart: true, inches: true, status: true },
      orderBy: { weekStart: "desc" },
    });

    return {
      sareeJobs: await Promise.all(
        jobs.map(async (job) => ({
          ...job,
          inchesDone: await approvedInches(db, job.id),
          entries: entries
            .filter((entry) => entry.sareeJobId === job.id)
            .map((entry) => ({ ...entry, weekStart: toIsoDate(entry.weekStart) })),
        })),
      ),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/api/saree-jobs/:id/entries",
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const context = requireAuth(request);
      const input = createProductionEntrySchema.parse(request.body);

      const job = await db.sareeJob.findFirst({
        where: { id: request.params.id },
        select: {
          id: true,
          status: true,
          lengthInches: true,
          ratePerInchPaise: true,
        },
      });
      if (!job) throw notFound("No such saree");
      if (job.status !== "RUNNING") {
        throw conflict("NOT_RUNNING", "This saree is not being woven");
      }

      // A weaver may only report on a saree they are actually on. Owners and
      // supervisors may report on any saree in their factory.
      let autoApprove = context.role !== "WORKER";
      if (context.role === "WORKER") {
        const worker = await db.worker.findFirst({
          where: { userId: context.userId },
          select: { id: true, trusted: true },
        });
        if (!worker) throw forbidden("This account is not linked to a weaver");

        const onJob = await db.sareeJobWorker.findFirst({
          where: { sareeJobId: job.id, workerId: worker.id, active: true },
          select: { id: true },
        });
        if (!onJob) throw forbidden("You are not weaving this saree");

        autoApprove = worker.trusted;
      }

      const weekStart = weekStartOf(input.weekStart);

      const alreadyFiled = await db.productionEntry.findFirst({
        where: { sareeJobId: job.id, weekStart },
        select: { id: true, inches: true, status: true },
      });
      if (alreadyFiled) {
        throw conflict(
          "WEEK_ALREADY_FILED",
          "This week has already been recorded for this saree",
        );
      }

      const done = await approvedInches(db, job.id);
      const remaining = job.lengthInches - done;
      if (input.inches > remaining && !input.allowOverflow) {
        throw badRequest(
          "INCHES_EXCEED_LENGTH",
          `Only ${remaining} inches are left on this saree, but ${input.inches} were entered`,
        );
      }

      const entry = await db.productionEntry.create({
        data: {
          factoryId,
          sareeJobId: job.id,
          weekStart,
          inches: input.inches,
          ratePerInchPaise: job.ratePerInchPaise,
          status: autoApprove ? "APPROVED" : "AWAITING_OWNER",
          enteredByUserId: context.userId,
          approvedAt: autoApprove ? new Date() : null,
          approvedByUserId: autoApprove ? context.userId : null,
        },
        select: entrySelect,
      });

      return reply.status(201).send({
        entry: { ...entry, weekStart: toIsoDate(entry.weekStart) },
      });
    },
  );

  /** The owner's approval queue. */
  app.get(
    "/api/production-entries",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request) => {
      const { db } = requireFactory(request);
      const query = request.query as { status?: string };

      const entries = await db.productionEntry.findMany({
        ...(query.status === "AWAITING_OWNER" || query.status === "APPROVED"
          ? { where: { status: query.status } }
          : {}),
        select: entrySelect,
        orderBy: [{ status: "asc" }, { weekStart: "desc" }],
        take: 200,
      });

      return {
        entries: entries.map((entry) => ({
          ...entry,
          weekStart: toIsoDate(entry.weekStart),
          sareeJob: {
            ...entry.sareeJob,
            workers: entry.sareeJob.workers.map((link) => link.worker),
          },
        })),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/production-entries/:id/approve",
    { preHandler: requireRole("OWNER") },
    async (request) => {
      const { db } = requireFactory(request);
      const context = requireAuth(request);
      const input = reviewProductionEntrySchema.parse(request.body ?? {});

      const entry = await db.productionEntry.findFirst({
        where: { id: request.params.id },
        select: { id: true, status: true, inches: true },
      });
      if (!entry) throw notFound("No such entry");
      if (entry.status === "APPROVED") {
        throw conflict("ALREADY_APPROVED", "This entry is already approved");
      }

      const approved = await db.productionEntry.update({
        where: { id: entry.id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedByUserId: context.userId,
          ...(input.inches === undefined ? {} : { inches: input.inches }),
        },
        select: entrySelect,
      });

      return { entry: { ...approved, weekStart: toIsoDate(approved.weekStart) } };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/production-entries/:id",
    { preHandler: requireRole("OWNER") },
    async (request, reply) => {
      const { db } = requireFactory(request);

      const entry = await db.productionEntry.findFirst({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!entry) throw notFound("No such entry");

      await db.productionEntry.delete({ where: { id: entry.id } });
      return reply.status(204).send();
    },
  );
}
