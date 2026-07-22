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

export const db =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: createAdapter() });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export type { User, AvailabilitySlot, Group, GroupMembership } from "../../prisma/generated/client";
export { Prisma, GroupRole } from "../../prisma/generated/client";
