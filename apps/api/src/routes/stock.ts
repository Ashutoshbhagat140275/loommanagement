import type { FastifyInstance } from "fastify";
import {
  createMaterialSchema,
  giveMaterialSchema,
  recordPurchaseSchema,
  returnMaterialSchema,
  updateMaterialSchema,
  weaverBoughtMaterialSchema,
} from "@loom/shared";

import { requireAuth, requireFactory, requireRole } from "../auth/plugin.js";
import { conflict, notFound } from "../http/errors.js";
import { definedOnly } from "../http/patch.js";
import { creditMaterialReimbursement } from "../services/ledger.js";
import {
  giveMaterial,
  recordPurchase,
  recordWeaverPurchase,
  returnMaterial,
  sareeMaterials,
  stockReport,
} from "../services/stock.js";

/**
 * Material in and out of the store room, and finished sarees.
 *
 * Supervisors handle stock, so they can record and move it. Paying a weaver
 * back for material he bought is money, so that part is the owner's alone.
 */
export async function stockRoutes(app: FastifyInstance) {
  const staff = { preHandler: requireRole("OWNER", "SUPERVISOR") };
  const ownerOnly = { preHandler: requireRole("OWNER") };

  app.get("/api/materials", staff, async (request) => {
    const { db } = requireFactory(request);
    return { materials: await stockReport(db) };
  });

  app.post("/api/materials", ownerOnly, async (request, reply) => {
    const { db, factoryId } = requireFactory(request);
    const input = createMaterialSchema.parse(request.body);

    const clash = await db.material.findFirst({
      where: { name: input.name },
      select: { id: true },
    });
    if (clash) throw conflict("MATERIAL_TAKEN", "A material with this name already exists");

    const material = await db.material.create({
      data: {
        factoryId,
        name: input.name,
        unit: input.unit,
        lowStockAtMilli: input.lowStockAtMilli ?? null,
      },
      select: { id: true, name: true, unit: true, lowStockAtMilli: true },
    });
    return reply.status(201).send({ material });
  });

  app.patch<{ Params: { id: string } }>(
    "/api/materials/:id",
    ownerOnly,
    async (request) => {
      const { db } = requireFactory(request);
      const input = updateMaterialSchema.parse(request.body);

      const existing = await db.material.findFirst({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!existing) throw notFound("No such material");

      const material = await db.material.update({
        where: { id: existing.id },
        data: definedOnly(input),
        select: { id: true, name: true, unit: true, lowStockAtMilli: true },
      });
      return { material };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/materials/:id/purchases",
    staff,
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const { userId } = requireAuth(request);
      const input = recordPurchaseSchema.parse(request.body);

      await db.$transaction((tx) =>
        recordPurchase(
          tx,
          { factoryId, userId },
          {
            materialId: request.params.id,
            quantityMilli: input.quantityMilli,
            costPaise: input.costPaise ?? null,
            supplier: input.supplier ?? null,
            note: input.note ?? null,
          },
        ),
      );

      return reply.status(201).send({ materials: await stockReport(db) });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/materials/:id/movements",
    staff,
    async (request) => {
      const { db } = requireFactory(request);
      const material = await db.material.findFirst({
        where: { id: request.params.id },
        select: { id: true, name: true, unit: true },
      });
      if (!material) throw notFound("No such material");

      const movements = await db.stockMovement.findMany({
        where: { materialId: material.id },
        select: {
          id: true,
          kind: true,
          quantityMilli: true,
          costPaise: true,
          supplier: true,
          note: true,
          createdAt: true,
          sareeJob: { select: { id: true, label: true, loom: { select: { number: true } } } },
          worker: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return { material, movements };
    },
  );

  async function requireSaree(db: ReturnType<typeof requireFactory>["db"], id: string) {
    const saree = await db.sareeJob.findFirst({ where: { id }, select: { id: true } });
    if (!saree) throw notFound("No such saree");
    return saree;
  }

  app.get<{ Params: { id: string } }>(
    "/api/saree-jobs/:id/materials",
    staff,
    async (request) => {
      const { db } = requireFactory(request);
      await requireSaree(db, request.params.id);
      return sareeMaterials(db, request.params.id);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/saree-jobs/:id/materials/give",
    staff,
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const { userId } = requireAuth(request);
      const input = giveMaterialSchema.parse(request.body);
      await requireSaree(db, request.params.id);

      await db.$transaction((tx) =>
        giveMaterial(tx, { factoryId, userId }, { sareeJobId: request.params.id, ...input }),
      );
      return reply.status(201).send(await sareeMaterials(db, request.params.id));
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/saree-jobs/:id/materials/return",
    staff,
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const { userId } = requireAuth(request);
      const input = returnMaterialSchema.parse(request.body);
      await requireSaree(db, request.params.id);

      await db.$transaction((tx) =>
        returnMaterial(tx, { factoryId, userId }, { sareeJobId: request.params.id, ...input }),
      );
      return reply.status(201).send(await sareeMaterials(db, request.params.id));
    },
  );

  /**
   * The weaver bought material himself. Recorded against the saree, and paid
   * back either in cash on the spot (nothing more to do) or into his passbook,
   * in the same transaction so the two can never disagree.
   */
  app.post<{ Params: { id: string } }>(
    "/api/saree-jobs/:id/materials/bought-by-weaver",
    ownerOnly,
    async (request, reply) => {
      const { db, factoryId } = requireFactory(request);
      const { userId } = requireAuth(request);
      const input = weaverBoughtMaterialSchema.parse(request.body);
      await requireSaree(db, request.params.id);
      const actor = { factoryId, userId };

      await db.$transaction(async (tx) => {
        await recordWeaverPurchase(tx, actor, {
          sareeJobId: request.params.id,
          materialId: input.materialId,
          quantityMilli: input.quantityMilli,
          costPaise: input.costPaise,
          workerId: input.workerId,
          reimbursement: input.reimbursement,
          note: input.note ?? null,
        });

        if (input.reimbursement === "INTO_PASSBOOK") {
          await creditMaterialReimbursement(tx, actor, {
            workerId: input.workerId,
            amountPaise: input.costPaise,
            note: input.note ?? null,
          });
        }
      });

      return reply.status(201).send(await sareeMaterials(db, request.params.id));
    },
  );

  /**
   * Finished sarees: what is in the store room and what has gone. Each carries
   * what it cost to make. Wages are the owner's to see, so a supervisor gets
   * the material cost but not the labour cost.
   */
  app.get("/api/finished-sarees", staff, async (request) => {
    const { db } = requireFactory(request);
    const context = requireAuth(request);
    const canSeeWages = context.role === "OWNER" || context.role === "SUPER_ADMIN";

    const sarees = await db.sareeJob.findMany({
      where: { status: "FINISHED" },
      select: {
        id: true,
        label: true,
        lengthInches: true,
        wageType: true,
        startedAt: true,
        finishedAt: true,
        saleStatus: true,
        soldAt: true,
        loom: { select: { number: true } },
        sareeType: { select: { name: true } },
        workers: {
          select: { worker: { select: { id: true, name: true } } },
          orderBy: { joinedAt: "asc" },
        },
      },
      orderBy: { finishedAt: "desc" },
      take: 300,
    });
    const ids = sarees.map((saree) => saree.id);

    // Material cost, signed by direction. A movement with no known cost makes
    // the whole saree's material cost unknown rather than quietly too low.
    const materialRows = await db.stockMovement.groupBy({
      by: ["sareeJobId", "kind"],
      where: { sareeJobId: { in: ids } },
      _sum: { costPaise: true },
      _count: { _all: true, costPaise: true },
    });

    const labourRows = canSeeWages
      ? await db.ledgerLine.groupBy({
          by: ["sareeJobId"],
          where: { sareeJobId: { in: ids }, kind: { in: ["WORK_EARNED", "SHIFT_ADJUSTMENT"] } },
          _sum: { amountPaise: true },
        })
      : [];

    return {
      sarees: sarees.map((saree) => {
        const rows = materialRows.filter((row) => row.sareeJobId === saree.id);
        const unknown = rows.some((row) => row._count._all !== row._count.costPaise);
        const materialCostPaise = unknown
          ? null
          : rows.reduce((sum, row) => {
              const amount = row._sum.costPaise ?? 0;
              return row.kind === "RETURNED_FROM_SAREE" ? sum - amount : sum + amount;
            }, 0);

        const labour = labourRows.find((row) => row.sareeJobId === saree.id);

        return {
          ...saree,
          workers: saree.workers.map((link) => link.worker),
          materialCostPaise,
          labourCostPaise: canSeeWages ? (labour?._sum.amountPaise ?? 0) : null,
        };
      }),
    };
  });

  for (const [path, status] of [
    ["sold", "SOLD"],
    ["in-stock", "IN_STOCK"],
  ] as const) {
    app.post<{ Params: { id: string } }>(
      `/api/finished-sarees/:id/${path}`,
      staff,
      async (request) => {
        const { db } = requireFactory(request);
        const saree = await db.sareeJob.findFirst({
          where: { id: request.params.id, status: "FINISHED" },
          select: { id: true },
        });
        if (!saree) throw notFound("No such finished saree");

        await db.sareeJob.update({
          where: { id: saree.id },
          data: { saleStatus: status, soldAt: status === "SOLD" ? new Date() : null },
        });
        return { ok: true };
      },
    );
  }
}
