import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../env.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/**
 * The unscoped client. Only auth, migrations and super-admin code should use
 * this directly. Everything that belongs to a factory goes through
 * forFactory() in ./tenant.ts.
 */
export const prisma = new PrismaClient({
  adapter,
  log: ["warn", "error"],
});
