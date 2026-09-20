import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../server.js";
import { prisma } from "../db/client.js";
import {
  as,
  createLoom,
  createWorker,
  fileEntry,
  resetDatabase,
  signInWorker,
  signUpFactory,
  startSareeJob,
  type SignedIn,
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

async function addWorker(
  owner: SignedIn,
  options: { name: string; phone: string; pin?: string; trusted?: boolean },
) {
  const response = await createWorker(app, owner, {
    name: options.name,
    phone: options.phone,
    wageType: "PER_INCH",
    trusted: options.trusted ?? false,
    ...(options.pin ? { pin: options.pin } : {}),
  });
  if (response.statusCode !== 201) {
    throw new Error(`add worker failed: ${response.statusCode} ${response.body}`);
  }
  return response.json<{ worker: { id: string } }>().worker.id;
}

describe("saree types", () => {
  it("stores a template without touching sarees already running", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/saree-types",
      headers: as(owner),
      payload: { name: "Paithani Red", lengthInches: 216, defaultWagePaise: 5_000_000 },
    });
    assert.equal(created.statusCode, 201);
    const typeId = created.json<{ sareeType: { id: string } }>().sareeType.id;

    const loomId = await createLoom(app, owner, "4");
    const workerId = await addWorker(owner, { name: "Ramesh", phone: "9876543210" });

    const job = await startSareeJob(app, owner, {
      loomId,
      sareeTypeId: typeId,
      lengthInches: 216,
      wageType: "PER_SAREE",
      wagePaise: 5_000_000,
      workerIds: [workerId],
    });
    assert.equal(job.statusCode, 201);

    // Raising the template's wage must not raise what this weaver is owed.
    await app.inject({
      method: "PATCH",
      url: `/api/saree-types/${typeId}`,
      headers: as(owner),
      payload: { defaultWagePaise: 9_000_000 },
    });

    const running = await app.inject({
      method: "GET",
      url: "/api/saree-jobs",
      headers: as(owner),
    });
    assert.equal(
      running.json<{ sareeJobs: { wagePaise: number }[] }>().sareeJobs[0]?.wagePaise,
      5_000_000,
    );
  });

  it("refuses two saree types with the same name", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });

    const payload = { name: "Paithani Red", lengthInches: 216 };
    await app.inject({
      method: "POST",
      url: "/api/saree-types",
      headers: as(owner),
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/saree-types",
      headers: as(owner),
      payload,
    });

    assert.equal(second.statusCode, 409);
  });

  it("hides one factory's saree types from another", async () => {
    const shree = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });

    await app.inject({
      method: "POST",
      url: "/api/saree-types",
      headers: as(shree),
      payload: { name: "Paithani Red", lengthInches: 216 },
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/saree-types",
      headers: as(gupta),
    });
    assert.equal(list.json<{ sareeTypes: unknown[] }>().sareeTypes.length, 0);
  });
});

describe("production report", () => {
  it("totals by week, by loom and by weaver", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });

    const loomA = await createLoom(app, owner, "4");
    const loomB = await createLoom(app, owner, "7");
    const ramesh = await addWorker(owner, { name: "Ramesh", phone: "9876543210" });
    const mahesh = await addWorker(owner, { name: "Mahesh", phone: "9876500000" });

    const jobA = (
      await startSareeJob(app, owner, {
        loomId: loomA,
        wageType: "PER_INCH",
        ratePerInchPaise: 30_000,
        workerIds: [ramesh],
      })
    ).json<{ sareeJob: { id: string } }>().sareeJob.id;

    // Two weavers share this loom, so its inches split half and half.
    const jobB = (
      await startSareeJob(app, owner, {
        loomId: loomB,
        wageType: "PER_INCH",
        ratePerInchPaise: 30_000,
        workerIds: [ramesh, mahesh],
      })
    ).json<{ sareeJob: { id: string } }>().sareeJob.id;

    await fileEntry(app, owner.cookie, jobA, { weekStart: "2026-09-14", inches: 20 });
    await fileEntry(app, owner.cookie, jobA, { weekStart: "2026-09-21", inches: 10 });
    await fileEntry(app, owner.cookie, jobB, { weekStart: "2026-09-14", inches: 25 });

    const report = await app.inject({
      method: "GET",
      url: "/api/reports/production?from=2026-09-14&to=2026-09-27",
      headers: as(owner),
    });
    assert.equal(report.statusCode, 200);

    const body = report.json<{
      totalInches: number;
      byWeek: { weekStart: string; inches: number }[];
      byLoom: { number: string; inches: number }[];
      byWorker: { name: string; inches: number }[];
    }>();

    assert.equal(body.totalInches, 55);

    assert.deepEqual(body.byWeek, [
      { weekStart: "2026-09-14", inches: 45 },
      { weekStart: "2026-09-21", inches: 10 },
    ]);

    const loom4 = body.byLoom.find((row) => row.number === "4");
    const loom7 = body.byLoom.find((row) => row.number === "7");
    assert.equal(loom4?.inches, 30);
    assert.equal(loom7?.inches, 25);

    // Ramesh: all 30 of his own loom plus half of the shared 25.
    const rameshRow = body.byWorker.find((row) => row.name === "Ramesh");
    const maheshRow = body.byWorker.find((row) => row.name === "Mahesh");
    assert.equal(rameshRow?.inches, 42.5);
    assert.equal(maheshRow?.inches, 12.5);
  });

  it("leaves out entries the owner has not approved", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const loomId = await createLoom(app, owner, "4");
    await addWorker(owner, {
      name: "Suresh",
      phone: "9876543210",
      pin: "4321",
      trusted: false,
    });
    const workers = await app.inject({
      method: "GET",
      url: "/api/workers",
      headers: as(owner),
    });
    const workerId = workers.json<{ workers: { id: string }[] }>().workers[0]!.id;

    const jobId = (
      await startSareeJob(app, owner, {
        loomId,
        wageType: "PER_INCH",
        ratePerInchPaise: 30_000,
        workerIds: [workerId],
      })
    ).json<{ sareeJob: { id: string } }>().sareeJob.id;

    const workerCookie = await signInWorker(app, "9876543210", "4321");
    await fileEntry(app, workerCookie, jobId, { weekStart: "2026-09-14", inches: 20 });

    const report = await app.inject({
      method: "GET",
      url: "/api/reports/production?from=2026-09-01&to=2026-09-30",
      headers: as(owner),
    });

    assert.equal(report.json<{ totalInches: number }>().totalInches, 0);
  });

  it("refuses a range that runs backwards", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });

    const report = await app.inject({
      method: "GET",
      url: "/api/reports/production?from=2026-09-30&to=2026-09-01",
      headers: as(owner),
    });

    assert.equal(report.statusCode, 400);
  });
});
