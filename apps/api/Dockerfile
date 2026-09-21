# The API as containers, for AWS. Two images from this one file, both built
# from the repo root:
#
#   docker build -f apps/api/Dockerfile -t loom-api .
#   docker build -f apps/api/Dockerfile --target migrate -t loom-api-migrate .
#
# loom-api runs the server. loom-api-migrate only runs the database migrations
# before a release. They are separate because the Prisma command-line tool
# brings Prisma Studio, its own Postgres, React and a copy of TypeScript with
# it: hundreds of megabytes the running server never touches.
#
# The web app is in neither: it is static files, served from S3 and CloudFront.

FROM node:24-alpine AS base
RUN npm install -g pnpm@11.25.0
WORKDIR /repo

# ---- build: every dependency, then bundle the API ----
FROM base AS build
RUN apk add --no-cache openssl

# Manifests first, so dependencies are only reinstalled when they change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma

# `prisma generate` runs on install and reads a connection string from
# prisma.config.ts, though it never connects. A placeholder is enough here and
# is not kept in the image.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm install --frozen-lockfile --filter @loom/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm -F @loom/api build

# ---- migrate: the build stage already has the Prisma CLI ----
FROM build AS migrate
WORKDIR /repo/apps/api
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---- production dependencies only ----
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# No install scripts: the only one is `prisma generate`, and its output is
# already inside the bundle. The download cache goes in the same step, or it
# would stay in the image forever.
#
# pnpm still installs the Prisma CLI here, because @prisma/client names it as a
# peer. The server never runs it, so it and what only it uses (Studio, its
# built-in Postgres, TypeScript) are deleted.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @loom/api... \
    && rm -rf /root/.local/share/pnpm /root/.cache \
    && cd node_modules/.pnpm \
    && rm -rf prisma@* @prisma+studio-core@* @electric-sql+pglite* \
       @typescript+* typescript@* react-dom@* elkjs@*

# ---- run: plain Node, the bundle and its dependencies ----
FROM node:24-alpine AS run
WORKDIR /repo
COPY --from=prod-deps /repo /repo
COPY --from=build /repo/apps/api/dist apps/api/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Nothing here needs root.
USER node
WORKDIR /repo/apps/api

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
