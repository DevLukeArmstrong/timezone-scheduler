# Multi-stage build for self-hosting on Proxmox (see docker-compose.yml).
#
# - `builder` keeps the full node_modules, including the Prisma CLI's schema
#   engine — used both to build the app and (via the `migrate` service in
#   docker-compose.yml) to run `prisma migrate deploy` against the DB.
# - `runner` only contains what `next build`'s `output: "standalone"` traced
#   as actually required at runtime (see next.config.ts), which keeps the
#   final image small and dependency-free.
# Node 24 (LTS), not 20: Node bundles its own copy of the IANA time zone
# database, and Node 20 is end-of-life with tzdata 2025c — from before BC,
# Alberta, the NWT and Manitoba moved to permanent daylight time on
# 2026-11-01. Every server-side conversion for those zones (the calendar
# render, saved slots, Discord posts) came out an hour off. See
# prisma/migrations/20261114120000_fix_canada_permanent_dst_slots.
#
# Deploy with `docker compose build --pull` now and then: the major-version
# tag picks up new tzdata in Node's patch releases, but only if the base
# image is actually re-pulled rather than reused from the local cache.
FROM node:24-bookworm-slim AS base
WORKDIR /app
# Refuse to build on a runtime whose tz data is older than the newest change
# this app knows about, rather than quietly shipping times that are an hour
# off. Raise MIN_TZDATA when a future tz change affects the group.
ARG MIN_TZDATA=2026e
RUN node -e "const v = process.versions.tz; if (v < process.argv[1]) { console.error('Node ' + process.version + ' has tzdata ' + v + ', need ' + process.argv[1] + ' or newer. Rebuild with --pull, or move to a newer Node base image.'); process.exit(1); } console.log('tzdata', v);" "$MIN_TZDATA"

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
