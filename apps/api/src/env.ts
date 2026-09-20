import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3001),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = z.flattenError(parsed.error).fieldErrors;
  console.error("Invalid environment variables:");
  for (const [key, messages] of Object.entries(issues)) {
    console.error(`  ${key}: ${messages?.join(", ")}`);
  }
  console.error("\nCopy .env.example to .env and fill it in.");
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
