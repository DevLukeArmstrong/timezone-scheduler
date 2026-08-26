// One-off/rerunnable admin task: gives PINNED_TIME_ZONES (see
// src/lib/timezone.ts) to any existing user who currently has zero favorite
// time zones — new registrations get this automatically (src/lib/services/users.ts);
// this is only for accounts created before that existed, or restored from an
// older backup that predates it. Safe to run repeatedly: only touches users
// with no rows yet, via `ON CONFLICT DO NOTHING` against the unique
// (userId, timeZone) constraint.
//
// Usage:
//   docker compose run --rm migrate node scripts/seed-default-favorite-timezones.mjs

import "dotenv/config"; // loads .env locally; no-ops in Docker, where compose already sets DATABASE_URL
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const PINNED_TIME_ZONES = ["America/Vancouver", "Australia/Melbourne", "Pacific/Auckland"];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: users } = await client.query(
  'SELECT id FROM "User" WHERE id NOT IN (SELECT DISTINCT "userId" FROM "FavoriteTimeZone")',
);

for (const user of users) {
  for (const [position, timeZone] of PINNED_TIME_ZONES.entries()) {
    await client.query(
      'INSERT INTO "FavoriteTimeZone" (id, "userId", "timeZone", "position") VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [randomUUID(), user.id, timeZone, position],
    );
  }
}

await client.end();
console.log(`Seeded default time zones for ${users.length} user(s).`);
