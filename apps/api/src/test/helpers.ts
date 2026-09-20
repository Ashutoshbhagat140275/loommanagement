import type { FastifyInstance, LightMyRequestResponse } from "fastify";

import { prisma } from "../db/client.js";
import { env } from "../env.js";

/**
 * Wipe every table between tests. Guarded on the database name so a stray
 * DATABASE_URL can never point this at real data.
 */
export async function resetDatabase() {
  if (!/test/i.test(env.DATABASE_URL)) {
    throw new Error(
      `Refusing to wipe a database whose name does not contain "test": ${env.DATABASE_URL}`,
    );
  }
  // Order matters only without cascades; Factory cascades to users and workers.
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.user.deleteMany();
  await prisma.factory.deleteMany();
}

export type SignedIn = {
  cookie: string;
  factoryId: string;
};

function readSessionCookie(headers: Record<string, unknown>): string {
  const raw = headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const cookie = list.map((entry) => String(entry).split(";")[0]).join("; ");
  if (!cookie) throw new Error("Sign-in did not set a session cookie");
  return cookie;
}

/** Create a factory with its owner and return a usable session cookie. */
export async function signUpFactory(
  app: FastifyInstance,
  options: { factoryName: string; email: string; password?: string },
): Promise<SignedIn> {
  const response = await app.inject({
    method: "POST",
    url: "/api/factories/sign-up",
    payload: {
      factoryName: options.factoryName,
      ownerName: "Owner",
      email: options.email,
      password: options.password ?? "supersecret123",
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`sign-up failed: ${response.statusCode} ${response.body}`);
  }

  return {
    cookie: readSessionCookie(response.headers),
    factoryId: response.json<{ factory: { id: string } }>().factory.id,
  };
}

export async function createWorker(
  app: FastifyInstance,
  session: SignedIn,
  body: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/api/workers",
    headers: { cookie: session.cookie },
    payload: body,
  });
}
