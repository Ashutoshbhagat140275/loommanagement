import type { FastifyInstance } from "fastify";
import { ZodError, z } from "zod";

import { TenantScopeError } from "../db/tenant.js";
import { isProduction } from "../env.js";

/** An error we chose to show the client, with a status we chose. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) =>
  new HttpError(400, code, message);
export const unauthorized = (message = "Sign in first") =>
  new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You cannot do this") =>
  new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") =>
  new HttpError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string) =>
  new HttpError(409, code, message);

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "Some fields are not valid",
          fields: z.flattenError(error).fieldErrors,
        },
      });
    }

    // A tenant scope violation is a bug in our code, not bad input. Never leak
    // the detail, but make sure it is loud in the logs.
    if (error instanceof TenantScopeError) {
      request.log.error({ err: error }, "tenant scope violation");
      return reply
        .status(500)
        .send({ error: { code: "INTERNAL", message: "Something went wrong" } });
    }

    const fastifyError = error as {
      validation?: unknown;
      statusCode?: number;
      message?: string;
    };

    if (fastifyError.validation) {
      return reply.status(400).send({
        error: { code: "VALIDATION_FAILED", message: fastifyError.message },
      });
    }

    request.log.error({ err: error }, "unhandled error");
    return reply.status(fastifyError.statusCode ?? 500).send({
      error: {
        code: "INTERNAL",
        message: isProduction ? "Something went wrong" : fastifyError.message,
      },
    });
  });
}
