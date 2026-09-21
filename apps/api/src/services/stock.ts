import { costOfShare, paise, unitPricePaise } from "@loom/shared";

import type { TenantClient } from "../db/tenant.js";
import { badRequest, conflict, notFound } from "../http/errors.js";

/**
 * Everything about moving material. Stock on hand is never stored: it is the
 * sum of the movements, the same as a passbook balance.
 *
 * Cost basis is the average price paid across every priced purchase of a
 * material: buy 10 kg at Rs 4,000 and 10 kg at Rs 5,000 and silk costs Rs
 * 4,500 a kg. Simple to explain, and the owner can check it by hand.
 */
export type StockDb = Pick<
  TenantClient,
  "stockMovement" | "material" | "sareeJob" | "sareeJobWorker" | "$queryRaw"
>;

type Actor = { factoryId: string; userId: string };

/**
 * Hold this material until the transaction ends. Giving out stock checks how
 * much is left and then takes it; without the lock two people giving at once
 * could both pass the check and take more than there is.
 */
async function lockMaterial(db: StockDb, actor: Actor, materialId: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Material"
    WHERE id = ${materialId} AND "factoryId" = ${actor.factoryId}
    FOR UPDATE
  `;
  if (rows.length === 0) throw notFound("No such material");
}

export async function stockOnHand(db: StockDb, materialId: string): Promise<number> {
  const rows = await db.stockMovement.groupBy({
    by: ["kind"],
    where: { materialId },
    _sum: { quantityMilli: true },
  });
  const of = (kind: string) =>
    rows.find((row) => row.kind === kind)?._sum.quantityMilli ?? 0;
  return of("PURCHASE") + of("RETURNED_FROM_SAREE") - of("GIVEN_TO_SAREE");
}

/** Every purchase that had a price, for the average cost. */
async function pricedPurchases(db: StockDb, materialId: string) {
  const result = await db.stockMovement.aggregate({
    where: { materialId, kind: "PURCHASE", costPaise: { not: null } },
    _sum: { quantityMilli: true, costPaise: true },
  });
  return {
    quantityMilli: result._sum.quantityMilli ?? 0,
    costPaise: result._sum.costPaise ?? 0,
  };
}

export async function recordPurchase(
  db: StockDb,
  actor: Actor,
  input: {
    materialId: string;
    quantityMilli: number;
    costPaise: number | null;
    supplier: string | null;
    note: string | null;
  },
) {
  await lockMaterial(db, actor, input.materialId);
  return db.stockMovement.create({
    data: {
      factoryId: actor.factoryId,
      materialId: input.materialId,
      kind: "PURCHASE",
      quantityMilli: input.quantityMilli,
      costPaise: input.costPaise,
      supplier: input.supplier,
      note: input.note,
      createdByUserId: actor.userId,
    },
    select: { id: true },
  });
}

export async function giveMaterial(
  db: StockDb,
  actor: Actor,
  input: { sareeJobId: string; materialId: string; quantityMilli: number },
) {
  await lockMaterial(db, actor, input.materialId);

  const onHand = await stockOnHand(db, input.materialId);
  if (input.quantityMilli > onHand) {
    throw conflict(
      "NOT_ENOUGH_STOCK",
      `Only ${onHand / 1000} is in stock, but ${input.quantityMilli / 1000} was asked for`,
    );
  }

  const pool = await pricedPurchases(db, input.materialId);
  const costPaise = costOfShare({
    poolCostPaise: pool.costPaise,
    poolQuantityMilli: pool.quantityMilli,
    quantityMilli: input.quantityMilli,
  });

  await db.stockMovement.create({
    data: {
      factoryId: actor.factoryId,
      materialId: input.materialId,
      kind: "GIVEN_TO_SAREE",
      quantityMilli: input.quantityMilli,
      costPaise,
      sareeJobId: input.sareeJobId,
      createdByUserId: actor.userId,
    },
  });
}

/** What one saree has had of one material, and what that cost. */
async function sareeMaterialTotals(db: StockDb, sareeJobId: string, materialId: string) {
  const movements = await db.stockMovement.findMany({
    where: {
      sareeJobId,
      materialId,
      kind: { in: ["GIVEN_TO_SAREE", "RETURNED_FROM_SAREE"] },
    },
    select: { kind: true, quantityMilli: true, costPaise: true },
  });

  let quantityMilli = 0;
  let costPaise = 0;
  let costKnown = true;
  for (const movement of movements) {
    const sign = movement.kind === "GIVEN_TO_SAREE" ? 1 : -1;
    quantityMilli += sign * movement.quantityMilli;
    if (movement.costPaise === null) costKnown = false;
    else costPaise += sign * movement.costPaise;
  }
  return { quantityMilli, costPaise: costKnown ? costPaise : null };
}

/**
 * Leftovers back to the store room. Priced at what this saree was charged for
 * the material, not today's average, so returning everything brings its
 * material cost back to exactly zero.
 */
export async function returnMaterial(
  db: StockDb,
  actor: Actor,
  input: { sareeJobId: string; materialId: string; quantityMilli: number },
) {
  await lockMaterial(db, actor, input.materialId);

  const held = await sareeMaterialTotals(db, input.sareeJobId, input.materialId);
  if (input.quantityMilli > held.quantityMilli) {
    throw badRequest(
      "RETURN_MORE_THAN_GIVEN",
      `This saree only has ${held.quantityMilli / 1000} of that material to return`,
    );
  }

  const costPaise =
    held.costPaise === null
      ? null
      : costOfShare({
          poolCostPaise: held.costPaise,
          poolQuantityMilli: held.quantityMilli,
          quantityMilli: input.quantityMilli,
        });

  await db.stockMovement.create({
    data: {
      factoryId: actor.factoryId,
      materialId: input.materialId,
      kind: "RETURNED_FROM_SAREE",
      quantityMilli: input.quantityMilli,
      costPaise,
      sareeJobId: input.sareeJobId,
      createdByUserId: actor.userId,
    },
  });
}

/**
 * The weaver bought material for this saree with his own money. Recorded so
 * the saree's cost is right, but it never passed through the store room, so
 * stock does not change. Paying him back into his passbook is the caller's
 * job, through the ledger, so all money written for a weaver stays in one file.
 */
export async function recordWeaverPurchase(
  db: StockDb,
  actor: Actor,
  input: {
    sareeJobId: string;
    materialId: string;
    quantityMilli: number;
    costPaise: number;
    workerId: string;
    reimbursement: "CASH_NOW" | "INTO_PASSBOOK";
    note: string | null;
  },
) {
  const material = await db.material.findFirst({
    where: { id: input.materialId },
    select: { id: true },
  });
  if (!material) throw notFound("No such material");

  const onSaree = await db.sareeJobWorker.findFirst({
    where: { sareeJobId: input.sareeJobId, workerId: input.workerId },
    select: { id: true },
  });
  if (!onSaree) {
    throw badRequest("NOT_ON_SAREE", "That weaver never worked on this saree");
  }

  await db.stockMovement.create({
    data: {
      factoryId: actor.factoryId,
      materialId: input.materialId,
      kind: "BOUGHT_BY_WEAVER",
      quantityMilli: input.quantityMilli,
      costPaise: input.costPaise,
      sareeJobId: input.sareeJobId,
      workerId: input.workerId,
      reimbursement: input.reimbursement,
      note: input.note,
      createdByUserId: actor.userId,
    },
  });
}

/** Per material: what the saree was given, returned and had bought for it. */
export async function sareeMaterials(db: StockDb, sareeJobId: string) {
  const movements = await db.stockMovement.findMany({
    where: { sareeJobId },
    select: {
      id: true,
      kind: true,
      quantityMilli: true,
      costPaise: true,
      createdAt: true,
      reimbursement: true,
      material: { select: { id: true, name: true, unit: true } },
      worker: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  type Row = {
    materialId: string;
    name: string;
    unit: "KG" | "BUNDLE";
    givenMilli: number;
    returnedMilli: number;
    boughtByWeaverMilli: number;
    costPaise: number;
    costKnown: boolean;
  };

  const rows = new Map<string, Row>();
  for (const movement of movements) {
    const row =
      rows.get(movement.material.id) ??
      ({
        materialId: movement.material.id,
        name: movement.material.name,
        unit: movement.material.unit,
        givenMilli: 0,
        returnedMilli: 0,
        boughtByWeaverMilli: 0,
        costPaise: 0,
        costKnown: true,
      } satisfies Row);

    const cost = movement.costPaise;
    if (cost === null) row.costKnown = false;

    if (movement.kind === "GIVEN_TO_SAREE") {
      row.givenMilli += movement.quantityMilli;
      row.costPaise += cost ?? 0;
    } else if (movement.kind === "RETURNED_FROM_SAREE") {
      row.returnedMilli += movement.quantityMilli;
      row.costPaise -= cost ?? 0;
    } else if (movement.kind === "BOUGHT_BY_WEAVER") {
      row.boughtByWeaverMilli += movement.quantityMilli;
      row.costPaise += cost ?? 0;
    }
    rows.set(movement.material.id, row);
  }

  const materials = [...rows.values()].map((row) => ({
    ...row,
    usedMilli: row.givenMilli - row.returnedMilli + row.boughtByWeaverMilli,
    /** On the loom and returnable: given, less what has come back. */
    returnableMilli: row.givenMilli - row.returnedMilli,
    costPaise: row.costKnown ? row.costPaise : null,
  }));

  const costKnown = materials.every((row) => row.costPaise !== null);
  const totalCostPaise = costKnown
    ? materials.reduce((sum, row) => sum + (row.costPaise ?? 0), 0)
    : null;

  return {
    materials,
    totalCostPaise,
    movements: movements.map((movement) => ({
      id: movement.id,
      kind: movement.kind,
      quantityMilli: movement.quantityMilli,
      costPaise: movement.costPaise,
      createdAt: movement.createdAt,
      reimbursement: movement.reimbursement,
      material: movement.material,
      workerName: movement.worker?.name ?? null,
    })),
  };
}

/** Every material with how much is on hand, what it is worth, and whether it is low. */
export async function stockReport(db: StockDb) {
  const materials = await db.material.findMany({
    select: { id: true, name: true, unit: true, lowStockAtMilli: true },
    orderBy: { name: "asc" },
  });

  const byKind = await db.stockMovement.groupBy({
    by: ["materialId", "kind"],
    _sum: { quantityMilli: true },
  });
  const priced = await db.stockMovement.groupBy({
    by: ["materialId"],
    where: { kind: "PURCHASE", costPaise: { not: null } },
    _sum: { quantityMilli: true, costPaise: true },
  });
  const lastPurchases = await db.stockMovement.groupBy({
    by: ["materialId"],
    where: { kind: "PURCHASE" },
    _max: { createdAt: true },
  });

  return materials.map((material) => {
    const sum = (kind: string) =>
      byKind.find((row) => row.materialId === material.id && row.kind === kind)?._sum
        .quantityMilli ?? 0;
    const onHandMilli =
      sum("PURCHASE") + sum("RETURNED_FROM_SAREE") - sum("GIVEN_TO_SAREE");

    const pool = priced.find((row) => row.materialId === material.id)?._sum;
    const poolCost = pool?.costPaise ?? 0;
    const poolQuantity = pool?.quantityMilli ?? 0;

    return {
      ...material,
      onHandMilli,
      averageUnitPricePaise: unitPricePaise({
        costPaise: poolCost,
        quantityMilli: poolQuantity,
      }),
      valuePaise:
        poolQuantity > 0 && onHandMilli > 0
          ? costOfShare({
              poolCostPaise: poolCost,
              poolQuantityMilli: poolQuantity,
              quantityMilli: onHandMilli,
            })
          : onHandMilli === 0
            ? paise(0)
            : null,
      isLow: material.lowStockAtMilli !== null && onHandMilli <= material.lowStockAtMilli,
      lastPurchaseAt:
        lastPurchases.find((row) => row.materialId === material.id)?._max.createdAt ??
        null,
    };
  });
}
