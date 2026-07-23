import { PrismaClient } from "../../prisma/generated/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

function createAdapter() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";

  if (url.startsWith("postgresql://") || url.startsWith("postgres://")) {
    return new PrismaPg({ connectionString: url });
  }

  return new PrismaBetterSqlite3({ url });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: createAdapter() });
}

/**
 * Dev HMR keeps a PrismaClient on `globalThis` across module reloads. After
 * `prisma generate` adds models, that cached instance can still be the old
 * client (missing new delegates) and throw PrismaClientValidationError on
 * includes like `recurrence`. Recreate when the cached client is stale.
 */
function getPrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (
    existing &&
    typeof (existing as { recurrenceRule?: unknown }).recurrenceRule === "object"
  ) {
    return existing;
  }
  return createPrismaClient();
}

export const db = getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export type {
  User,
  AvailabilitySlot,
  Group,
  GroupMembership,
  RecurrenceRule,
  RecurrenceException,
} from "../../prisma/generated/client";
export { Prisma, GroupRole } from "../../prisma/generated/client";
