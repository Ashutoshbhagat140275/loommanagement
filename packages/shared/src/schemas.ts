import { z } from "zod";

import { WAGE_TYPES } from "./domain.js";

/**
 * Indian mobile number, stored as 10 digits with no country code.
 * Accepts what people actually type: "+91 98765 43210", "098765-43210".
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .transform((value) => value.replace(/^(\+91|91|0)/, ""))
  .pipe(
    z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a 10 digit mobile number starting with 6 to 9"),
  );

/** A worker signs in with a 4 to 6 digit PIN. Digits only: it is typed on a loom. */
export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits");

export const ownerPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

const nameSchema = z.string().trim().min(2, "Enter a name").max(120);

export const signUpFactorySchema = z.object({
  factoryName: nameSchema,
  ownerName: nameSchema,
  email: z.email("Enter a valid email address"),
  password: ownerPasswordSchema,
  phone: phoneSchema.optional(),
});
export type SignUpFactoryInput = z.input<typeof signUpFactorySchema>;

export const signInOwnerSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const signInWorkerSchema = z.object({
  phone: phoneSchema,
  pin: z.string().min(1, "Enter your PIN"),
});

export const createWorkerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema.optional(),
  wageType: z.enum(WAGE_TYPES).default("PER_SAREE"),
  trusted: z.boolean().default(false),
  /** Set a PIN to give this worker a login. Needs a phone number. */
  pin: pinSchema.optional(),
});

export const updateWorkerSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
  wageType: z.enum(WAGE_TYPES).optional(),
  trusted: z.boolean().optional(),
  active: z.boolean().optional(),
});
