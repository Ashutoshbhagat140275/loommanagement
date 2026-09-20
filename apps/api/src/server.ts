import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";

import { env, isProduction } from "./env.js";
import { prisma } from "./db/client.js";

const app = Fastify({
  logger: isProduction
    ? true
    : { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } },
});

await app.register(cors, {
  origin: [env.WEB_ORIGIN],
  credentials: true,
});

await app.register(cookie);

app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true, at: new Date().toISOString() };
});

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: env.PORT, host: "0.0.0.0" });
