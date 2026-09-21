import type { FastifyInstance } from "fastify";

import { requireRole } from "../auth/plugin.js";
import { prisma } from "../db/client.js";
import { notFound } from "../http/errors.js";

/**
 * The super admin's view across every factory using the app.
 *
 * Uses the unscoped client on purpose: looking across tenants is the whole
 * point. It reads counts and dates only, never anyone's wages or passbooks.
 */
export async function adminRoutes(app: FastifyInstance) {
  const superAdmin = { preHandler: requireRole("SUPER_ADMIN") };

  app.get("/api/admin/factories", superAdmin, async () => {
    const factories = await prisma.factory.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        plan: true,
        suspendedAt: true,
        createdAt: true,
        users: {
          where: { role: "OWNER" },
          select: { name: true, email: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
        _count: { select: { workers: true, looms: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const ids = factories.map((factory) => factory.id);

    const running = await prisma.sareeJob.groupBy({
      by: ["factoryId"],
      where: { factoryId: { in: ids }, status: "RUNNING" },
      _count: { _all: true },
    });

    // The last time anyone in the factory recorded work: a quick sign of
    // whether a factory that signed up is actually using the app.
    const lastEntry = await prisma.productionEntry.groupBy({
      by: ["factoryId"],
      where: { factoryId: { in: ids } },
      _max: { createdAt: true },
    });

    return {
      factories: factories.map((factory) => ({
        id: factory.id,
        name: factory.name,
        phone: factory.phone,
        plan: factory.plan,
        suspendedAt: factory.suspendedAt,
        createdAt: factory.createdAt,
        owner: factory.users[0] ?? null,
        workers: factory._count.workers,
        looms: factory._count.looms,
        runningSarees:
          running.find((row) => row.factoryId === factory.id)?._count._all ?? 0,
        lastActiveAt:
          lastEntry.find((row) => row.factoryId === factory.id)?._max.createdAt ?? null,
      })),
    };
  });

  for (const [path, suspend] of [
    ["suspend", true],
    ["resume", false],
  ] as const) {
    app.post<{ Params: { id: string } }>(
      `/api/admin/factories/:id/${path}`,
      superAdmin,
      async (request) => {
        const factory = await prisma.factory.findUnique({
          where: { id: request.params.id },
          select: { id: true },
        });
        if (!factory) throw notFound("No such factory");

        await prisma.factory.update({
          where: { id: factory.id },
          data: { suspendedAt: suspend ? new Date() : null },
        });
        return { ok: true };
      },
    );
  }
}
