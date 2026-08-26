// One-off admin task: set a user's password directly, for when they're
// locked out and email isn't configured yet (see .env.example). Talks to
// Postgres directly with `pg` rather than the generated Prisma client,
// since that client is generated as TypeScript source meant to be built
// alongside the app — not something a plain `node` script can import
// without a build step.
//
// Usage (from the app VM, via the `migrate` service — it already has
// DATABASE_URL wired up):
//   docker compose run --rm migrate node scripts/reset-password.mjs <email> <new-password>
//
// Locally against SQLite dev data, use `npm run db:studio` instead — this
// script assumes a Postgres DATABASE_URL.

import "dotenv/config"; // loads .env locally; no-ops in Docker, where compose already sets DATABASE_URL
import { Client } from "pg";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12; // matches src/lib/password.ts
const MIN_PASSWORD_LENGTH = 8; // matches src/lib/services/users.ts

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error("Usage: node scripts/reset-password.mjs <email> <new-password>");
  process.exit(1);
}

if (newPassword.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  process.exit(1);
}

const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const result = await client.query(
  'UPDATE "User" SET "passwordHash" = $1 WHERE lower(email) = lower($2) RETURNING email',
  [passwordHash, email.trim()],
);

await client.end();

if (result.rowCount === 0) {
  console.error(`No user found with email "${email}".`);
  process.exit(1);
}

console.log(`Password updated for ${result.rows[0].email}.`);
