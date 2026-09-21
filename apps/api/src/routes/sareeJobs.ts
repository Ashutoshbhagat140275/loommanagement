import type { FastifyInstance } from "fastify";
import { shiftSareeJobWorkerSchema, startSareeJobSchema } from "@loom/shared";

import { requireAuth, requireFactory, requireRole } from "../auth/plugin.js";
import { badRequest, conflict, notFound } from "../http/errors.js";
import { applyShift, creditSareeWage, previewShift } from "../services/ledger.js";
import { giveMaterial } from "../services/stock.js";
import { approvedInches, approvedInchesByJob } from "../services/sareeJobs.js";

const jobSelect = {
  id: true,
  label: true,
  lengthInches: true,
  wageType: true,
  wagePaise: true,
  ratePerInchPaise: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  loom: { select: { id: true, number: true, place: true } },
  sareeType: { select: { id: true, name: true } },
  workers: {
    where: { active: true },
    select: { worker: { select: { id: true, name: true } } },
  },
} as const;

export async function sareeJobRoutes(app: FastifyInstance) {
  app.get(
    "/api/saree-jobs",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request) => {
      const { db } = requireFactory(request);
      const status = request.query as { status?: string };

      const jobs = await db.sareeJob.findMany({
        where: status.status === "FINISHED" ? { status: "FINISHED" } : { status: "RUNNING" },
        select: jobSelect,
        orderBy: { startedAt: "desc" },
      });

      const progress = await approvedInchesByJob(
        db,
        jobs.map((job) => job.id),
      );

      return {
        sareeJobs: jobs.map((job) => ({
          ...job,
          workers: job.workers.map((link) => link.worker),
          inchesDone: progress.get(job.id) ?? 0,
        })),
      };
    },
  );

  app.post(
    "/api/saree-jobs",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const input = startSareeJobSchema.parse(request.body);

      const loom = await db.loom.findFirst({
        where: { id: input.loomId },
        select: { id: true },
      });
      if (!loom) throw notFound("No such loom");

      const running = await db.sareeJob.findFirst({
        where: { loomId: loom.id, status: "RUNNING" },
        select: { id: true },
      });
      if (running) {
        throw conflict("LOOM_BUSY", "This loom already has a saree on it");
      }

      const workers = await db.worker.findMany({
        where: { id: { in: input.workerIds }, active: true },
        select: { id: true },
      });
      if (workers.length !== input.workerIds.length) {
        throw badRequest("UNKNOWN_WORKER", "One of those weavers was not found");
      }

      if (input.sareeTypeId) {
        const sareeType = await db.sareeType.findFirst({
          where: { id: input.sareeTypeId },
          select: { id: true },
        });
        if (!sareeType) throw notFound("No such saree type");
      }

      const { userId } = requireAuth(request);

      // The saree and its wage in the passbook are one fact: either both
      // exist or neither does.
      const job = await db.$transaction(async (tx) => {
        const created = await tx.sareeJob.create({
          data: {
            factoryId,
            loomId: loom.id,
            lengthInches: input.lengthInches,
            wageType: input.wageType,
            status: "RUNNING",
            sareeTypeId: input.sareeTypeId ?? null,
            label: input.label ?? null,
            wagePaise: input.wagePaise ?? null,
            ratePerInchPaise: input.ratePerInchPaise ?? null,
            workers: {
              create: input.workerIds.map((workerId) => ({ factoryId, workerId })),
            },
          },
          select: jobSelect,
        });

        if (input.wageType === "PER_SAREE" && input.wagePaise !== undefined) {
          await creditSareeWage(
            tx,
            { factoryId, userId },
            {
              sareeJobId: created.id,
              wagePaise: input.wagePaise,
              workerIds: input.workerIds,
            },
          );
        }

        // Material handed over at the start. If there is not enough of
        // something in stock, the saree does not start either, rather than
        // starting with half its material recorded.
        for (const line of input.materials) {
          await giveMaterial(
            tx,
            { factoryId, userId },
            {
              sareeJobId: created.id,
              materialId: line.materialId,
              quantityMilli: line.quantityMilli,
            },
          );
        }

        return created;
      });

      return reply.status(201).send({
        sareeJob: {
          ...job,
          workers: job.workers.map((link) => link.worker),
          inchesDone: 0,
        },
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/saree-jobs/:id/finish",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request) => {
      const { db } = requireFactory(request);

      const job = await db.sareeJob.findFirst({
        where: { id: request.params.id },
        select: { id: true, status: true },
      });
      if (!job) throw notFound("No such saree");
      if (job.status === "FINISHED") {
        throw conflict("ALREADY_FINISHED", "This saree is already finished");
      }

      const sareeJob = await db.sareeJob.update({
        where: { id: job.id },
        // Off the loom and into the store room.
        data: { status: "FINISHED", finishedAt: new Date(), saleStatus: "IN_STOCK" },
        select: jobSelect,
      });

      return {
        sareeJob: {
          ...sareeJob,
          workers: sareeJob.workers.map((link) => link.worker),
          inchesDone: await approvedInches(db, job.id),
        },
      };
    },
  );

  /**
   * What shifting a weaver would do to their passbook, before the owner
   * agrees. Worked out by the same code that writes it, so the numbers shown
   * are the numbers saved.
   */
  app.get<{ Params: { id: string }; Querystring: { workerId?: string } }>(
    "/api/saree-jobs/:id/shift-preview",
    { preHandler: requireRole("OWNER") },
    async (request) => {
      const { db } = requireFactory(request);
      const workerId = request.query.workerId;
      if (!workerId) throw badRequest("WORKER_REQUIRED", "Say which weaver is leaving");

      const inchesDone = await approvedInches(db, request.params.id);
      const preview = await previewShift(db, {
        sareeJobId: request.params.id,
        workerId,
        inchesDone,
      });
      return { preview };
    },
  );

  /**
   * Take a weaver off a half-done saree. Rare: a per-saree weaver normally
   * finishes what they start.
   */
  app.post<{ Params: { id: string } }>(
    "/api/saree-jobs/:id/shift-worker",
    { preHandler: requireRole("OWNER") },
    async (request) => {
      const { db, factoryId } = requireFactory(request);
      const { userId } = requireAuth(request);
      const input = shiftSareeJobWorkerSchema.parse(request.body);

      const job = await db.sareeJob.findFirst({
        where: { id: request.params.id },
        select: { id: true, status: true, lengthInches: true },
      });
      if (!job) throw notFound("No such saree");
      if (job.status !== "RUNNING") {
        throw conflict("NOT_RUNNING", "This saree is not being woven");
      }

      const link = await db.sareeJobWorker.findFirst({
        where: { sareeJobId: job.id, workerId: input.workerId, active: true },
        select: { id: true },
      });
      if (!link) throw notFound("That weaver is not on this saree");

      if (input.replacementWorkerId) {
        const replacement = await db.worker.findFirst({
          where: { id: input.replacementWorkerId, active: true },
          select: { id: true },
        });
        if (!replacement) {
          throw badRequest("UNKNOWN_WORKER", "That replacement weaver was not found");
        }
      }

      const inchesDone = await approvedInches(db, job.id);

      // The ledger settles the money and moves weavers on and off the saree
      // together, in one transaction.
      const settlement = await db.$transaction((tx) =>
        applyShift(
          tx,
          { factoryId, userId },
          {
            sareeJobId: job.id,
            workerId: input.workerId,
            inchesDone,
            replacementWorkerId: input.replacementWorkerId ?? null,
          },
        ),
      );

      return {
        shift: {
          workerId: input.workerId,
          ...settlement,
        },
      };
    },
  );
}
