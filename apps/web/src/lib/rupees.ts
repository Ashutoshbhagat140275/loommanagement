import { formatPaise, fromRupees, paise } from "@loom/shared";

/** What someone typed into a rupee box, as paise, or null if it is not money. */
export function parseRupees(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return fromRupees(trimmed);
  } catch {
    return null;
  }
}

/** "+₹50,000" or "−₹20,000", for showing what a line did to a balance. */
export function formatSignedPaise(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatPaise(paise(Math.abs(amount)))}`;
}

export function formatAmount(amount: number): string {
  return formatPaise(paise(Math.abs(amount)));
}
