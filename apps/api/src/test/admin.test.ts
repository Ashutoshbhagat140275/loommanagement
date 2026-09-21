import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../server.js";
import { CREDENTIAL_PROVIDER, hashSecret } from "../auth/index.js";
import { prisma } from "../db/client.js";
import {
  as,
  createLoom,
  createWorker,
  resetDatabase,
  signInWorker,
  signUpFactory,
} from "./helpers.js";

let app: FastifyInstance;

before(async () => {
  app = await buildServer();
  await app.ready();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(resetDatabase);

/** The same account the create-super-admin script makes. */
async function superAdmin(): Promise<string> {
  const user = await prisma.user.create({
    data: { name: "Admin", email: "admin@loom.test", role: "SUPER_ADMIN" },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: CREDENTIAL_PROVIDER,
      password: await hashSecret("a-long-admin-password"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: "admin@loom.test", password: "a-long-admin-password" },
  });
  assert.equal(response.statusCode, 200, response.body);
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  return list.map((entry) => String(entry).split(";")[0]).join("; ");
}

describe("super admin", () => {
  it("sees every factory, with how big and how busy each one is", async () => {
    const shree = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    await signUpFactory(app, { factoryName: "Gupta Looms", email: "owner@gupta.test" });
    await createLoom(app, shree, "4");
    await createLoom(app, shree, "7");
    await createWorker(app, shree, { name: "Suresh", phone: "9876543210" });

    const admin = await superAdmin();
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/factories",
      headers: { cookie: admin },
    });
    assert.equal(response.statusCode, 200, response.body);

    const { factories } = response.json<{
      factories: {
        name: string;
        plan: string;
        looms: number;
        workers: number;
        owner: { email: string } | null;
      }[];
    }>();
    assert.equal(factories.length, 2);

    const row = factories.find((factory) => factory.name === "Shree Looms");
    assert.equal(row?.plan, "FREE");
    assert.equal(row?.looms, 2);
    assert.equal(row?.workers, 1);
    assert.equal(row?.owner?.email, "owner@shree.test");
  });

  it("is off limits to a factory owner", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/factories",
      headers: as(owner),
    });
    assert.equal(response.statusCode, 403);
  });
});

describe("pausing a factory", () => {
  it("stops the factory working but still lets its people see why", async () => {
    const shree = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });
    await createWorker(app, shree, { name: "Suresh", phone: "9876543210", pin: "4321" });
    const admin = await superAdmin();

    const paused = await app.inject({
      method: "POST",
      url: `/api/admin/factories/${shree.factoryId}/suspend`,
      headers: { cookie: admin },
      payload: {},
    });
    assert.equal(paused.statusCode, 200);

    // The owner can still sign in and learn it is paused...
    const me = await app.inject({ method: "GET", url: "/api/me", headers: as(shree) });
    assert.equal(me.statusCode, 200);
    assert.ok(
      me.json<{ user: { factory: { suspendedAt: string | null } } }>().user.factory
        .suspendedAt,
    );

    // ...but nothing else works, for the owner or for his weavers.
    const looms = await app.inject({ method: "GET", url: "/api/looms", headers: as(shree) });
    assert.equal(looms.statusCode, 403);
    assert.equal(looms.json<{ error: { code: string } }>().error.code, "FACTORY_SUSPENDED");

    const weaver = await signInWorker(app, "9876543210", "4321");
    const mine = await app.inject({
      method: "GET",
      url: "/api/my/saree-jobs",
      headers: { cookie: weaver },
    });
    assert.equal(mine.statusCode, 403);

    // Other factories are unaffected.
    const theirs = await app.inject({ method: "GET", url: "/api/looms", headers: as(gupta) });
    assert.equal(theirs.statusCode, 200);

    // Resuming puts it back.
    await app.inject({
      method: "POST",
      url: `/api/admin/factories/${shree.factoryId}/resume`,
      headers: { cookie: admin },
      payload: {},
    });
    const again = await app.inject({ method: "GET", url: "/api/looms", headers: as(shree) });
    assert.equal(again.statusCode, 200);
  });
});
