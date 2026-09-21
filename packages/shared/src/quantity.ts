/**
 * Material quantities are whole thousandths of the material's unit: 2.5 kg of
 * silk is 2500, 3 bundles of zari is 3000. The same idea as money in paise:
 * integers only, so adding and splitting never drifts.
 */

import { paise, proRate, type Paise } from "./money.js";

export const MILLI_PER_UNIT = 1000;

/** A million units of anything is a typo, not a purchase. */
export const MAX_QUANTITY_MILLI = 1_000_000_000;

export class QuantityError extends Error {}

/** "2.5" -> 2500. Up to three decimals, never negative. */
export function quantityFromText(text: string): number {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (!match) throw new QuantityError(`Not a quantity: "${text}"`);
  const [, whole, fraction = ""] = match;
  const milli = Number(whole) * MILLI_PER_UNIT + Number(fraction.padEnd(3, "0"));
  if (milli > MAX_QUANTITY_MILLI) throw new QuantityError(`Too large: "${text}"`);
  return milli;
}

export function quantityToNumber(milli: number): number {
  return milli / MILLI_PER_UNIT;
}

/**
 * The cost of taking some quantity out of a pool that cost a known total.
 * Give 2 kg out of 20 kg bought for Rs 90,000 and it cost Rs 9,000.
 */
export function costOfShare(input: {
  poolCostPaise: number;
  poolQuantityMilli: number;
  quantityMilli: number;
}): Paise | null {
  if (input.poolQuantityMilli <= 0) return null;
  return proRate(paise(input.poolCostPaise), input.quantityMilli, input.poolQuantityMilli);
}

/** Price per whole unit, for showing: Rs 4,500 a kg. */
export function unitPricePaise(input: {
  costPaise: number;
  quantityMilli: number;
}): Paise | null {
  if (input.quantityMilli <= 0) return null;
  return proRate(paise(input.costPaise), MILLI_PER_UNIT, input.quantityMilli);
}

/** Total for a quantity at a price per whole unit: 2.5 kg at Rs 4,500 is Rs 11,250. */
export function totalForQuantity(input: {
  unitPricePaise: number;
  quantityMilli: number;
}): Paise {
  return proRate(paise(input.unitPricePaise), input.quantityMilli, MILLI_PER_UNIT);
}
