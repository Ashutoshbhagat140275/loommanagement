/**
 * Drop keys whose value is undefined.
 *
 * Zod's .optional() gives `{ name?: string | undefined }`, but under
 * exactOptionalPropertyTypes Prisma will not accept an explicit undefined.
 * Stripping them also means a PATCH only touches the fields that were sent.
 */
export function definedOnly<T extends object>(
  input: T,
): {
  [K in keyof T]?: Exclude<T[K], undefined>;
} {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value;
  }
  return output as { [K in keyof T]?: Exclude<T[K], undefined> };
}
