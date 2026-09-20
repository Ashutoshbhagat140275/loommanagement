import type { FastifyInstance } from "fastify";
import { signUpFactorySchema } from "@loom/shared";

import { auth, CREDENTIAL_PROVIDER, hashSecret } from "../auth/index.js";
import { copyAuthCookies } from "../auth/plugin.js";
import { prisma } from "../db/client.js";
import { conflict } from "../http/errors.js";

export async function factoryRoutes(app: FastifyInstance) {
  /**
   * The only way an account is created. A factory and its owner are made
   * together, so there is never a user without a factory.
   */
  app.post("/api/factories/sign-up", async (request, reply) => {
    const input = signUpFactorySchema.parse(request.body);
    const email = input.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw conflict("EMAIL_TAKEN", "An account with this email already exists");
    }

    const passwordHash = await hashSecret(input.password);

    const { factory } = await prisma.$transaction(async (tx) => {
      const factory = await tx.factory.create({
        data: { name: input.factoryName, phone: input.phone ?? null },
      });

      const user = await tx.user.create({
        data: {
          name: input.ownerName,
          email,
          emailVerified: false,
          role: "OWNER",
          factoryId: factory.id,
        },
      });

      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: CREDENTIAL_PROVIDER,
          password: passwordHash,
        },
      });

      return { factory, user };
    });

    // Sign the owner in straight away so they land inside the app.
    const signIn = await auth.api.signInEmail({
      body: { email, password: input.password },
      asResponse: true,
    });

    copyAuthCookies(reply, signIn);
    return reply.status(201).send({
      factory: { id: factory.id, name: factory.name },
    });
  });
}
