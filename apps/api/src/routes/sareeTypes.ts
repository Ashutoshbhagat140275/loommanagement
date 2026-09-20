import type { FastifyInstance } from "fastify";
import { createSareeTypeSchema, updateSareeTypeSchema } from "@loom/shared";

import { requireFactory, requireRole } from "../auth/plugin.js";
import { conflict, notFound } from "../http/errors.js";
import { definedOnly } from "../http/patch.js";

const sareeTypeSelect = {
  id: true,
  name: true,
  lengthInches: true,
  defaultWagePaise: true,
  defaultRatePerInchPaise: true,
} as const;

/**
 * Templates for the sarees a factory weaves regularly. Only a starting point:
 * the numbers are copied onto each saree job, so editing one here never
 * changes a saree already on a loom.
 */
export async function sareeTypeRoutes(app: FastifyInstance) {
  app.get(
    "/api/saree-types",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request) => {
      const { db } = requireFactory(request);
      const sareeTypes = await db.sareeType.findMany({
        select: sareeTypeSelect,
        orderBy: { name: "asc" },
      });
      return { sareeTypes };
    },
  );

  app.post(
    "/api/saree-types",
    { preHandler: requireRole("OWNER") },
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const input = createSareeTypeSchema.parse(request.body);

      const clash = await db.sareeType.findFirst({
        where: { name: input.name },
        select: { id: true },
      });
      if (clash) {
        throw conflict("SAREE_TYPE_TAKEN", "A saree with this name already exists");
      }

      const sareeType = await db.sareeType.create({
        data: {
          factoryId,
          name: input.name,
          lengthInches: input.lengthInches,
          defaultWagePaise: input.defaultWagePaise ?? null,
          defaultRatePerInchPaise: input.defaultRatePerInchPaise ?? null,
        },
        select: sareeTypeSelect,
      });

      return reply.status(201).send({ sareeType });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/saree-types/:id",
    { preHandler: requireRole("OWNER") },
    async (request) => {
      const { db } = requireFactory(request);
      const input = updateSareeTypeSchema.parse(request.body);

      const existing = await db.sareeType.findFirst({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!existing) throw notFound("No such saree type");

      const sareeType = await db.sareeType.update({
        where: { id: existing.id },
        data: definedOnly(input),
        select: sareeTypeSelect,
      });

      return { sareeType };
    },
  );
}
