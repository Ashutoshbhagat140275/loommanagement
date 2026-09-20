import type { FastifyInstance, LightMyRequestResponse } from "fastify";

import { prisma } from "../db/client.js";
import { env } from "../env.js";

/**
 * Wipe every table between tests. Guarded on the database name so a stray
 * DATABASE_URL can never point this at real data.
 *
 * Because this truncates globally, the test script runs with
 * --test-concurrency=1. Test files otherwise run in parallel processes against
 * this one database, and a reset in one file deletes rows another file is
 * still using, which shows up as foreign key and unique constraint errors.
 */
export async function resetDatabase() {
  if (!/test/i.test(env.DATABASE_URL)) {
    throw new Error(
      `Refusing to wipe a database whose name does not contain "test": ${env.DATABASE_URL}`,
    );
  }

  // One TRUNCATE ... CASCADE over every table, rather than deleteMany() per
  // model in dependency order. That ordering broke the moment a model with an
  // onDelete: Restrict relation was added, and it would break again with the
  // next one.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;
  if (tables.length === 0) return;

  const quoted = tables
    .map((table) => `"public"."${table.tablename.replace(/"/g, '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} CASCADE`);
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

export function as(session: SignedIn | string) {
  return { cookie: typeof session === "string" ? session : session.cookie };
}

/** Sign a weaver in with their phone and PIN, and return the session cookie. */
export async function signInWorker(
  app: FastifyInstance,
  phone: string,
  pin: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/username",
    payload: { username: phone, password: pin },
  });
  if (response.statusCode !== 200) {
    throw new Error(`worker sign-in failed: ${response.statusCode} ${response.body}`);
  }
  return readSessionCookie(response.headers);
}

export async function createLoom(
  app: FastifyInstance,
  session: SignedIn,
  number: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/looms",
    headers: as(session),
    payload: { number },
  });
  if (response.statusCode !== 201) {
    throw new Error(`create loom failed: ${response.statusCode} ${response.body}`);
  }
  return response.json<{ loom: { id: string } }>().loom.id;
}

export async function startSareeJob(
  app: FastifyInstance,
  session: SignedIn,
  body: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/api/saree-jobs",
    headers: as(session),
    payload: body,
  });
}

export async function fileEntry(
  app: FastifyInstance,
  cookie: string,
  sareeJobId: string,
  body: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: `/api/saree-jobs/${sareeJobId}/entries`,
    headers: { cookie },
    payload: body,
  });
}
