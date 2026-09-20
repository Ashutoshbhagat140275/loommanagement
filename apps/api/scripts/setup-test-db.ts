/**
 * Make sure the test database exists and has every migration applied.
 * Run before `node --test`. Safe to run repeatedly.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
loadEnv({ path: path.join(repoRoot, ".env.test"), quiet: true });

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL missing from .env.test");

const url = new URL(databaseUrl);
const databaseName = url.pathname.slice(1);

if (!/test/i.test(databaseName)) {
  throw new Error(`The test database name must contain "test", got "${databaseName}"`);
}

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";

const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();

const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
  databaseName,
]);

if (existing.rowCount === 0) {
  // Identifiers cannot be parameterised, so quote it instead.
  await admin.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
  console.log(`created database ${databaseName}`);
}

await admin.end();

execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  cwd: path.resolve(import.meta.dirname, ".."),
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: "inherit",
  shell: process.platform === "win32",
});
