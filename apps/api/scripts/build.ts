/**
 * The production build: the API and the shared package in one JavaScript file
 * that plain Node runs, with no TypeScript runner in production.
 *
 * Packages from npm stay outside the bundle and load from node_modules as
 * usual; only our own code, @loom/shared included, is bundled.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

const npmPackages = Object.keys(manifest.dependencies ?? {}).filter(
  (name) => !name.startsWith("@loom/"),
);

await build({
  absWorkingDir: root,
  // The server, and the one-off command for making the super admin, which has
  // to run on the production server where there is no TypeScript runner.
  entryPoints: {
    server: "src/server.ts",
    "create-super-admin": "scripts/create-super-admin.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // A package and anything under it, such as better-auth/plugins.
  external: npmPackages.flatMap((name) => [name, `${name}/*`]),
  // Some CommonJS packages call require(); ESM output has no require of its own.
  banner: {
    js: "import { createRequire as __loomCreateRequire } from 'node:module'; const require = __loomCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});
