import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";

import { env, isProduction } from "./env.js";
import { prisma } from "./db/client.js";
import { authPlugin } from "./auth/plugin.js";
import { adminRoutes } from "./routes/admin.js";
import { registerErrorHandler } from "./http/errors.js";
import { factoryRoutes } from "./routes/factories.js";
import { loomRoutes } from "./routes/looms.js";
import { meRoutes } from "./routes/me.js";
import { passbookRoutes } from "./routes/passbook.js";
import { productionEntryRoutes } from "./routes/productionEntries.js";
import { reportRoutes } from "./routes/reports.js";
import { sareeJobRoutes } from "./routes/sareeJobs.js";
import { sareeTypeRoutes } from "./routes/sareeTypes.js";
import { stockRoutes } from "./routes/stock.js";
import { workerRoutes } from "./routes/workers.js";

export async function buildServer() {
  const app = Fastify({
    // In production the API sits behind AWS's load balancer, which is what the
    // browser actually talks to. Trusting its forwarded headers gives the real
    // client address and protocol instead of the balancer's own.
    trustProxy: isProduction,
    // pino-pretty runs in a worker thread, which keeps the process alive after
    // tests finish, so tests get a plain silent logger.
    logger:
      env.NODE_ENV === "test"
        ? false
        : isProduction
          ? true
          : {
              transport: {
                target: "pino-pretty",
                options: { translateTime: "HH:MM:ss" },
              },
            },
  });

  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
    credentials: true,
    // Spelled out because the default list leaves out PATCH and DELETE, and
    // the browser then blocks those at the preflight. Tests never catch this:
    // app.inject() talks to the router directly and never does a preflight.
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);

  registerErrorHandler(app);

  await app.register(authPlugin);
  await app.register(factoryRoutes);
  await app.register(meRoutes);
  await app.register(workerRoutes);
  await app.register(loomRoutes);
  await app.register(sareeJobRoutes);
  await app.register(productionEntryRoutes);
  await app.register(sareeTypeRoutes);
  await app.register(reportRoutes);
  await app.register(passbookRoutes);
  await app.register(stockRoutes);
  await app.register(adminRoutes);

  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, at: new Date().toISOString() };
  });

  return app;
}

/** Only start listening when run directly, so tests can import buildServer. */
if (env.NODE_ENV !== "test") {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}
