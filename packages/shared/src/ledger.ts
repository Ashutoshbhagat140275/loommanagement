/**
 * Passbook rules that the server and the screens must agree on to the paisa.
 *
 * Sign convention throughout: a positive amount means the owner owes the
 * weaver; a negative one means the weaver owes the owner.
 */

import { paise, proRate, subtract, type Paise } from "./money.js";

export type BalanceDirection = "OWNER_OWES" | "WORKER_OWES" | "SETTLED";

export function describeBalance(amount: number): {
  direction: BalanceDirection;
  amount: Paise;
} {
  if (amount > 0) return { direction: "OWNER_OWES", amount: paise(amount) };
  if (amount < 0) return { direction: "WORKER_OWES", amount: paise(-amount) };
  return { direction: "SETTLED", amount: paise(0) };
}

/**
 * What a weaver taken off a per-saree saree has actually earned.
 *
 * Their share of the wage covers the stretch from where they joined to the
 * end of the saree, so they earn the part of that stretch they wove. Someone
 * there from the start of a 216 inch, Rs 50,000 saree who leaves at 108 has
 * earned Rs 25,000. Two weavers sharing it each hold Rs 25,000, so each has
 * earned Rs 12,500 at the same point.
 *
 * Weaving past the saree's length earns nothing extra: the share is the most
 * a weaver can be owed for it.
 */
export function shiftShare(input: {
  sharePaise: Paise;
  inchesDone: number;
  inchesAtJoin: number;
  lengthInches: number;
}): { earnedPaise: Paise; unearnedPaise: Paise } {
  const stretch = input.lengthInches - input.inchesAtJoin;
  const woven = Math.max(
    0,
    Math.min(input.inchesDone, input.lengthInches) - input.inchesAtJoin,
  );

  const earnedPaise =
    stretch > 0 ? proRate(input.sharePaise, woven, stretch) : input.sharePaise;

  return { earnedPaise, unearnedPaise: subtract(input.sharePaise, earnedPaise) };
}

/**
 * How a payment breaks down.
 *
 * The work amount is what comes off the saree's balance. Part of it may be
 * paid by cutting the weaver's advance instead of in cash; that part still
 * counts as paid, so a Rs 5,000 payment made as Rs 3,000 cash and a Rs 2,000
 * advance cut clears Rs 5,000 of work and Rs 2,000 of advance.
 */
export function splitPayment(input: {
  workAmountPaise: Paise;
  cutForAdvancePaise: Paise;
}): { cashPaise: Paise; cutPaise: Paise } {
  return {
    cashPaise: subtract(input.workAmountPaise, input.cutForAdvancePaise),
    cutPaise: input.cutForAdvancePaise,
  };
}
