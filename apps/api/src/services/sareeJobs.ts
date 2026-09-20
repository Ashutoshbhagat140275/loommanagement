import type { TenantClient } from "../db/tenant.js";

/**
 * Progress is the sum of APPROVED entries only.
 *
 * It is worked out from the entries rather than kept in a counter column on
 * the job: an entry waiting for the owner must not move the progress bar, and
 * approving, correcting or rejecting one then needs no second write to keep
 * in step.
 */
export async function approvedInchesByJob(
  db: TenantClient,
  sareeJobIds: string[],
): Promise<Map<string, number>> {
  if (sareeJobIds.length === 0) return new Map();

  const rows = await db.productionEntry.groupBy({
    by: ["sareeJobId"],
    where: { sareeJobId: { in: sareeJobIds }, status: "APPROVED" },
    _sum: { inches: true },
  });

  return new Map(rows.map((row) => [row.sareeJobId, row._sum.inches ?? 0]));
}

export async function approvedInches(
  db: TenantClient,
  sareeJobId: string,
): Promise<number> {
  const result = await db.productionEntry.aggregate({
    where: { sareeJobId, status: "APPROVED" },
    _sum: { inches: true },
  });
  return result._sum.inches ?? 0;
}
