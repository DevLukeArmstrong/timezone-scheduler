// Development fixtures ONLY. Creates a handful of throwaway accounts, groups
// and availability windows so the calendar has something to render locally.
//
// Every account it creates uses the @dev.local email domain, which is what
// makes it removable: `node scripts/clear-dev-data.mjs` deletes exactly those
// users, and the ON DELETE CASCADE foreign keys take their groups,
// memberships, slots and recurrence rules with them.
//
// REFUSES TO RUN against anything but a local database (see assertLocal
// below) — these rows must never reach the postgres-db LXC.
//
// Usage:
//   docker compose -f docker-compose.dev.yml up -d
//   node scripts/seed-dev-data.mjs
//
// Talks to Postgres directly with `pg` rather than the generated Prisma
// client, for the same reason scripts/reset-password.mjs does: that client is
// generated as TypeScript meant to be built alongside the app, not imported
// by a plain `node` script.

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12; // matches src/lib/password.ts
const DEV_EMAIL_DOMAIN = "dev.local";
const DEV_PASSWORD = "devpassword123";

/**
 * Hard stop unless DATABASE_URL is unmistakably a local database. Seeding
 * fake users into the production database would put them in front of real
 * users on scheduler.uncleluke.dev, so this errs heavily on the side of
 * refusing: only localhost/127.0.0.1 pass, and the production host is named
 * explicitly so the failure message is obvious rather than cryptic.
 */
function assertLocal(connectionString) {
  const url = new URL(connectionString);
  const host = url.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";

  if (!isLocal) {
    console.error(
      `Refusing to seed: DATABASE_URL points at "${host}", which is not a local database.`,
    );
    if (host === "10.0.0.195") {
      console.error(
        "That is the production postgres-db LXC. Start the local database with\n" +
          "  docker compose -f docker-compose.dev.yml up -d\n" +
          "and make sure .env's active DATABASE_URL is the localhost:5433 one.",
      );
    }
    process.exit(1);
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
assertLocal(connectionString);

/**
 * A UTC instant written as a wall-clock time with an explicit offset, e.g.
 * ("2026-09-09T19:00", "-07:00") — September in Vancouver is PDT (UTC-7).
 * Being explicit keeps the fixtures readable as local times while still
 * storing exact instants, which is what the app expects.
 */
function at(localIso, offset) {
  return new Date(`${localIso}:00${offset}`);
}

const PT = "-07:00"; // America/Vancouver in September (PDT)

// Bitmask of weekdays, bit 0 = Monday … bit 6 = Sunday (see RecurrenceRule).
const MON_TO_FRI = 0b0011111;

const client = new Client({ connectionString });
await client.connect();

async function createUser({ email, name, timezone, favoriteTimeZones = [] }) {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);
  await client.query(
    `INSERT INTO "User" (id, email, name, "passwordHash", timezone, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [id, email, name, passwordHash, timezone],
  );
  for (const [position, timeZone] of favoriteTimeZones.entries()) {
    await client.query(
      `INSERT INTO "FavoriteTimeZone" (id, "userId", "timeZone", position)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), id, timeZone, position],
    );
  }
  return id;
}

async function createGroup({ name, ownerId, memberIds }) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO "Group" (id, name, "ownerId", "inviteToken", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW())`,
    [id, name, ownerId, randomUUID().replace(/-/g, "")],
  );
  await client.query(
    `INSERT INTO "GroupMembership" (id, "groupId", "userId", role)
     VALUES ($1, $2, $3, 'OWNER')`,
    [randomUUID(), id, ownerId],
  );
  for (const userId of memberIds) {
    if (userId === ownerId) continue;
    await client.query(
      `INSERT INTO "GroupMembership" (id, "groupId", "userId", role)
       VALUES ($1, $2, $3, 'MEMBER')`,
      [randomUUID(), id, userId],
    );
  }
  return id;
}

async function createSlot({ userId, groupId, start, end }) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO "AvailabilitySlot" (id, "userId", "groupId", "startTime", "endTime")
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, groupId, start, end],
  );
  return id;
}

async function createRecurringSlot({
  userId,
  groupId,
  firstStart,
  firstEnd,
  timeZone,
  startMinute,
  endMinute,
  daysOfWeek,
  rangeStart = null,
  rangeEnd = null,
}) {
  const slotId = await createSlot({ userId, groupId, start: firstStart, end: firstEnd });
  await client.query(
    `INSERT INTO "RecurrenceRule"
       (id, "slotId", "timeZone", "startMinute", "endMinute", "daysOfWeek", "rangeStart", "rangeEnd")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), slotId, timeZone, startMinute, endMinute, daysOfWeek, rangeStart, rangeEnd],
  );
  return slotId;
}

try {
  await client.query("BEGIN");

  const luke = await createUser({
    email: `luke@${DEV_EMAIL_DOMAIN}`,
    name: "Luke (test)",
    timezone: "America/Vancouver",
    favoriteTimeZones: ["Australia/Melbourne", "Pacific/Auckland"],
  });
  const sam = await createUser({
    email: `sam@${DEV_EMAIL_DOMAIN}`,
    name: "Sam Rivera",
    timezone: "Australia/Melbourne",
  });
  const mia = await createUser({
    email: `mia@${DEV_EMAIL_DOMAIN}`,
    name: "Mia Chen",
    timezone: "Pacific/Auckland",
  });
  const tom = await createUser({
    email: `tom@${DEV_EMAIL_DOMAIN}`,
    name: "Tom Okafor",
    timezone: "Europe/London",
  });

  const crew = await createGroup({
    name: "Dev Test Crew",
    ownerId: luke,
    memberIds: [sam, mia, tom],
  });
  const raids = await createGroup({
    name: "Weekend Raids",
    ownerId: luke,
    memberIds: [sam],
  });

  // The week of Mon 2026-09-07 – Sun 2026-09-13, chosen to exercise every
  // case the grid has to lay out. Times below are Vancouver wall-clock.

  // Three-way overlap on Wednesday evening — forces three side-by-side lanes
  // in the busiest part of the peak band.
  await createSlot({ userId: luke, groupId: crew, start: at("2026-09-09T19:00", PT), end: at("2026-09-09T22:00", PT) });
  await createSlot({ userId: sam, groupId: crew, start: at("2026-09-09T19:30", PT), end: at("2026-09-09T21:00", PT) });
  await createSlot({ userId: mia, groupId: crew, start: at("2026-09-09T20:00", PT), end: at("2026-09-09T23:00", PT) });

  // Spans midnight, so it is clipped into two days AND crosses the peak /
  // off-peak boundary — the case that breaks any layout which drops or
  // splits the collapsed hours rather than compressing them.
  await createSlot({ userId: tom, groupId: crew, start: at("2026-09-08T23:00", PT), end: at("2026-09-09T02:00", PT) });

  // Entirely inside the off-peak band: must still be visible as a sliver.
  await createSlot({ userId: mia, groupId: crew, start: at("2026-09-10T02:00", PT), end: at("2026-09-10T05:00", PT) });

  // Very long window across the whole peak band.
  await createSlot({ userId: sam, groupId: crew, start: at("2026-09-11T09:00", PT), end: at("2026-09-11T23:00", PT) });

  // Very short window — checks the minimum legible block height.
  await createSlot({ userId: luke, groupId: crew, start: at("2026-09-07T09:00", PT), end: at("2026-09-07T09:30", PT) });

  // Second group, same viewer — makes the calendar show group names on labels.
  await createSlot({ userId: luke, groupId: raids, start: at("2026-09-12T20:00", PT), end: at("2026-09-12T23:30", PT) });
  await createSlot({ userId: sam, groupId: raids, start: at("2026-09-12T21:00", PT), end: at("2026-09-13T01:00", PT) });

  // Recurring weekday lunch slot, so the grid renders expanded occurrences
  // and the "remove one occurrence vs whole series" controls appear.
  await createRecurringSlot({
    userId: luke,
    groupId: crew,
    firstStart: at("2026-09-07T12:00", PT),
    firstEnd: at("2026-09-07T13:00", PT),
    timeZone: "America/Vancouver",
    startMinute: 12 * 60,
    endMinute: 13 * 60,
    daysOfWeek: MON_TO_FRI,
    rangeStart: "2026-09-07",
    rangeEnd: "2026-10-31",
  });

  // Recurring early-morning slot, entirely inside the collapsed band.
  await createRecurringSlot({
    userId: tom,
    groupId: crew,
    firstStart: at("2026-09-07T05:00", PT),
    firstEnd: at("2026-09-07T07:00", PT),
    timeZone: "America/Vancouver",
    startMinute: 5 * 60,
    endMinute: 7 * 60,
    daysOfWeek: MON_TO_FRI,
    rangeStart: "2026-09-07",
    rangeEnd: "2026-10-31",
  });

  await client.query("COMMIT");

  console.log("Seeded development fixtures:");
  console.log(`  4 users  (all @${DEV_EMAIL_DOMAIN}, password: ${DEV_PASSWORD})`);
  console.log("  2 groups (Dev Test Crew, Weekend Raids)");
  console.log("  9 one-off slots + 2 recurring series, week of 2026-09-07");
  console.log("");
  console.log(`Sign in as luke@${DEV_EMAIL_DOMAIN} / ${DEV_PASSWORD}`);
  console.log("Remove everything again with: node scripts/clear-dev-data.mjs");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
