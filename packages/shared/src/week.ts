/**
 * Production is reported once a week, so every entry is filed against the
 * Monday of its week. Dates are handled as plain calendar days at UTC
 * midnight: a factory in India entering "this week" must not land on a
 * different Monday because of a timezone offset.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): Date {
  const match = ISO_DATE.exec(value.trim());
  if (!match) throw new Error(`Expected a YYYY-MM-DD date, got "${value}"`);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) throw new Error(`Not a real date: "${value}"`);
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday on or before the given day, as UTC midnight. */
export function weekStartOf(input: string | Date): Date {
  const date =
    typeof input === "string"
      ? parseIsoDate(input)
      : new Date(
          Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()),
        );

  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date;
}

export function currentWeekStart(now: Date = new Date()): Date {
  return weekStartOf(now);
}
