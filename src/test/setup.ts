import { vi } from "vitest";

// Unit tests exercise pure functions (message copy, schedule math,
// interval logic) and must never open a database connection. Anything that
// reaches `db` from a test is a test that belongs elsewhere — fail loudly
// instead of trying to connect. The Prisma enums/types are real.
vi.mock("@/lib/db", async () => {
  const generated = await vi.importActual<typeof import("../../prisma/generated/client")>(
    "../../prisma/generated/client",
  );
  const db = new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(
          `Unit tests must not touch the database (accessed db.${String(property)}).`,
        );
      },
    },
  );
  return { ...generated, db };
});
