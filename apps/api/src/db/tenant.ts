import { prisma } from "./client.js";

/**
 * Multi-tenant safety net.
 *
 * Every model that belongs to a factory is listed here. The scoped client
 * injects `factoryId` into the `where` of every read and into the `data` of
 * every write, so a missing filter cannot leak one factory's rows to another.
 *
 * Add a model to this list in the same commit that gives it a factoryId
 * column, or its queries will silently run unscoped.
 */
const TENANT_MODELS = new Set<string>([
  "Worker",
  // phase 2: Loom, SareeType, SareeJob, ProductionEntry
  // phase 4: Material, StockMovement, FinishedSaree
  // phase 5: LedgerLine
]);

/** Operations whose `args.where` should carry the factory filter. */
const WHERE_OPERATIONS = new Set<string>([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** Operations whose `args.data` should carry the factory id. */
const DATA_OPERATIONS = new Set<string>([
  "create",
  "createMany",
  "createManyAndReturn",
]);

export class TenantScopeError extends Error {}

function applyFactoryId(
  target: Record<string, unknown> | undefined,
  factoryId: string,
  what: string,
): Record<string, unknown> {
  const next = { ...(target ?? {}) };
  const existing = next["factoryId"];
  if (existing !== undefined && existing !== factoryId) {
    throw new TenantScopeError(
      `Refusing to run a query scoped to factory ${factoryId} with ${what}.factoryId set to ${String(existing)}`,
    );
  }
  next["factoryId"] = factoryId;
  return next;
}

/**
 * A Prisma client locked to one factory. Resolve factoryId from the session,
 * never from anything the client sends.
 */
export function forFactory(factoryId: string) {
  if (!factoryId) {
    throw new TenantScopeError("forFactory() needs a factory id");
  }

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }

          const next = { ...(args ?? {}) };

          if (WHERE_OPERATIONS.has(operation)) {
            next.where = applyFactoryId(next.where, factoryId, "where");
          }

          if (DATA_OPERATIONS.has(operation)) {
            next.data = Array.isArray(next.data)
              ? next.data.map((row: Record<string, unknown>) =>
                  applyFactoryId(row, factoryId, "data"),
                )
              : applyFactoryId(next.data, factoryId, "data");
          }

          if (operation === "upsert") {
            next.where = applyFactoryId(next.where, factoryId, "where");
            next.create = applyFactoryId(next.create, factoryId, "create");
          }

          return query(next);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forFactory>;
