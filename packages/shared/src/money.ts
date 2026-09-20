/**
 * All money in this app is an integer number of paise. 100 paise = 1 rupee.
 * Never use floats for money: 0.1 + 0.2 !== 0.3, and here that becomes an
 * argument between an owner and a worker.
 */

export type Paise = number & { readonly __brand: unique symbol };

/**
 * Largest single amount we accept: 2 crore rupees.
 * Money columns are 32-bit ints in Postgres, which top out at 2,147,483,647
 * paise. This leaves headroom while still catching typos.
 */
export const MAX_PAISE = 2_000_000_000;

export class MoneyError extends Error {}

export function paise(value: number): Paise {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Paise must be a whole number, got ${value}`);
  }
  if (Math.abs(value) > MAX_PAISE) {
    throw new MoneyError(`Amount out of range: ${value}`);
  }
  return value as Paise;
}

export const ZERO = paise(0);

/** "1234.56" or 1234.56 -> 123456 paise. Rejects more than 2 decimal places. */
export function fromRupees(rupees: number | string): Paise {
  const text = typeof rupees === "number" ? rupees.toFixed(2) : rupees.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new MoneyError(`Not a valid rupee amount: ${rupees}`);
  const [, sign, whole, fraction = "0"] = match;
  const total = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return paise(sign === "-" ? -total : total);
}

export function toRupees(amount: Paise): number {
  return amount / 100;
}

export function add(...amounts: Paise[]): Paise {
  return paise(amounts.reduce<number>((sum, a) => sum + a, 0));
}

export function subtract(a: Paise, b: Paise): Paise {
  return paise(a - b);
}

export function negate(a: Paise): Paise {
  return paise(-a);
}

export function isZero(a: Paise): boolean {
  return a === 0;
}

/**
 * Split an amount into equal parts without losing a single paisa.
 * The remainder goes to the earliest parts, so the sum always matches.
 * splitEvenly(paise(101), 2) -> [51, 50]
 */
export function splitEvenly(total: Paise, parts: number): Paise[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`parts must be a positive whole number, got ${parts}`);
  }
  const sign = total < 0 ? -1 : 1;
  const absolute = Math.abs(total);
  const base = Math.floor(absolute / parts);
  const remainder = absolute - base * parts;
  return Array.from({ length: parts }, (_, index) =>
    paise(sign * (base + (index < remainder ? 1 : 0))),
  );
}

/**
 * Share of a total, by ratio. Used when a worker is shifted mid-saree:
 * proRate(wage, inchesDone, sareeLength).
 * Rounds half away from zero, so a worker is never short by rounding alone.
 */
export function proRate(total: Paise, numerator: number, denominator: number): Paise {
  if (denominator <= 0) {
    throw new MoneyError(`denominator must be greater than zero, got ${denominator}`);
  }
  if (numerator < 0) {
    throw new MoneyError(`numerator must not be negative, got ${numerator}`);
  }
  const exact = (total * numerator) / denominator;
  return paise(Math.sign(exact) * Math.round(Math.abs(exact)));
}

/** Inches woven x rate per inch. Both sides are already integers. */
export function multiplyByQuantity(ratePerUnit: Paise, quantity: number): Paise {
  if (quantity < 0) {
    throw new MoneyError(`quantity must not be negative, got ${quantity}`);
  }
  const exact = ratePerUnit * quantity;
  return paise(Math.sign(exact) * Math.round(Math.abs(exact)));
}

/** "₹1,23,456.78" in Indian digit grouping. */
export function formatPaise(amount: Paise, options?: { showPaise?: boolean }): string {
  const showPaise = options?.showPaise ?? amount % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(toRupees(amount));
}
