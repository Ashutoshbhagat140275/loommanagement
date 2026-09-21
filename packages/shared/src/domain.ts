/** Shared domain constants. Kept in step with the Prisma enums. */

export const ROLES = ["OWNER", "SUPERVISOR", "WORKER", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

/** How a worker is paid. The rate itself lives on the saree, not the worker. */
export const WAGE_TYPES = ["PER_SAREE", "PER_INCH"] as const;
export type WageType = (typeof WAGE_TYPES)[number];

/** A worker's ledger has two sections that never mix on their own. */
export const LEDGER_SECTIONS = ["CURRENT_WORK", "OLD_BALANCE"] as const;
export type LedgerSection = (typeof LEDGER_SECTIONS)[number];

export const LEDGER_KINDS = [
  "WORK_EARNED",
  "PAYMENT_CASH",
  "PAYMENT_BY_ADVANCE_CUT",
  "ADVANCE_GIVEN",
  "ADVANCE_CUT",
  "OLD_BALANCE_SETTLED",
  "SHIFT_ADJUSTMENT",
  "CARRIED_OVER",
  "MATERIAL_REIMBURSEMENT",
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LOOM_PLACES = ["IN_FACTORY", "AT_WEAVER_HOME"] as const;
export type LoomPlace = (typeof LOOM_PLACES)[number];

export const LOOM_STATUSES = ["RUNNING", "STOPPED", "REPAIR"] as const;
export type LoomStatus = (typeof LOOM_STATUSES)[number];

export const MATERIAL_UNITS = ["KG", "BUNDLE"] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export const SAREE_JOB_STATUSES = ["RUNNING", "FINISHED", "HANDED_OVER"] as const;
export type SareeJobStatus = (typeof SAREE_JOB_STATUSES)[number];

export const FINISHED_SAREE_STATUSES = ["IN_STOCK", "SOLD"] as const;
export type FinishedSareeStatus = (typeof FINISHED_SAREE_STATUSES)[number];

export const PRODUCTION_ENTRY_STATUSES = ["APPROVED", "AWAITING_OWNER"] as const;
export type ProductionEntryStatus = (typeof PRODUCTION_ENTRY_STATUSES)[number];

/** A saree is generally 216 inches, but the owner can change it per saree. */
export const DEFAULT_SAREE_LENGTH_INCHES = 216;

export const LOCALES = ["en", "hi", "mr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
