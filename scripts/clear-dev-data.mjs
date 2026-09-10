// Removes everything scripts/seed-dev-data.mjs created.
//
// Deletes exactly the users on the @dev.local email domain. Their groups,
// memberships, availability slots, recurrence rules and favorite time zones
// all go with them via ON DELETE CASCADE, so nothing else needs deleting by
// hand. Safe to run repeatedly.
//
// Like the seeder, this refuses to run against a non-local database.
//
// Usage:
//   node scripts/clear-dev-data.mjs

import "dotenv/config";
import { Client } from "pg";

const DEV_EMAIL_DOMAIN = "dev.local";

function assertLocal(connectionString) {
  const host = new URL(connectionString).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    console.error(
      `Refusing to delete: DATABASE_URL points at "${host}", which is not a local database.`,
    );
    process.exit(1);
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
assertLocal(connectionString);

const client = new Client({ connectionString });
await client.connect();

try {
  const { rows } = await client.query(
    `DELETE FROM "User" WHERE email LIKE $1 RETURNING email`,
    [`%@${DEV_EMAIL_DOMAIN}`],
  );
  if (rows.length === 0) {
    console.log("No development fixtures found — nothing to remove.");
  } else {
    console.log(`Removed ${rows.length} development user(s) and everything they owned:`);
    for (const row of rows) console.log(`  ${row.email}`);
  }
} finally {
  await client.end();
}
