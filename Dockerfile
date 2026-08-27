# Multi-stage build for self-hosting on Proxmox (see docker-compose.yml).
#
# - `builder` keeps the full node_modules, including the Prisma CLI's schema
#   engine — used both to build the app and (via the `migrate` service in
#   docker-compose.yml) to run `prisma migrate deploy` against the DB.
# - `runner` only contains what `next build`'s `output: "standalone"` traced
#   as actually required at runtime (see next.config.ts), which keeps the
#   final image small and dependency-free.
FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
# better-sqlite3 has no prebuilt binary for every platform/Node-version
# combination, so npm sometimes falls back to compiling it from source —
# which needs a C++ toolchain and Python that the slim base image doesn't
# ship with. It's a devtime-only dependency (production always uses
# Postgres, see src/lib/db.ts), but `npm ci` still needs to build it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

FROM deps AS builder
COPY . .
# DATABASE_URL only needs to look like postgres here so `prisma generate`
# (run by `npm run build`) picks the Postgres adapter's types — no DB
# connection happens at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
