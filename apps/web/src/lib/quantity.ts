import type { TFunction } from "i18next";
import { quantityFromText, quantityToNumber, type MaterialUnit } from "@loom/shared";

/** What someone typed into a quantity box, in thousandths, or null. */
export function parseQuantity(text: string): number | null {
  try {
    const milli = quantityFromText(text);
    return milli > 0 ? milli : null;
  } catch {
    return null;
  }
}

/** 2500, KG -> "2.5 kg". Plural-aware, in the reader's language. */
export function formatQuantity(milli: number, unit: MaterialUnit, t: TFunction): string {
  const count = quantityToNumber(milli);
  return t(`unit.${unit}`, {
    count,
    // Up to three decimals, but no trailing zeros: 2.5, not 2.500.
    formatParams: { count: { maximumFractionDigits: 3 } },
  });
}
