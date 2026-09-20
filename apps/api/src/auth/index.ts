import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";

import { prisma } from "../db/client.js";
import { env, isProduction } from "../env.js";

/**
 * Better Auth owns sign-in and sessions only.
 *
 * Sign-up is disabled on purpose. A user with no factory is useless and a
 * public sign-up endpoint would create exactly that, so accounts are created
 * by our own routes, which always attach a factory in the same transaction.
 *
 * Workers sign in with their phone number as the username and a PIN as the
 * password, so the minimum password length is 4. Owner passwords are held to
 * a longer minimum by the Zod schema on the sign-up route.
 */
export const auth = betterAuth({
  appName: "Loom Management",
  baseURL: env.AUTH_URL,
  basePath: "/api/auth",
  secret: env.AUTH_SECRET,

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 4,
    maxPasswordLength: 128,
  },

  plugins: [username()],

  user: {
    additionalFields: {
      role: { type: "string", input: false, required: false },
      factoryId: { type: "string", input: false, required: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  trustedOrigins: [env.WEB_ORIGIN],

  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: isProduction,
      httpOnly: true,
    },
  },
});

/** Hash a password or PIN with the same algorithm Better Auth verifies with. */
export async function hashSecret(plain: string): Promise<string> {
  const context = await auth.$context;
  return context.password.hash(plain);
}

/** Better Auth's provider id for email/password and username/PIN accounts. */
export const CREDENTIAL_PROVIDER = "credential";
