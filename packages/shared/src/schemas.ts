import { z } from "zod";

import {
  DEFAULT_SAREE_LENGTH_INCHES,
  LOOM_PLACES,
  LOOM_STATUSES,
  WAGE_TYPES,
} from "./domain.js";
import { MAX_PAISE } from "./money.js";

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

/** Money always crosses the wire as a whole number of paise. */
const paiseSchema = z.int().min(0).max(MAX_PAISE);

const inchesSchema = z.int().min(1, "Enter how many inches").max(10_000);

export const createLoomSchema = z.object({
  number: z.string().trim().min(1, "Enter a loom number").max(40),
  place: z.enum(LOOM_PLACES).default("IN_FACTORY"),
  status: z.enum(LOOM_STATUSES).default("RUNNING"),
  note: z.string().trim().max(500).optional(),
});

export const updateLoomSchema = z.object({
  number: z.string().trim().min(1).max(40).optional(),
  place: z.enum(LOOM_PLACES).optional(),
  status: z.enum(LOOM_STATUSES).optional(),
  note: z.string().trim().max(500).optional(),
});

export const createSareeTypeSchema = z.object({
  name: nameSchema,
  lengthInches: z.int().min(1).max(10_000).default(DEFAULT_SAREE_LENGTH_INCHES),
  defaultWagePaise: paiseSchema.optional(),
  defaultRatePerInchPaise: paiseSchema.optional(),
});

/**
 * Starting a saree copies its wage onto the job, so editing the saree type
 * later cannot change what a weaver already earned.
 */
export const startSareeJobSchema = z
  .object({
    loomId: z.string().min(1),
    sareeTypeId: z.string().min(1).optional(),
    label: z.string().trim().max(120).optional(),
    lengthInches: z.int().min(1).max(10_000).default(DEFAULT_SAREE_LENGTH_INCHES),
    wageType: z.enum(WAGE_TYPES),
    wagePaise: paiseSchema.optional(),
    ratePerInchPaise: paiseSchema.optional(),
    /** One or two weavers. With two, the money splits half and half. */
    workerIds: z.array(z.string().min(1)).min(1).max(2),
  })
  .refine(
    (value) => (value.wageType === "PER_SAREE" ? value.wagePaise !== undefined : true),
    { message: "Enter the wage for this saree", path: ["wagePaise"] },
  )
  .refine(
    (value) =>
      value.wageType === "PER_INCH" ? value.ratePerInchPaise !== undefined : true,
    { message: "Enter the rate per inch", path: ["ratePerInchPaise"] },
  )
  .refine((value) => new Set(value.workerIds).size === value.workerIds.length, {
    message: "The same weaver is listed twice",
    path: ["workerIds"],
  });

export const createProductionEntrySchema = z.object({
  /**
   * Made on the phone before sending. Lets a retry after a lost reply return
   * the entry already stored instead of filing the week twice.
   */
  clientId: z.uuid().optional(),
  /** Any day inside the week being reported; the server snaps it to Monday. */
  weekStart: z.iso.date(),
  /** Inches woven this week, not the saree's running total. */
  inches: inchesSchema,
  /**
   * Going past the saree's length is usually a typo, so the server refuses it
   * and says how many inches are left. Send this to confirm and go ahead.
   */
  allowOverflow: z.boolean().default(false),
});

export const reviewProductionEntrySchema = z.object({
  /** The owner may correct the number before approving it. */
  inches: inchesSchema.optional(),
});

export const shiftSareeJobWorkerSchema = z.object({
  workerId: z.string().min(1),
  /** Who takes over, if anyone does right away. */
  replacementWorkerId: z.string().min(1).optional(),
});
