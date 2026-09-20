import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../server.js";
import { prisma } from "../db/client.js";
import { createWorker, resetDatabase, signUpFactory } from "./helpers.js";

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

describe("factory sign-up", () => {
  it("creates a factory, an owner and a session in one go", async () => {
    const session = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });

    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: session.cookie },
    });

    assert.equal(me.statusCode, 200);
    const { user } = me.json<{
      user: { role: string; factory: { id: string; name: string } };
    }>();
    assert.equal(user.role, "OWNER");
    assert.equal(user.factory.name, "Shree Looms");
    assert.equal(user.factory.id, session.factoryId);
  });

  it("refuses a second account on the same email", async () => {
    await signUpFactory(app, { factoryName: "First Looms", email: "dup@test.test" });

    const second = await app.inject({
      method: "POST",
      url: "/api/factories/sign-up",
      payload: {
        factoryName: "Second Looms",
        ownerName: "Other",
        email: "dup@test.test",
        password: "supersecret123",
      },
    });

    assert.equal(second.statusCode, 409);
    assert.equal(second.json<{ error: { code: string } }>().error.code, "EMAIL_TAKEN");
  });

  it("rejects a weak owner password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/factories/sign-up",
      payload: {
        factoryName: "Weak",
        ownerName: "Owner",
        email: "weak@test.test",
        password: "1234",
      },
    });

    assert.equal(response.statusCode, 400);
  });
});

describe("authentication", () => {
  it("refuses /api/me without a session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/me" });
    assert.equal(response.statusCode, 401);
  });

  it("does not expose a public sign-up endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: {
        name: "Sneaky",
        email: "sneaky@test.test",
        password: "supersecret123",
      },
    });

    assert.notEqual(response.statusCode, 200);
    const orphan = await prisma.user.findUnique({
      where: { email: "sneaky@test.test" },
    });
    assert.equal(orphan, null, "a user with no factory must never be created");
  });

  it("lets a worker sign in with phone and PIN", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });

    const created = await createWorker(app, owner, {
      name: "Suresh",
      phone: "+91 98765 43210",
      pin: "4321",
      wageType: "PER_INCH",
    });
    assert.equal(created.statusCode, 201);

    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/username",
      payload: { username: "9876543210", password: "4321" },
    });
    assert.equal(signIn.statusCode, 200);

    const raw = signIn.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : [String(raw)];
    const cookie = list.map((entry) => String(entry).split(";")[0]).join("; ");

    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie },
    });
    assert.equal(me.statusCode, 200);

    const { user } = me.json<{
      user: { role: string; factory: { id: string }; worker: { id: string } | null };
    }>();
    assert.equal(user.role, "WORKER");
    assert.equal(user.factory.id, owner.factoryId);
    assert.ok(user.worker, "the signed-in worker should be linked to a worker row");
  });

  it("rejects a wrong PIN", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    await createWorker(app, owner, {
      name: "Suresh",
      phone: "9876543210",
      pin: "4321",
    });

    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/username",
      payload: { username: "9876543210", password: "0000" },
    });

    assert.notEqual(signIn.statusCode, 200);
  });
});

describe("tenant isolation", () => {
  it("never shows one factory the workers of another", async () => {
    const shree = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });

    await createWorker(app, shree, { name: "Suresh", phone: "9876543210" });
    await createWorker(app, gupta, { name: "Mahesh", phone: "9876500000" });

    const guptaList = await app.inject({
      method: "GET",
      url: "/api/workers",
      headers: { cookie: gupta.cookie },
    });

    const { workers } = guptaList.json<{ workers: { name: string }[] }>();
    assert.equal(workers.length, 1);
    assert.equal(workers[0]?.name, "Mahesh");
  });

  it("cannot update another factory's worker even with its exact id", async () => {
    const shree = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });

    const created = await createWorker(app, shree, {
      name: "Suresh",
      phone: "9876543210",
    });
    const shreeWorkerId = created.json<{ worker: { id: string } }>().worker.id;

    const attempt = await app.inject({
      method: "PATCH",
      url: `/api/workers/${shreeWorkerId}`,
      headers: { cookie: gupta.cookie },
      payload: { trusted: true },
    });

    assert.equal(attempt.statusCode, 404);

    const untouched = await prisma.worker.findUniqueOrThrow({
      where: { id: shreeWorkerId },
    });
    assert.equal(untouched.trusted, false, "the worker must not have been changed");
  });

  it("stops the same phone getting a login at two factories", async () => {
    const shree = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });

    const first = await createWorker(app, shree, {
      name: "Suresh",
      phone: "9876543210",
      pin: "4321",
    });
    assert.equal(first.statusCode, 201);

    const second = await createWorker(app, gupta, {
      name: "Suresh again",
      phone: "9876543210",
      pin: "1111",
    });
    assert.equal(second.statusCode, 409);
  });
});

describe("roles", () => {
  it("stops a worker listing the factory's workers", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    await createWorker(app, owner, {
      name: "Suresh",
      phone: "9876543210",
      pin: "4321",
    });

    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/username",
      payload: { username: "9876543210", password: "4321" },
    });
    const raw = signIn.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : [String(raw)];
    const cookie = list.map((entry) => String(entry).split(";")[0]).join("; ");

    const response = await app.inject({
      method: "GET",
      url: "/api/workers",
      headers: { cookie },
    });

    assert.equal(response.statusCode, 403);
  });
});
