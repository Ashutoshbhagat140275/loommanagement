import type { FastifyInstance } from "fastify";
import { createWorkerSchema, updateWorkerSchema } from "@loom/shared";

import { CREDENTIAL_PROVIDER, hashSecret } from "../auth/index.js";
import { requireFactory, requireRole } from "../auth/plugin.js";
import { prisma } from "../db/client.js";
import { badRequest, conflict, notFound } from "../http/errors.js";
import { definedOnly } from "../http/patch.js";

const workerSelect = {
  id: true,
  name: true,
  phone: true,
  wageType: true,
  trusted: true,
  active: true,
  userId: true,
  createdAt: true,
} as const;

export async function workerRoutes(app: FastifyInstance) {
  app.get(
    "/api/workers",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request) => {
      const { db } = requireFactory(request);
      const workers = await db.worker.findMany({
        select: workerSelect,
        orderBy: [{ active: "desc" }, { name: "asc" }],
      });
      return { workers };
    },
  );

  app.post(
    "/api/workers",
    { preHandler: requireRole("OWNER", "SUPERVISOR") },
    async (request, reply) => {
      const { factoryId, db } = requireFactory(request);
      const input = createWorkerSchema.parse(request.body);

      if (input.pin && !input.phone) {
        throw badRequest(
          "PHONE_REQUIRED",
          "A worker needs a phone number before they can have a PIN",
        );
      }

      if (input.phone) {
        const clash = await db.worker.findFirst({
          where: { phone: input.phone },
          select: { id: true },
        });
        if (clash) {
          throw conflict("PHONE_TAKEN", "A worker with this phone already exists");
        }
      }

      const pinHash = input.pin ? await hashSecret(input.pin) : null;

      const worker = await prisma.$transaction(async (tx) => {
        let userId: string | null = null;

        if (input.phone && pinHash) {
          // The phone number is the username, and a phone belongs to one
          // person, so this is unique across every factory on purpose.
          const taken = await tx.user.findUnique({
            where: { username: input.phone },
            select: { id: true },
          });
          if (taken) {
            throw conflict(
              "PHONE_TAKEN",
              "This phone number already has a login on another factory",
            );
          }

          const user = await tx.user.create({
            data: {
              name: input.name,
              username: input.phone,
              displayUsername: input.phone,
              role: "WORKER",
              factoryId,
            },
          });

          await tx.account.create({
            data: {
              userId: user.id,
              accountId: user.id,
              providerId: CREDENTIAL_PROVIDER,
              password: pinHash,
            },
          });

          userId = user.id;
        }

        return tx.worker.create({
          data: {
            factoryId,
            name: input.name,
            phone: input.phone ?? null,
            wageType: input.wageType,
            trusted: input.trusted,
            userId,
          },
          select: workerSelect,
        });
      });

      return reply.status(201).send({ worker });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/workers/:id",
    { preHandler: requireRole("OWNER") },
    async (request) => {
      const { db } = requireFactory(request);
      const input = updateWorkerSchema.parse(request.body);

      // findFirst, not findUnique by id alone: the tenant filter must apply,
      // otherwise this would happily update another factory's worker.
      const existing = await db.worker.findFirst({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!existing) throw notFound("No such worker");

      const worker = await db.worker.update({
        where: { id: existing.id },
        data: definedOnly(input),
        select: workerSelect,
      });

      return { worker };
    },
  );
}
