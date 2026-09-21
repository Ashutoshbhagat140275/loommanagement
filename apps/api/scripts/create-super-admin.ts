/**
 * Create the super admin: the one account that sees every factory.
 *
 * There is deliberately no sign-up page for this. Run it once, on the server:
 *
 *   pnpm -F @loom/api create-super-admin you@example.com "Your Name"
 *
 * Set SUPER_ADMIN_PASSWORD to choose the password. Without it, a strong one is
 * made up and printed once, so it never has to be typed on the command line
 * where the shell would keep it in its history.
 */
import { randomBytes } from "node:crypto";

import { CREDENTIAL_PROVIDER, hashSecret } from "../src/auth/index.js";
import { prisma } from "../src/db/client.js";

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();

if (!email?.includes("@") || !name) {
  console.error('Usage: create-super-admin <email> "<name>"');
  process.exit(1);
}

const chosen = process.env["SUPER_ADMIN_PASSWORD"];
if (chosen !== undefined && chosen.length < 12) {
  console.error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

// On a server, whatever this prints lands in the logs, which are kept. A
// generated password printed there would be readable by anyone with log
// access, so production insists on being given one instead.
if (chosen === undefined && process.env["NODE_ENV"] === "production") {
  console.error("Set SUPER_ADMIN_PASSWORD. In production a password is never printed.");
  process.exit(1);
}
const password = chosen ?? randomBytes(15).toString("base64url");

const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
if (existing) {
  console.error(`An account with ${email} already exists.`);
  process.exit(1);
}

const passwordHash = await hashSecret(password);

await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      emailVerified: false,
      role: "SUPER_ADMIN",
      factoryId: null,
    },
  });
  await tx.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: CREDENTIAL_PROVIDER,
      password: passwordHash,
    },
  });
});

console.log(`Super admin created: ${email}`);
if (chosen === undefined) {
  console.log(`Password (shown once, keep it safe): ${password}`);
}

await prisma.$disconnect();
