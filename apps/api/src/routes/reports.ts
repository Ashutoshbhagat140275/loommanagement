import type { FastifyInstance } from "fastify";
import { parseIsoDate, productionReportQuerySchema, toIsoDate } from "@loom/shared";

import { requireFactory, requireRole } from "../auth/plugin.js";
import { badRequest } from "../http/errors.js";

type Tally = { inches: number };

function addTo<T extends Tally>(
  map: Map<string, T>,
  key: string,
  make: () => T,
  inches: number,
) {
  const row = map.get(key) ?? make();
  row.inches += inches;
  map.set(key, row);
}

export async function reportRoutes(app: FastifyInstance) {
  /**
   * Production over a stretch of weeks, totalled three ways.
   *
   * Approved entries only, so nothing still waiting on the owner can flatter
   * the numbers. Inches are reported, not money: what a weaver is owed is the
   * ledger's job, and two places working out wages would eventually disagree.
   */
  app.get(
    "/api/reports/production",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request) => {
      const { db } = requireFactory(request);
      const query = productionReportQuerySchema.parse(request.query);

      const from = parseIsoDate(query.from);
      const to = parseIsoDate(query.to);
      if (from > to) throw badRequest("BAD_RANGE", "The start date is after the end date");

      const entries = await db.productionEntry.findMany({
        where: { status: "APPROVED", weekStart: { gte: from, lte: to } },
        select: {
          weekStart: true,
          inches: true,
          sareeJob: {
            select: {
              id: true,
              label: true,
              loom: { select: { id: true, number: true } },
              workers: { select: { worker: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { weekStart: "asc" },
      });

      const byWeek = new Map<string, { weekStart: string; inches: number }>();
      const byLoom = new Map<string, { loomId: string; number: string; inches: number }>();
      const byWorker = new Map<string, { workerId: string; name: string; inches: number }>();
      let totalInches = 0;

      for (const entry of entries) {
        totalInches += entry.inches;

        const week = toIsoDate(entry.weekStart);
        addTo(byWeek, week, () => ({ weekStart: week, inches: 0 }), entry.inches);

        const loom = entry.sareeJob.loom;
        addTo(
          byLoom,
          loom.id,
          () => ({ loomId: loom.id, number: loom.number, inches: 0 }),
          entry.inches,
        );

        // A loom's output belongs to whoever was on it. Two weavers share one
        // saree half and half, so the inches are shared the same way the money
        // is, which can leave a weaver on a half inch.
        const workers = entry.sareeJob.workers.map((link) => link.worker);
        if (workers.length === 0) continue;
        const share = entry.inches / workers.length;
        for (const worker of workers) {
          addTo(
            byWorker,
            worker.id,
            () => ({ workerId: worker.id, name: worker.name, inches: 0 }),
            share,
          );
        }
      }

      const mostFirst = <T extends Tally>(rows: T[]) =>
        rows.sort((a, b) => b.inches - a.inches);

      return {
        from: query.from,
        to: query.to,
        totalInches,
        byWeek: [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
        byLoom: mostFirst([...byLoom.values()]),
        byWorker: mostFirst([...byWorker.values()]),
      };
    },
  );
}
