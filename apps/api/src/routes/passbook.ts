import type { FastifyInstance } from "fastify";
import {
  giveAdvanceSchema,
  payWorkerSchema,
  settleOldBalanceSchema,
} from "@loom/shared";

import { requireAuth, requireFactory, requireRole } from "../auth/plugin.js";
import { forbidden } from "../http/errors.js";
import {
  giveAdvance,
  payWorker,
  readPassbook,
  settleOldBalance,
} from "../services/ledger.js";

/**
 * The passbook: what used to be the owner's paper khata.
 *
 * Owner only. Supervisors enter production but do not see or move wages, and
 * none of this is available offline: payments are made where there is
 * internet, and queueing one could leave two different balances for a weaver.
 */
export async function passbookRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    "/api/workers/:id/passbook",
    { preHandler: requireRole("OWNER") },
    async (request) => {
      const { db } = requireFactory(request);
      return { passbook: await readPassbook(db, request.params.id) };
    },
  );

  /** A weaver's own passbook, read only. */
  app.get("/api/my/passbook", async (request) => {
    const { db } = requireFactory(request);
    const { userId } = requireAuth(request);

    const worker = await db.worker.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!worker) throw forbidden("This account is not linked to a weaver");

    return { passbook: await readPassbook(db, worker.id) };
  });

  app.post<{ Params: { id: string } }>(
    "/api/workers/:id/advances",
    { preHandler: requireRole("OWNER") },
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const { userId } = requireAuth(request);
      const input = giveAdvanceSchema.parse(request.body);

      await db.$transaction((tx) =>
        giveAdvance(
          tx,
          { factoryId, userId },
          {
            workerId: request.params.id,
            amountPaise: input.amountPaise,
            note: input.note ?? null,
          },
        ),
      );

      return reply.status(201).send({ passbook: await readPassbook(db, request.params.id) });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/workers/:id/payments",
    { preHandler: requireRole("OWNER") },
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const { userId } = requireAuth(request);
      const input = payWorkerSchema.parse(request.body);

      const payment = await db.$transaction((tx) =>
        payWorker(
          tx,
          { factoryId, userId },
          {
            workerId: request.params.id,
            sareeJobId: input.sareeJobId,
            workAmountPaise: input.workAmountPaise,
            cutForAdvancePaise: input.cutForAdvancePaise,
            note: input.note ?? null,
          },
        ),
      );

      return reply.status(201).send({
        payment,
        passbook: await readPassbook(db, request.params.id),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/workers/:id/old-balance-settlements",
    { preHandler: requireRole("OWNER") },
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const { userId } = requireAuth(request);
      const input = settleOldBalanceSchema.parse(request.body);

      await db.$transaction((tx) =>
        settleOldBalance(
          tx,
          { factoryId, userId },
          {
            workerId: request.params.id,
            amountPaise: input.amountPaise,
            note: input.note ?? null,
          },
        ),
      );

      return reply.status(201).send({ passbook: await readPassbook(db, request.params.id) });
    },
  );

  /** The owner's view across everyone: what he owes, and what is out on advance. */
  app.get(
    "/api/passbook/summary",
    { preHandler: requireRole("OWNER") },
    async (request) => {
      const { db } = requireFactory(request);

      const rows = await db.ledgerLine.groupBy({
        by: ["workerId", "section"],
        _sum: { amountPaise: true },
      });

      let currentWorkPaise = 0;
      const oldBalanceByWorker = new Map<string, number>();
      for (const row of rows) {
        const amount = row._sum.amountPaise ?? 0;
        if (row.section === "CURRENT_WORK") currentWorkPaise += amount;
        else oldBalanceByWorker.set(row.workerId, amount);
      }

      let advancesOutPaise = 0;
      let oldBalanceOwedPaise = 0;
      for (const amount of oldBalanceByWorker.values()) {
        if (amount < 0) advancesOutPaise += -amount;
        else oldBalanceOwedPaise += amount;
      }

      return {
        summary: {
          /** Owed for sarees, net of what has been paid against them. */
          currentWorkPaise,
          /** Advances weavers still have to work off. */
          advancesOutPaise,
          /** Left over from sarees weavers were shifted off, still to be paid. */
          oldBalanceOwedPaise,
        },
      };
    },
  );
}
