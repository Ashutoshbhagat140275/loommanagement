import type { FastifyInstance } from "fastify";
import { createLoomSchema, updateLoomSchema } from "@loom/shared";

import { requireFactory, requireRole } from "../auth/plugin.js";
import { conflict, notFound } from "../http/errors.js";
import { definedOnly } from "../http/patch.js";

const loomSelect = {
  id: true,
  number: true,
  status: true,
  place: true,
  note: true,
} as const;

export async function loomRoutes(app: FastifyInstance) {
  app.get(
    "/api/looms",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request) => {
      const { db } = requireFactory(request);
      const looms = await db.loom.findMany({
        select: loomSelect,
        orderBy: { number: "asc" },
      });
      return { looms };
    },
  );

  app.post(
    "/api/looms",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const input = createLoomSchema.parse(request.body);

      const clash = await db.loom.findFirst({
        where: { number: input.number },
        select: { id: true },
      });
      if (clash) throw conflict("LOOM_TAKEN", "A loom with this number already exists");

      const loom = await db.loom.create({
        data: {
          factoryId,
          number: input.number,
          place: input.place,
          status: input.status,
          note: input.note ?? null,
        },
        select: loomSelect,
      });
      return reply.status(201).send({ loom });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/looms/:id",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request) => {
      const { db } = requireFactory(request);
      const input = updateLoomSchema.parse(request.body);

      const existing = await db.loom.findFirst({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!existing) throw notFound("No such loom");

      const loom = await db.loom.update({
        where: { id: existing.id },
        data: definedOnly(input),
        select: loomSelect,
      });
      return { loom };
    },
  );
}
