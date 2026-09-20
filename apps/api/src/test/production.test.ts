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

async function setupFactory() {
  const owner = await signUpFactory(app, {
    factoryName: "Shree Looms",
    email: "owner@shree.test",
  });
  const loomId = await createLoom(app, owner, "4");
  return { owner, loomId };
}

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

describe("looms", () => {
  it("refuses two looms with the same number in one factory", async () => {
    const { owner } = await setupFactory();

    const second = await app.inject({
      method: "POST",
      url: "/api/looms",
      headers: as(owner),
      payload: { number: "4" },
    });

    assert.equal(second.statusCode, 409);
  });

  it("lets two different factories both have a loom 4", async () => {
    await setupFactory();
    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });

    const loomId = await createLoom(app, gupta, "4");
    assert.ok(loomId);

    const list = await app.inject({
      method: "GET",
      url: "/api/looms",
      headers: as(gupta),
    });
    assert.equal(list.json<{ looms: unknown[] }>().looms.length, 1);
  });
});

describe("starting a saree", () => {
  it("keeps the wage on the job, so editing the saree type later cannot change it", async () => {
    const { owner, loomId } = await setupFactory();
    const workerId = await addWorker(owner, { name: "Ramesh", phone: "9876543210" });

    const response = await startSareeJob(app, owner, {
      loomId,
      lengthInches: 216,
      wageType: "PER_SAREE",
      wagePaise: 5_000_000,
      workerIds: [workerId],
    });

    assert.equal(response.statusCode, 201);
    const { sareeJob } = response.json<{
      sareeJob: { wagePaise: number; lengthInches: number; inchesDone: number };
    }>();
    assert.equal(sareeJob.wagePaise, 5_000_000);
    assert.equal(sareeJob.lengthInches, 216);
    assert.equal(sareeJob.inchesDone, 0);
  });

  it("refuses a second saree on a loom that is already busy", async () => {
    const { owner, loomId } = await setupFactory();
    const workerId = await addWorker(owner, { name: "Ramesh", phone: "9876543210" });

    const first = await startSareeJob(app, owner, {
      loomId,
      wageType: "PER_INCH",
      ratePerInchPaise: 30_000,
      workerIds: [workerId],
    });
    assert.equal(first.statusCode, 201);

    const second = await startSareeJob(app, owner, {
      loomId,
      wageType: "PER_INCH",
      ratePerInchPaise: 30_000,
      workerIds: [workerId],
    });
    assert.equal(second.statusCode, 409);
    assert.equal(second.json<{ error: { code: string } }>().error.code, "LOOM_BUSY");
  });

  it("refuses more than two weavers on one saree", async () => {
    const { owner, loomId } = await setupFactory();
    const a = await addWorker(owner, { name: "Ramesh", phone: "9876543210" });
    const b = await addWorker(owner, { name: "Mahesh", phone: "9876543211" });
    const c = await addWorker(owner, { name: "Suresh", phone: "9876543212" });

    const response = await startSareeJob(app, owner, {
      loomId,
      wageType: "PER_INCH",
      ratePerInchPaise: 30_000,
      workerIds: [a, b, c],
    });
    assert.equal(response.statusCode, 400);
  });
});

describe("weekly production entry", () => {
  async function runningJob(trusted: boolean) {
    const { owner, loomId } = await setupFactory();
    const workerId = await addWorker(owner, {
      name: "Suresh",
      phone: "9876543210",
      pin: "4321",
      trusted,
    });
    const job = await startSareeJob(app, owner, {
      loomId,
      lengthInches: 216,
      wageType: "PER_INCH",
      ratePerInchPaise: 30_000,
      workerIds: [workerId],
    });
    const sareeJobId = job.json<{ sareeJob: { id: string } }>().sareeJob.id;
    const workerCookie = await signInWorker(app, "9876543210", "4321");
    return { owner, sareeJobId, workerCookie, workerId };
  }

  it("files a trusted weaver's inches as approved straight away", async () => {
    const { sareeJobId, workerCookie } = await runningJob(true);

    const response = await fileEntry(app, workerCookie, sareeJobId, {
      weekStart: "2026-09-16",
      inches: 20,
    });

    assert.equal(response.statusCode, 201);
    const { entry } = response.json<{
      entry: { status: string; weekStart: string; ratePerInchPaise: number };
    }>();
    assert.equal(entry.status, "APPROVED");
    // Any day of the week is snapped back to that week's Monday.
    assert.equal(entry.weekStart, "2026-09-14");
    assert.equal(entry.ratePerInchPaise, 30_000);
  });

  it("holds an untrusted weaver's inches for the owner", async () => {
    const { owner, sareeJobId, workerCookie } = await runningJob(false);

    const filed = await fileEntry(app, workerCookie, sareeJobId, {
      weekStart: "2026-09-14",
      inches: 20,
    });
    assert.equal(filed.json<{ entry: { status: string } }>().entry.status, "AWAITING_OWNER");

    // Progress must not move until the owner has approved it.
    const before = await app.inject({
      method: "GET",
      url: "/api/saree-jobs",
      headers: as(owner),
    });
    assert.equal(
      before.json<{ sareeJobs: { inchesDone: number }[] }>().sareeJobs[0]?.inchesDone,
      0,
    );

    const queue = await app.inject({
      method: "GET",
      url: "/api/production-entries?status=AWAITING_OWNER",
      headers: as(owner),
    });
    const entryId = queue.json<{ entries: { id: string }[] }>().entries[0]?.id;
    assert.ok(entryId);

    const approved = await app.inject({
      method: "POST",
      url: `/api/production-entries/${entryId}/approve`,
      headers: as(owner),
      payload: {},
    });
    assert.equal(approved.statusCode, 200);

    const after = await app.inject({
      method: "GET",
      url: "/api/saree-jobs",
      headers: as(owner),
    });
    assert.equal(
      after.json<{ sareeJobs: { inchesDone: number }[] }>().sareeJobs[0]?.inchesDone,
      20,
    );
  });

  it("lets the owner correct the number while approving", async () => {
    const { owner, sareeJobId, workerCookie } = await runningJob(false);
    await fileEntry(app, workerCookie, sareeJobId, {
      weekStart: "2026-09-14",
      inches: 200,
    });

    const queue = await app.inject({
      method: "GET",
      url: "/api/production-entries?status=AWAITING_OWNER",
      headers: as(owner),
    });
    const entryId = queue.json<{ entries: { id: string }[] }>().entries[0]?.id;

    await app.inject({
      method: "POST",
      url: `/api/production-entries/${entryId}/approve`,
      headers: as(owner),
      payload: { inches: 20 },
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/saree-jobs",
      headers: as(owner),
    });
    assert.equal(
      list.json<{ sareeJobs: { inchesDone: number }[] }>().sareeJobs[0]?.inchesDone,
      20,
    );
  });

  it("records one week only once, so two weavers cannot file the same inches twice", async () => {
    const { owner, sareeJobId, workerCookie } = await runningJob(true);

    const first = await fileEntry(app, workerCookie, sareeJobId, {
      weekStart: "2026-09-14",
      inches: 20,
    });
    assert.equal(first.statusCode, 201);

    // The owner filing the same week must be refused too, not just the weaver.
    const second = await fileEntry(app, owner.cookie, sareeJobId, {
      weekStart: "2026-09-17",
      inches: 20,
    });
    assert.equal(second.statusCode, 409);
    assert.equal(
      second.json<{ error: { code: string } }>().error.code,
      "WEEK_ALREADY_FILED",
    );
  });

  it("refuses more inches than the saree has left, then accepts a confirmed overflow", async () => {
    const { owner, sareeJobId, workerCookie } = await runningJob(true);

    const tooMany = await fileEntry(app, workerCookie, sareeJobId, {
      weekStart: "2026-09-14",
      inches: 300,
    });
    assert.equal(tooMany.statusCode, 400);
    assert.equal(
      tooMany.json<{ error: { code: string } }>().error.code,
      "INCHES_EXCEED_LENGTH",
    );

    const confirmed = await fileEntry(app, owner.cookie, sareeJobId, {
      weekStart: "2026-09-14",
      inches: 300,
      allowOverflow: true,
    });
    assert.equal(confirmed.statusCode, 201);
  });

  it("stops a weaver filing against a saree they are not on", async () => {
    const { owner, loomId } = await setupFactory();
    const onJob = await addWorker(owner, { name: "Suresh", phone: "9876543210" });
    await addWorker(owner, {
      name: "Outsider",
      phone: "9876500000",
      pin: "1111",
      trusted: true,
    });

    const job = await startSareeJob(app, owner, {
      loomId,
      wageType: "PER_INCH",
      ratePerInchPaise: 30_000,
      workerIds: [onJob],
    });
    const sareeJobId = job.json<{ sareeJob: { id: string } }>().sareeJob.id;

    const outsiderCookie = await signInWorker(app, "9876500000", "1111");
    const response = await fileEntry(app, outsiderCookie, sareeJobId, {
      weekStart: "2026-09-14",
      inches: 20,
    });

    assert.equal(response.statusCode, 403);
  });
});

describe("shifting a weaver off a half-done saree", () => {
  it("works out their share from the inches woven", async () => {
    const { owner, loomId } = await setupFactory();
    const ramesh = await addWorker(owner, { name: "Ramesh", phone: "9876543210" });
    const mahesh = await addWorker(owner, { name: "Mahesh", phone: "9876500000" });

    const job = await startSareeJob(app, owner, {
      loomId,
      lengthInches: 216,
      wageType: "PER_SAREE",
      wagePaise: 5_000_000, // Rs 50,000
      workerIds: [ramesh],
    });
    const sareeJobId = job.json<{ sareeJob: { id: string } }>().sareeJob.id;

    // Half the saree: 108 of 216 inches.
    await fileEntry(app, owner.cookie, sareeJobId, {
      weekStart: "2026-09-14",
      inches: 108,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${sareeJobId}/shift-worker`,
      headers: as(owner),
      payload: { workerId: ramesh, replacementWorkerId: mahesh },
    });

    assert.equal(response.statusCode, 200);
    const { shift } = response.json<{
      shift: { inchesDone: number; lengthInches: number; earnedPaise: number };
    }>();

    assert.equal(shift.inchesDone, 108);
    assert.equal(shift.lengthInches, 216);
    // Half of Rs 50,000 is Rs 25,000.
    assert.equal(shift.earnedPaise, 2_500_000);

    // Mahesh has taken over, Ramesh is off the saree.
    const list = await app.inject({
      method: "GET",
      url: "/api/saree-jobs",
      headers: as(owner),
    });
    const workers = list.json<{ sareeJobs: { workers: { name: string }[] }[] }>()
      .sareeJobs[0]?.workers;
    assert.deepEqual(
      workers?.map((worker) => worker.name),
      ["Mahesh"],
    );
  });

  it("reports no share for a per-inch weaver, who is already paid entry by entry", async () => {
    const { owner, loomId } = await setupFactory();
    const suresh = await addWorker(owner, { name: "Suresh", phone: "9876543210" });

    const job = await startSareeJob(app, owner, {
      loomId,
      wageType: "PER_INCH",
      ratePerInchPaise: 30_000,
      workerIds: [suresh],
    });
    const sareeJobId = job.json<{ sareeJob: { id: string } }>().sareeJob.id;

    const response = await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${sareeJobId}/shift-worker`,
      headers: as(owner),
      payload: { workerId: suresh },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json<{ shift: { earnedPaise: null } }>().shift.earnedPaise, null);
  });
});

describe("tenant isolation on production", () => {
  it("hides one factory's sarees from another", async () => {
    const { owner, loomId } = await setupFactory();
    const workerId = await addWorker(owner, { name: "Suresh", phone: "9876543210" });
    const job = await startSareeJob(app, owner, {
      loomId,
      wageType: "PER_INCH",
      ratePerInchPaise: 30_000,
      workerIds: [workerId],
    });
    const sareeJobId = job.json<{ sareeJob: { id: string } }>().sareeJob.id;

    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/saree-jobs",
      headers: as(gupta),
    });
    assert.equal(list.json<{ sareeJobs: unknown[] }>().sareeJobs.length, 0);

    const finish = await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${sareeJobId}/finish`,
      headers: as(gupta),
      payload: {},
    });
    assert.equal(finish.statusCode, 404);

    const stillRunning = await prisma.sareeJob.findUniqueOrThrow({
      where: { id: sareeJobId },
    });
    assert.equal(stillRunning.status, "RUNNING");
  });
});
