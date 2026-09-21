import type { FastifyInstance } from "fastify";

import { requireAuth } from "../auth/plugin.js";
import { prisma } from "../db/client.js";

export async function meRoutes(app: FastifyInstance) {
  /** Who am I, which factory am I in, and what may I do. */
  app.get("/api/me", async (request) => {
    const context = requireAuth(request);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: context.userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        factory: { select: { id: true, name: true, plan: true, suspendedAt: true } },
        worker: { select: { id: true, wageType: true, trusted: true } },
      },
    });

    return { user };
  });
}
