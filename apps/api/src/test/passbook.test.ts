/**
 * The passbook, tested with the owner's own examples from planning. Every
 * number here was given by the owner; the comments say which rule it checks.
 *
 * Amounts are in paise: Rs 50,000 is 5_000_000.
 */
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

const rupees = (value: number) => value * 100;

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

type Passbook = {
  oldBalancePaise: number;
  currentWorkPaise: number;
  netPaise: number;
  currentWork: { sareeJobId: string; balancePaise: number; stillOnIt: boolean }[];
  lines: { kind: string; section: string; amountPaise: number; groupId: string }[];
};

async function passbookOf(session: SignedIn | string, workerId: string) {
  const response = await app.inject({
    method: "GET",
    url: `/api/workers/${workerId}/passbook`,
    headers: as(session),
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<{ passbook: Passbook }>().passbook;
}

function sareeBalance(passbook: Passbook, sareeJobId: string) {
  return passbook.currentWork.find((saree) => saree.sareeJobId === sareeJobId)
    ?.balancePaise;
}

async function pay(
  owner: SignedIn,
  workerId: string,
  body: { sareeJobId: string; workAmountPaise: number; cutForAdvancePaise?: number },
) {
  return app.inject({
    method: "POST",
    url: `/api/workers/${workerId}/payments`,
    headers: as(owner),
    payload: body,
  });
}

async function advance(owner: SignedIn, workerId: string, amountPaise: number) {
  const response = await app.inject({
    method: "POST",
    url: `/api/workers/${workerId}/advances`,
    headers: as(owner),
    payload: { amountPaise },
  });
  assert.equal(response.statusCode, 201, response.body);
}

async function setup() {
  const owner = await signUpFactory(app, {
    factoryName: "Shree Looms",
    email: "owner@shree.test",
  });
  const loomA = await createLoom(app, owner, "4");
  const loomB = await createLoom(app, owner, "7");
  return { owner, loomA, loomB };
}

async function addWorker(
  owner: SignedIn,
  name: string,
  phone: string,
  extra: Record<string, unknown> = {},
) {
  const response = await createWorker(app, owner, { name, phone, ...extra });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ worker: { id: string } }>().worker.id;
}

async function startSaree(owner: SignedIn, body: Record<string, unknown>) {
  const response = await startSareeJob(app, owner, body);
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ sareeJob: { id: string } }>().sareeJob.id;
}

describe("per-saree khata", () => {
  it("owes the whole wage from the start and counts it down with each payment", async () => {
    const { owner, loomA } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh],
    });

    // Rs 50,000 -> pay 5,000 -> 45,000 -> pay 7,000 -> 38,000.
    assert.equal(sareeBalance(await passbookOf(owner, ramesh), saree), rupees(50_000));

    await pay(owner, ramesh, { sareeJobId: saree, workAmountPaise: rupees(5_000) });
    assert.equal(sareeBalance(await passbookOf(owner, ramesh), saree), rupees(45_000));

    await pay(owner, ramesh, { sareeJobId: saree, workAmountPaise: rupees(7_000) });
    assert.equal(sareeBalance(await passbookOf(owner, ramesh), saree), rupees(38_000));
  });

  it("keeps an advance in the old balance and leaves the saree's wage alone", async () => {
    const { owner, loomA } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh],
    });

    await advance(owner, ramesh, rupees(20_000));

    const book = await passbookOf(owner, ramesh);
    assert.equal(sareeBalance(book, saree), rupees(50_000), "the saree is untouched");
    assert.equal(book.oldBalancePaise, -rupees(20_000), "the weaver owes the advance");
  });

  it("splits the wage half and half between two weavers", async () => {
    const { owner, loomA } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const mahesh = await addWorker(owner, "Mahesh", "9876500000");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh, mahesh],
    });

    assert.equal(sareeBalance(await passbookOf(owner, ramesh), saree), rupees(25_000));
    assert.equal(sareeBalance(await passbookOf(owner, mahesh), saree), rupees(25_000));
  });
});

describe("per-inch khata", () => {
  it("earns inches times the rate when an entry is approved, split half and half", async () => {
    const { owner, loomA } = await setup();
    const suresh = await addWorker(owner, "Suresh", "9876543210");
    const mahesh = await addWorker(owner, "Mahesh", "9876500000");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_INCH",
      ratePerInchPaise: rupees(300),
      workerIds: [suresh, mahesh],
    });

    // 20 inches x Rs 300 = Rs 6,000, so Rs 3,000 each.
    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-14", inches: 20 });

    assert.equal(sareeBalance(await passbookOf(owner, suresh), saree), rupees(3_000));
    assert.equal(sareeBalance(await passbookOf(owner, mahesh), saree), rupees(3_000));
  });

  it("pays nothing for an entry still waiting for the owner, then the corrected number once approved", async () => {
    const { owner, loomA } = await setup();
    const suresh = await addWorker(owner, "Suresh", "9876543210", {
      pin: "4321",
      trusted: false,
    });
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_INCH",
      ratePerInchPaise: rupees(100),
      workerIds: [suresh],
    });

    const weaver = await signInWorker(app, "9876543210", "4321");
    await fileEntry(app, weaver, saree, { weekStart: "2026-09-14", inches: 200 });
    assert.equal(sareeBalance(await passbookOf(owner, suresh), saree) ?? 0, 0);

    const queue = await app.inject({
      method: "GET",
      url: "/api/production-entries?status=AWAITING_OWNER",
      headers: as(owner),
    });
    const entryId = queue.json<{ entries: { id: string }[] }>().entries[0]!.id;
    await app.inject({
      method: "POST",
      url: `/api/production-entries/${entryId}/approve`,
      headers: as(owner),
      payload: { inches: 50 },
    });

    // Paid on the 50 the owner approved, not the 200 that was filed.
    assert.equal(sareeBalance(await passbookOf(owner, suresh), saree), rupees(5_000));
  });

  it("will not remove an entry once it has paid someone", async () => {
    const { owner, loomA } = await setup();
    const suresh = await addWorker(owner, "Suresh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_INCH",
      ratePerInchPaise: rupees(100),
      workerIds: [suresh],
    });
    const filed = await fileEntry(app, owner.cookie, saree, {
      weekStart: "2026-09-14",
      inches: 10,
    });
    const entryId = filed.json<{ entry: { id: string } }>().entry.id;

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/production-entries/${entryId}`,
      headers: as(owner),
    });

    assert.equal(removed.statusCode, 409);
    assert.equal(sareeBalance(await passbookOf(owner, suresh), saree), rupees(1_000));
  });
});

describe("paying with a cut for advance", () => {
  it("counts the cut as paid, so the work is cleared and nothing is left owing", async () => {
    // The owner's own example: Rs 100 an inch, a Rs 20,000 advance, 50 inches
    // woven this month. Pay Rs 3,000 cash and cut Rs 2,000 from the advance.
    // It must NOT show the owner still owing Rs 2,000.
    const { owner, loomA } = await setup();
    const suresh = await addWorker(owner, "Suresh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_INCH",
      ratePerInchPaise: rupees(100),
      workerIds: [suresh],
    });
    await advance(owner, suresh, rupees(20_000));
    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-14", inches: 50 });

    const paid = await pay(owner, suresh, {
      sareeJobId: saree,
      workAmountPaise: rupees(5_000),
      cutForAdvancePaise: rupees(2_000),
    });
    assert.equal(paid.statusCode, 201, paid.body);
    assert.deepEqual(
      paid.json<{ payment: { cashPaise: number; cutPaise: number } }>().payment,
      {
        cashPaise: rupees(3_000),
        cutPaise: rupees(2_000),
        groupId: paid.json<{ payment: { groupId: string } }>().payment.groupId,
      },
    );

    const book = await passbookOf(owner, suresh);
    assert.equal(sareeBalance(book, saree), 0, "the month's work is fully paid");
    assert.equal(book.oldBalancePaise, -rupees(18_000), "the advance went down by the cut");

    // The cash, the cut against the work and the cut against the advance were
    // written together, as one payment.
    const group = book.lines.filter(
      (line) => line.groupId === book.lines.find((l) => l.kind === "PAYMENT_CASH")!.groupId,
    );
    assert.deepEqual(group.map((line) => line.kind).sort(), [
      "ADVANCE_CUT",
      "PAYMENT_BY_ADVANCE_CUT",
      "PAYMENT_CASH",
    ]);
  });

  it("lets the cut be zero, leaving the advance where it was", async () => {
    const { owner, loomA } = await setup();
    const suresh = await addWorker(owner, "Suresh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_INCH",
      ratePerInchPaise: rupees(100),
      workerIds: [suresh],
    });
    await advance(owner, suresh, rupees(20_000));
    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-14", inches: 50 });

    await pay(owner, suresh, { sareeJobId: saree, workAmountPaise: rupees(5_000) });

    const book = await passbookOf(owner, suresh);
    assert.equal(sareeBalance(book, saree), 0);
    assert.equal(book.oldBalancePaise, -rupees(20_000));
  });

  it("refuses to cut more advance than the weaver owes", async () => {
    const { owner, loomA } = await setup();
    const suresh = await addWorker(owner, "Suresh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [suresh],
    });
    await advance(owner, suresh, rupees(1_000));

    const response = await pay(owner, suresh, {
      sareeJobId: saree,
      workAmountPaise: rupees(5_000),
      cutForAdvancePaise: rupees(2_000),
    });

    assert.equal(response.statusCode, 400);
    assert.equal(
      response.json<{ error: { code: string } }>().error.code,
      "CUT_MORE_THAN_ADVANCE",
    );
    const book = await passbookOf(owner, suresh);
    assert.equal(sareeBalance(book, saree), rupees(50_000), "nothing was written");
    assert.equal(book.oldBalancePaise, -rupees(1_000));
  });

  it("refuses a cut bigger than the payment itself", async () => {
    const { owner, loomA } = await setup();
    const suresh = await addWorker(owner, "Suresh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [suresh],
    });
    await advance(owner, suresh, rupees(20_000));

    const response = await pay(owner, suresh, {
      sareeJobId: saree,
      workAmountPaise: rupees(1_000),
      cutForAdvancePaise: rupees(2_000),
    });

    assert.equal(response.statusCode, 400);
  });
});

describe("shifting a weaver off a half-done saree", () => {
  async function halfWoven(paidRupees: number) {
    const { owner, loomA, loomB } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      lengthInches: 216,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh],
    });
    await pay(owner, ramesh, { sareeJobId: saree, workAmountPaise: rupees(paidRupees) });
    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-14", inches: 108 });
    return { owner, loomB, ramesh, saree };
  }

  async function shift(owner: SignedIn, saree: string, body: Record<string, unknown>) {
    const response = await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${saree}/shift-worker`,
      headers: as(owner),
      payload: body,
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<{
      shift: { earnedPaise: number; paidPaise: number; carriedPaise: number };
    }>().shift;
  }

  it("moves what the owner still owes to the old balance (paid Rs 20,000 of Rs 25,000 earned)", async () => {
    const { owner, ramesh, saree } = await halfWoven(20_000);

    const result = await shift(owner, saree, { workerId: ramesh });

    // 108 of 216 inches of Rs 50,000 is Rs 25,000 earned.
    assert.equal(result.earnedPaise, rupees(25_000));
    assert.equal(result.paidPaise, rupees(20_000));
    assert.equal(result.carriedPaise, rupees(5_000));

    const book = await passbookOf(owner, ramesh);
    assert.equal(sareeBalance(book, saree), 0, "nothing is left on the old saree");
    assert.equal(book.oldBalancePaise, rupees(5_000), "the owner owes Rs 5,000");
  });

  it("moves what the weaver took extra to the old balance (paid Rs 30,000 of Rs 25,000 earned)", async () => {
    const { owner, ramesh, saree } = await halfWoven(30_000);

    const result = await shift(owner, saree, { workerId: ramesh });

    assert.equal(result.carriedPaise, -rupees(5_000));
    const book = await passbookOf(owner, ramesh);
    assert.equal(sareeBalance(book, saree), 0);
    assert.equal(book.oldBalancePaise, -rupees(5_000), "the weaver owes Rs 5,000");
  });

  it("starts the weaver's next saree clean at its own wage", async () => {
    // The owner was explicit: the Rs 5,000 left over must not be added into
    // the next saree. It waits in the old balance instead.
    const { owner, loomB, ramesh, saree } = await halfWoven(20_000);
    await shift(owner, saree, { workerId: ramesh });

    const next = await startSaree(owner, {
      loomId: loomB,
      wageType: "PER_SAREE",
      wagePaise: rupees(40_000),
      workerIds: [ramesh],
    });

    const book = await passbookOf(owner, ramesh);
    assert.equal(sareeBalance(book, next), rupees(40_000), "not Rs 45,000");
    assert.equal(book.oldBalancePaise, rupees(5_000));
  });

  it("gives a shared saree's leaving weaver their half, and hands the rest to the replacement", async () => {
    const { owner, loomA } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const mahesh = await addWorker(owner, "Mahesh", "9876500000");
    const ganesh = await addWorker(owner, "Ganesh", "9876511111");
    const saree = await startSaree(owner, {
      loomId: loomA,
      lengthInches: 216,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh, mahesh],
    });
    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-14", inches: 108 });

    const result = await shift(owner, saree, {
      workerId: ramesh,
      replacementWorkerId: ganesh,
    });

    // Ramesh held Rs 25,000 (half) and wove half of it: Rs 12,500, not 25,000.
    assert.equal(result.earnedPaise, rupees(12_500));

    const rameshBook = await passbookOf(owner, ramesh);
    assert.equal(rameshBook.oldBalancePaise, rupees(12_500));

    // Ganesh takes the Rs 12,500 Ramesh did not weave.
    assert.equal(sareeBalance(await passbookOf(owner, ganesh), saree), rupees(12_500));
    // Mahesh is untouched.
    assert.equal(sareeBalance(await passbookOf(owner, mahesh), saree), rupees(25_000));
  });

  it("gives the unwoven half to the weaver who carries on alone when nobody replaces", async () => {
    // The owner's rule: the one who finishes it gets it.
    const { owner, loomA } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const mahesh = await addWorker(owner, "Mahesh", "9876500000");
    const saree = await startSaree(owner, {
      loomId: loomA,
      lengthInches: 216,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh, mahesh],
    });
    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-14", inches: 108 });

    const result = await shift(owner, saree, { workerId: ramesh });
    assert.equal(result.earnedPaise, rupees(12_500));

    // Mahesh held Rs 25,000 and now also Ramesh's unwoven Rs 12,500.
    assert.equal(sareeBalance(await passbookOf(owner, mahesh), saree), rupees(37_500));
  });

  it("still pays exactly if the weaver who carried on is shifted off later too", async () => {
    // Mahesh inherits at inch 108 and leaves at 162. He has earned his own
    // half up to 162 (Rs 18,750) and Ramesh's half from 108 to 162 (Rs 6,250):
    // Rs 25,000. Without re-basing his share it would come out at Rs 28,125.
    const { owner, loomA } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const mahesh = await addWorker(owner, "Mahesh", "9876500000");
    const saree = await startSaree(owner, {
      loomId: loomA,
      lengthInches: 216,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh, mahesh],
    });
    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-14", inches: 108 });
    await shift(owner, saree, { workerId: ramesh });

    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-21", inches: 54 });
    const second = await shift(owner, saree, { workerId: mahesh });

    assert.equal(second.earnedPaise, rupees(25_000));
  });

  it("pays the unwoven part to nobody when the only weaver leaves and nobody replaces him", async () => {
    const { owner, ramesh, saree } = await halfWoven(20_000);

    await shift(owner, saree, { workerId: ramesh });

    // Only what was woven is owed to anyone for this saree now.
    const credited = await prisma.ledgerLine.aggregate({
      where: {
        sareeJobId: saree,
        kind: { in: ["WORK_EARNED", "SHIFT_ADJUSTMENT"] },
      },
      _sum: { amountPaise: true },
    });
    assert.equal(credited._sum.amountPaise, rupees(25_000));
  });

  it("shows the owner the same numbers before he agrees as it saves after", async () => {
    const { owner, ramesh, saree } = await halfWoven(20_000);

    const preview = await app.inject({
      method: "GET",
      url: `/api/saree-jobs/${saree}/shift-preview?workerId=${ramesh}`,
      headers: as(owner),
    });
    assert.equal(preview.statusCode, 200);
    const shown = preview.json<{ preview: { earnedPaise: number; carriedPaise: number } }>()
      .preview;

    const saved = await shift(owner, saree, { workerId: ramesh });

    assert.equal(shown.earnedPaise, saved.earnedPaise);
    assert.equal(shown.carriedPaise, saved.carriedPaise);
  });
});

describe("settling the old balance", () => {
  it("pays off what the owner owes from an old saree", async () => {
    const { owner, loomA } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      lengthInches: 216,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh],
    });
    await pay(owner, ramesh, { sareeJobId: saree, workAmountPaise: rupees(20_000) });
    await fileEntry(app, owner.cookie, saree, { weekStart: "2026-09-14", inches: 108 });
    await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${saree}/shift-worker`,
      headers: as(owner),
      payload: { workerId: ramesh },
    });

    const tooMuch = await app.inject({
      method: "POST",
      url: `/api/workers/${ramesh}/old-balance-settlements`,
      headers: as(owner),
      payload: { amountPaise: rupees(6_000) },
    });
    assert.equal(tooMuch.statusCode, 400);

    const settled = await app.inject({
      method: "POST",
      url: `/api/workers/${ramesh}/old-balance-settlements`,
      headers: as(owner),
      payload: { amountPaise: rupees(5_000) },
    });
    assert.equal(settled.statusCode, 201, settled.body);
    assert.equal((await passbookOf(owner, ramesh)).oldBalancePaise, 0);
  });
});

describe("the owner's summary", () => {
  it("adds up what is owed for sarees and what is out on advance", async () => {
    const { owner, loomA, loomB } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const suresh = await addWorker(owner, "Suresh", "9876500000");
    await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh],
    });
    await startSaree(owner, {
      loomId: loomB,
      wageType: "PER_SAREE",
      wagePaise: rupees(40_000),
      workerIds: [suresh],
    });
    await advance(owner, ramesh, rupees(10_000));
    await advance(owner, suresh, rupees(5_000));

    const response = await app.inject({
      method: "GET",
      url: "/api/passbook/summary",
      headers: as(owner),
    });
    const { summary } = response.json<{
      summary: { currentWorkPaise: number; advancesOutPaise: number };
    }>();

    assert.equal(summary.currentWorkPaise, rupees(90_000));
    assert.equal(summary.advancesOutPaise, rupees(15_000));
  });
});

describe("who can see and move money", () => {
  it("lets a weaver read their own passbook but not pay themselves or read anyone else's", async () => {
    const { owner, loomA } = await setup();
    const suresh = await addWorker(owner, "Suresh", "9876543210", { pin: "4321" });
    const mahesh = await addWorker(owner, "Mahesh", "9876500000");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [suresh],
    });
    const weaver = await signInWorker(app, "9876543210", "4321");

    const own = await app.inject({
      method: "GET",
      url: "/api/my/passbook",
      headers: { cookie: weaver },
    });
    assert.equal(own.statusCode, 200);
    assert.equal(own.json<{ passbook: Passbook }>().passbook.netPaise, rupees(50_000));

    const other = await app.inject({
      method: "GET",
      url: `/api/workers/${mahesh}/passbook`,
      headers: { cookie: weaver },
    });
    assert.equal(other.statusCode, 403);

    const selfPay = await app.inject({
      method: "POST",
      url: `/api/workers/${suresh}/payments`,
      headers: { cookie: weaver },
      payload: { sareeJobId: saree, workAmountPaise: rupees(1_000) },
    });
    assert.equal(selfPay.statusCode, 403);
  });

  it("keeps one factory out of another's passbooks", async () => {
    const { owner, loomA } = await setup();
    const ramesh = await addWorker(owner, "Ramesh", "9876543210");
    const saree = await startSaree(owner, {
      loomId: loomA,
      wageType: "PER_SAREE",
      wagePaise: rupees(50_000),
      workerIds: [ramesh],
    });
    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });

    const read = await app.inject({
      method: "GET",
      url: `/api/workers/${ramesh}/passbook`,
      headers: as(gupta),
    });
    assert.equal(read.statusCode, 404);

    const payment = await pay(gupta, ramesh, {
      sareeJobId: saree,
      workAmountPaise: rupees(1_000),
    });
    assert.equal(payment.statusCode, 404);

    assert.equal(
      sareeBalance(await passbookOf(owner, ramesh), saree),
      rupees(50_000),
      "nothing was paid out of Shree's weaver",
    );
  });
});
