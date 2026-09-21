/**
 * Stock, tested with the owner's own example from planning: 30 kg of silk at
 * Rs 4,500 a kg and 40 bundles of zari at Rs 800, then 2 kg and 3 bundles
 * handed to a saree, which comes to Rs 11,400 of material.
 *
 * Quantities are thousandths of a unit (2 kg is 2000) and money is paise.
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
  resetDatabase,
  signInWorker,
  signUpFactory,
  startSareeJob,
  type SignedIn,
} from "./helpers.js";

const rupees = (value: number) => value * 100;
const units = (value: number) => value * 1000;

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

type Material = {
  id: string;
  name: string;
  onHandMilli: number;
  averageUnitPricePaise: number | null;
  valuePaise: number | null;
  isLow: boolean;
};

async function material(
  owner: SignedIn,
  name: string,
  unit: "KG" | "BUNDLE",
  lowStockAtMilli?: number,
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/materials",
    headers: as(owner),
    payload: { name, unit, ...(lowStockAtMilli === undefined ? {} : { lowStockAtMilli }) },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ material: { id: string } }>().material.id;
}

async function buy(
  owner: SignedIn,
  materialId: string,
  quantityMilli: number,
  costPaise?: number,
) {
  const response = await app.inject({
    method: "POST",
    url: `/api/materials/${materialId}/purchases`,
    headers: as(owner),
    payload: { quantityMilli, ...(costPaise === undefined ? {} : { costPaise }) },
  });
  assert.equal(response.statusCode, 201, response.body);
}

async function stock(owner: SignedIn) {
  const response = await app.inject({
    method: "GET",
    url: "/api/materials",
    headers: as(owner),
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<{ materials: Material[] }>().materials;
}

async function onHand(owner: SignedIn, materialId: string) {
  return (await stock(owner)).find((row) => row.id === materialId)!.onHandMilli;
}

async function sareeCost(owner: SignedIn, sareeJobId: string) {
  const response = await app.inject({
    method: "GET",
    url: `/api/saree-jobs/${sareeJobId}/materials`,
    headers: as(owner),
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<{ totalCostPaise: number | null }>().totalCostPaise;
}

async function setup() {
  const owner = await signUpFactory(app, {
    factoryName: "Shree Looms",
    email: "owner@shree.test",
  });
  const loomId = await createLoom(app, owner, "4");
  const worker = await createWorker(app, owner, {
    name: "Suresh",
    phone: "9876543210",
    pin: "4321",
  });
  const workerId = worker.json<{ worker: { id: string } }>().worker.id;
  const silk = await material(owner, "Silk yarn", "KG");
  const zari = await material(owner, "Zari", "BUNDLE");
  // The owner's bulk purchase: 30 kg at Rs 4,500, 40 bundles at Rs 800.
  await buy(owner, silk, units(30), rupees(135_000));
  await buy(owner, zari, units(40), rupees(32_000));
  return { owner, loomId, workerId, silk, zari };
}

async function startWith(
  owner: SignedIn,
  loomId: string,
  workerId: string,
  materials: { materialId: string; quantityMilli: number }[],
) {
  return startSareeJob(app, owner, {
    loomId,
    wageType: "PER_SAREE",
    wagePaise: rupees(50_000),
    workerIds: [workerId],
    materials,
  });
}

describe("buying and giving out material", () => {
  it("hands material to a saree as it starts and takes it out of stock", async () => {
    const { owner, loomId, workerId, silk, zari } = await setup();

    const started = await startWith(owner, loomId, workerId, [
      { materialId: silk, quantityMilli: units(2) },
      { materialId: zari, quantityMilli: units(3) },
    ]);
    assert.equal(started.statusCode, 201, started.body);
    const saree = started.json<{ sareeJob: { id: string } }>().sareeJob.id;

    // 30 kg -> 28 kg, 40 bundles -> 37 bundles.
    assert.equal(await onHand(owner, silk), units(28));
    assert.equal(await onHand(owner, zari), units(37));

    // 2 x Rs 4,500 + 3 x Rs 800 = Rs 11,400.
    assert.equal(await sareeCost(owner, saree), rupees(11_400));
  });

  it("will not start a saree with more material than is in stock, and leaves nothing half done", async () => {
    const { owner, loomId, workerId, silk, zari } = await setup();

    const refused = await startWith(owner, loomId, workerId, [
      { materialId: zari, quantityMilli: units(3) },
      { materialId: silk, quantityMilli: units(31) },
    ]);
    assert.equal(refused.statusCode, 409);
    assert.equal(
      refused.json<{ error: { code: string } }>().error.code,
      "NOT_ENOUGH_STOCK",
    );

    // No saree, and the zari handed over before the silk failed came back too.
    assert.equal(await prisma.sareeJob.count(), 0);
    assert.equal(await onHand(owner, zari), units(40));
  });

  it("adds more material to a saree already on the loom", async () => {
    const { owner, loomId, workerId, silk } = await setup();
    const saree = (
      await startWith(owner, loomId, workerId, [{ materialId: silk, quantityMilli: units(2) }])
    ).json<{ sareeJob: { id: string } }>().sareeJob.id;

    const more = await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${saree}/materials/give`,
      headers: as(owner),
      payload: { materialId: silk, quantityMilli: units(1) },
    });
    assert.equal(more.statusCode, 201, more.body);

    assert.equal(await onHand(owner, silk), units(27));
    assert.equal(await sareeCost(owner, saree), rupees(13_500));
  });

  it("prices material at the average paid across purchases", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const silk = await material(owner, "Silk yarn", "KG");
    await buy(owner, silk, units(10), rupees(40_000)); // Rs 4,000 a kg
    await buy(owner, silk, units(10), rupees(50_000)); // Rs 5,000 a kg

    const row = (await stock(owner)).find((item) => item.id === silk)!;
    assert.equal(row.averageUnitPricePaise, rupees(4_500));
    assert.equal(row.valuePaise, rupees(90_000));
  });

  it("accepts opening stock with no price, and says the cost is unknown rather than zero", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const loomId = await createLoom(app, owner, "4");
    const worker = await createWorker(app, owner, { name: "Suresh", phone: "9876543210" });
    const workerId = worker.json<{ worker: { id: string } }>().worker.id;
    const silk = await material(owner, "Silk yarn", "KG");
    await buy(owner, silk, units(5));

    const saree = (
      await startWith(owner, loomId, workerId, [{ materialId: silk, quantityMilli: units(1) }])
    ).json<{ sareeJob: { id: string } }>().sareeJob.id;

    assert.equal(await onHand(owner, silk), units(4));
    assert.equal(await sareeCost(owner, saree), null);
  });
});

describe("returning leftovers", () => {
  it("puts them back in stock at what the saree was charged, so returning everything costs nothing", async () => {
    const { owner, loomId, workerId, silk } = await setup();
    const saree = (
      await startWith(owner, loomId, workerId, [{ materialId: silk, quantityMilli: units(2) }])
    ).json<{ sareeJob: { id: string } }>().sareeJob.id;

    // Silk gets dearer after it was handed out.
    await buy(owner, silk, units(10), rupees(60_000));

    const back = await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${saree}/materials/return`,
      headers: as(owner),
      payload: { materialId: silk, quantityMilli: units(2) },
    });
    assert.equal(back.statusCode, 201, back.body);

    assert.equal(await onHand(owner, silk), units(40));
    assert.equal(await sareeCost(owner, saree), 0);
  });

  it("will not take back more than the saree was given", async () => {
    const { owner, loomId, workerId, silk } = await setup();
    const saree = (
      await startWith(owner, loomId, workerId, [{ materialId: silk, quantityMilli: units(2) }])
    ).json<{ sareeJob: { id: string } }>().sareeJob.id;

    const tooMuch = await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${saree}/materials/return`,
      headers: as(owner),
      payload: { materialId: silk, quantityMilli: units(3) },
    });
    assert.equal(tooMuch.statusCode, 400);
    assert.equal(await onHand(owner, silk), units(28));
  });
});

describe("material the weaver bought himself", () => {
  async function weaverBuys(
    owner: SignedIn,
    saree: string,
    body: Record<string, unknown>,
  ) {
    return app.inject({
      method: "POST",
      url: `/api/saree-jobs/${saree}/materials/bought-by-weaver`,
      headers: as(owner),
      payload: body,
    });
  }

  async function oldBalance(owner: SignedIn, workerId: string) {
    const response = await app.inject({
      method: "GET",
      url: `/api/workers/${workerId}/passbook`,
      headers: as(owner),
    });
    return response.json<{ passbook: { oldBalancePaise: number } }>().passbook
      .oldBalancePaise;
  }

  it("adds to the saree's cost without touching stock, and owes it in his passbook", async () => {
    // The owner's example: 2 bundles of zari bought for Rs 1,600.
    const { owner, loomId, workerId, zari } = await setup();
    const saree = (await startWith(owner, loomId, workerId, [])).json<{
      sareeJob: { id: string };
    }>().sareeJob.id;

    const recorded = await weaverBuys(owner, saree, {
      materialId: zari,
      quantityMilli: units(2),
      costPaise: rupees(1_600),
      workerId,
      reimbursement: "INTO_PASSBOOK",
    });
    assert.equal(recorded.statusCode, 201, recorded.body);

    assert.equal(await onHand(owner, zari), units(40), "the store room is untouched");
    assert.equal(await sareeCost(owner, saree), rupees(1_600));
    assert.equal(await oldBalance(owner, workerId), rupees(1_600), "the owner owes him");
  });

  it("leaves the passbook alone when he is paid back in cash on the spot", async () => {
    const { owner, loomId, workerId, zari } = await setup();
    const saree = (await startWith(owner, loomId, workerId, [])).json<{
      sareeJob: { id: string };
    }>().sareeJob.id;

    await weaverBuys(owner, saree, {
      materialId: zari,
      quantityMilli: units(2),
      costPaise: rupees(1_600),
      workerId,
      reimbursement: "CASH_NOW",
    });

    assert.equal(await sareeCost(owner, saree), rupees(1_600));
    assert.equal(await oldBalance(owner, workerId), 0);
  });

  it("will not record it for a weaver who was never on the saree", async () => {
    const { owner, loomId, workerId, zari } = await setup();
    const other = await createWorker(app, owner, { name: "Mahesh", phone: "9876500000" });
    const otherId = other.json<{ worker: { id: string } }>().worker.id;
    const saree = (await startWith(owner, loomId, workerId, [])).json<{
      sareeJob: { id: string };
    }>().sareeJob.id;

    const refused = await weaverBuys(owner, saree, {
      materialId: zari,
      quantityMilli: units(2),
      costPaise: rupees(1_600),
      workerId: otherId,
      reimbursement: "INTO_PASSBOOK",
    });
    assert.equal(refused.statusCode, 400);
    assert.equal(await oldBalance(owner, otherId), 0);
  });
});

describe("low stock", () => {
  it("flags a material once it falls to its warning level", async () => {
    const owner = await signUpFactory(app, {
      factoryName: "Shree Looms",
      email: "owner@shree.test",
    });
    const loomId = await createLoom(app, owner, "4");
    const worker = await createWorker(app, owner, { name: "Suresh", phone: "9876543210" });
    const workerId = worker.json<{ worker: { id: string } }>().worker.id;
    const silk = await material(owner, "Silk yarn", "KG", units(5));
    await buy(owner, silk, units(8), rupees(36_000));

    assert.equal((await stock(owner)).find((row) => row.id === silk)!.isLow, false);

    await startWith(owner, loomId, workerId, [{ materialId: silk, quantityMilli: units(3) }]);

    assert.equal((await stock(owner)).find((row) => row.id === silk)!.isLow, true);
  });
});

describe("finished sarees", () => {
  it("lands in stock when finished, can be marked sold, and carries what it cost", async () => {
    const { owner, loomId, workerId, silk, zari } = await setup();
    const saree = (
      await startWith(owner, loomId, workerId, [
        { materialId: silk, quantityMilli: units(2) },
        { materialId: zari, quantityMilli: units(3) },
      ])
    ).json<{ sareeJob: { id: string } }>().sareeJob.id;

    await app.inject({
      method: "POST",
      url: `/api/saree-jobs/${saree}/finish`,
      headers: as(owner),
      payload: {},
    });

    const list = async () =>
      (
        await app.inject({ method: "GET", url: "/api/finished-sarees", headers: as(owner) })
      ).json<{
        sarees: {
          id: string;
          saleStatus: string;
          materialCostPaise: number | null;
          labourCostPaise: number | null;
        }[];
      }>().sarees;

    const [inStock] = await list();
    assert.equal(inStock?.saleStatus, "IN_STOCK");
    assert.equal(inStock?.materialCostPaise, rupees(11_400));
    assert.equal(inStock?.labourCostPaise, rupees(50_000));

    const sold = await app.inject({
      method: "POST",
      url: `/api/finished-sarees/${saree}/sold`,
      headers: as(owner),
      payload: {},
    });
    assert.equal(sold.statusCode, 200);
    assert.equal((await list())[0]?.saleStatus, "SOLD");
  });
});

describe("who can touch stock", () => {
  it("keeps weavers out of the store room", async () => {
    await setup();
    const weaver = await signInWorker(app, "9876543210", "4321");

    const response = await app.inject({
      method: "GET",
      url: "/api/materials",
      headers: { cookie: weaver },
    });
    assert.equal(response.statusCode, 403);
  });

  it("keeps one factory out of another's store room", async () => {
    const { owner, silk } = await setup();
    const gupta = await signUpFactory(app, {
      factoryName: "Gupta Looms",
      email: "owner@gupta.test",
    });

    assert.equal((await stock(gupta)).length, 0);

    const buyIntoTheirs = await app.inject({
      method: "POST",
      url: `/api/materials/${silk}/purchases`,
      headers: as(gupta),
      payload: { quantityMilli: units(1), costPaise: rupees(1) },
    });
    assert.equal(buyIntoTheirs.statusCode, 404);
    assert.equal(await onHand(owner, silk), units(30));
  });
});
