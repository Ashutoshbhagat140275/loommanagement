import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import fp from "fastify-plugin";
import type { Role } from "@loom/shared";

import { auth } from "./index.js";
import { env } from "../env.js";
import { prisma } from "../db/client.js";
import { forFactory, type TenantClient } from "../db/tenant.js";
import { HttpError, forbidden, unauthorized } from "../http/errors.js";

export type AuthContext = {
  userId: string;
  role: Role;
  /** Null only for SUPER_ADMIN. */
  factoryId: string | null;
  /** The super admin has paused this factory. */
  factorySuspended: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/** Fastify header bag -> the Web Headers that Better Auth expects. */
function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.append(key, String(value));
    }
  }
  return headers;
}

/**
 * Wrapped in fastify-plugin on purpose.
 *
 * Fastify encapsulates plugins by default, so without this the onRequest hook
 * and the `auth` request decorator below would only apply to routes registered
 * *inside* this plugin. The route plugins are siblings, so every one of their
 * requests would arrive with request.auth still null and get a 401.
 */
export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  // Better Auth speaks the Web Request/Response API, Fastify does not, so the
  // two are bridged here. Body parsing is skipped: Better Auth reads the raw
  // stream itself.
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: { rawBody: true },
    async handler(request, reply) {
      const url = new URL(request.url, env.AUTH_URL);
      const hasBody = request.method !== "GET" && request.body !== undefined;

      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: toWebHeaders(request),
          ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        }),
      );

      reply.status(response.status);

      // getSetCookie() keeps multiple Set-Cookie headers separate. Folding
      // them into one string silently drops every cookie after the first.
      for (const cookie of response.headers.getSetCookie()) {
        reply.header("set-cookie", cookie);
      }
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() === "set-cookie") continue;
        reply.header(key, value);
      }

      return reply.send(response.body ? await response.text() : null);
    },
  });

  // Resolve the session once per request. Routes read request.auth.
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/api/auth/")) return;

    const session = await auth.api.getSession({ headers: toWebHeaders(request) });
    if (!session) return;

    const user = session.user as typeof session.user & {
      role?: string;
      factoryId?: string | null;
    };

    const factoryId = user.factoryId ?? null;
    const factory = factoryId
      ? await prisma.factory.findUnique({
          where: { id: factoryId },
          select: { suspendedAt: true },
        })
      : null;

    request.auth = {
      userId: user.id,
      role: (user.role ?? "WORKER") as Role,
      factoryId,
      factorySuspended: Boolean(factory?.suspendedAt),
    };
  });
});

/**
 * Copy the session cookies from a Better Auth Response onto a Fastify reply.
 *
 * Returns nothing on purpose. FastifyReply is a thenable whose promise only
 * settles once the response has been sent, so returning it from an async
 * function would deadlock every caller that awaits this.
 */
export function copyAuthCookies(
  reply: import("fastify").FastifyReply,
  response: Response,
): void {
  for (const cookie of response.headers.getSetCookie()) {
    reply.header("set-cookie", cookie);
  }
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

/**
 * The tenant-scoped database client for whoever is signed in. Always take the
 * factory from the session, never from the request body or a query parameter.
 */
export function requireFactory(request: FastifyRequest): {
  auth: AuthContext;
  db: TenantClient;
  factoryId: string;
} {
  const context = requireAuth(request);
  if (!context.factoryId) {
    throw forbidden("This account is not attached to a factory");
  }
  // Checked here because every factory route comes through here: a paused
  // factory can still sign in and read /api/me, and nothing else.
  if (context.factorySuspended) {
    throw new HttpError(403, "FACTORY_SUSPENDED", "This factory's account is paused");
  }
  return {
    auth: context,
    factoryId: context.factoryId,
    db: forFactory(context.factoryId),
  };
}

export function requireRole(...allowed: Role[]): preHandlerHookHandler {
  return async (request) => {
    const context = requireAuth(request);
    if (context.role === "SUPER_ADMIN") return;
    if (!allowed.includes(context.role)) {
      throw forbidden(`Only ${allowed.join(" or ")} can do this`);
    }
  };
}
