/**
 * DB smoke test for member-owned Discord webhooks: seeds a group whose
 * channel and members all point at a local HTTP server, runs the real
 * notification jobs, and asserts exactly who received what.
 *
 * The webhook URLs are written straight to the database so they can point
 * at localhost — `isDiscordWebhookUrl` guards the save path, not the send
 * path, which is what makes this possible without touching Discord.
 *
 * Run: npx tsx scripts/verify-member-discord-webhooks.mts
 */
import "dotenv/config";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { announceNewAvailability } from "../src/lib/services/notifications";
import { sendWeeklyAvailabilityReminders } from "../src/lib/services/reminders";
import { evaluateGroupQuorum } from "../src/lib/services/quorum";
import { db } from "../src/lib/db";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ok  ${message}`);
}

/** Every delivery the jobs made, as "<label>" taken from the webhook path. */
const received: string[] = [];

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    received.push((req.url ?? "").replace(/^\//, ""));
    res.writeHead(204).end();
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;
const hook = (label: string) => `http://127.0.0.1:${port}/${label}`;

const stamp = Date.now();
const ids: { users: string[]; groups: string[] } = { users: [], groups: [] };

try {
  // alice acts and has her own server; bob has one and wants everything;
  // carol has one but has opted out of new-availability posts; dave has none.
  const users = await Promise.all(
    (
      [
        ["alice", true],
        ["bob", true],
        ["carol", false],
        ["dave", true],
      ] as const
    ).map(([name, notifyNewAvailability]) =>
      db.user.create({
        data: {
          email: `${name}-${stamp}@verify.local`,
          name,
          passwordHash: "x",
          timezone: "Pacific/Auckland",
          notifyNewAvailability,
          notifyReminder: true,
        },
        select: { id: true, name: true },
      }),
    ),
  );
  ids.users = users.map((u) => u.id);
  const byName = new Map(users.map((u) => [u.name!, u.id]));

  const group = await db.group.create({
    data: {
      name: `Verify ${stamp}`,
      ownerId: byName.get("alice")!,
      inviteToken: `verify-${stamp}`,
      discordWebhookUrl: hook("channel"),
      memberships: {
        create: [
          { userId: byName.get("alice")!, role: "OWNER", discordWebhookUrl: hook("alice") },
          { userId: byName.get("bob")!, role: "MEMBER", discordWebhookUrl: hook("bob") },
          { userId: byName.get("carol")!, role: "MEMBER", discordWebhookUrl: hook("carol") },
          { userId: byName.get("dave")!, role: "MEMBER" },
        ],
      },
    },
    select: { id: true },
  });
  ids.groups = [group.id];

  console.log("\n— new availability, posted by alice —");
  received.length = 0;
  await announceNewAvailability({
    actorUserId: byName.get("alice")!,
    groupIds: [group.id],
    window: {
      kind: "one-off",
      startTime: new Date("2027-01-08T07:00:00Z"),
      endTime: new Date("2027-01-08T10:00:00Z"),
    },
  });
  const sorted = [...received].sort();
  assert(sorted.includes("channel"), "the group channel is told");
  assert(sorted.includes("bob"), "bob's own server is told");
  assert(!sorted.includes("alice"), "alice's own server is NOT told about alice's own action");
  assert(!sorted.includes("carol"), "carol opted out of new-availability, so is not told");
  assert(sorted.length === 2, `exactly two deliveries, got ${JSON.stringify(sorted)}`);

  console.log("\n— weekly reminder (nobody has availability) —");
  received.length = 0;
  const first = await sendWeeklyAvailabilityReminders(new Date());
  const firstSorted = [...received].sort();
  assert(firstSorted.join() === "alice,bob,carol,channel", `channel + 3 members, got ${firstSorted}`);
  assert(first.postsSent >= 1, `summary counted a post (${JSON.stringify(first)})`);
  assert(!firstSorted.includes("dave"), "dave has no webhook, so nothing is sent for him");

  console.log("\n— the same reminder again: per-target dedupe —");
  received.length = 0;
  await sendWeeklyAvailabilityReminders(new Date());
  assert(received.length === 0, `no duplicate deliveries, got ${JSON.stringify(received)}`);

  console.log("\n— a group with NO channel, one member's own server —");
  received.length = 0;
  await db.group.update({ where: { id: group.id }, data: { discordWebhookUrl: null } });
  await db.notificationLog.deleteMany({ where: { groupId: group.id } });
  await sendWeeklyAvailabilityReminders(new Date());
  const noChannel = [...received].sort();
  assert(
    noChannel.join() === "alice,bob,carol",
    `members still get it with no channel at all, got ${noChannel}`,
  );

  console.log("\n— quorum alert, group still has no channel —");
  received.length = 0;
  // Three overlapping windows a few days out, which is the default threshold.
  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  await db.availabilitySlot.createMany({
    data: ["alice", "bob", "carol"].map((name) => ({
      userId: byName.get(name)!,
      groupId: group.id,
      startTime: start,
      endTime: end,
    })),
  });
  await db.group.update({ where: { id: group.id }, data: { quorumDirtyAt: new Date() } });

  const outcome = await evaluateGroupQuorum(group.id, new Date());
  const quorumTargets = [...received].sort();
  assert(outcome === "posted", `quorum posted with no group channel (got "${outcome}")`);
  assert(
    quorumTargets.join() === "alice,bob,carol",
    `each member's own server got the overlap alert, got ${quorumTargets}`,
  );

  console.log("\n— quorum with a member who opted out of overlap alerts —");
  received.length = 0;
  await db.user.update({
    where: { id: byName.get("bob")! },
    data: { notifyOverlap: false },
  });
  await db.quorumAlert.deleteMany({ where: { groupId: group.id } });
  await db.group.update({ where: { id: group.id }, data: { quorumDirtyAt: new Date() } });
  await evaluateGroupQuorum(group.id, new Date());
  const afterOptOut = [...received].sort();
  assert(
    !afterOptOut.includes("bob"),
    `bob opted out of overlap alerts, so is not told, got ${afterOptOut}`,
  );
  assert(afterOptOut.includes("alice"), "alice still gets it");

  console.log("\nAll member-webhook fan-out checks passed.");
} finally {
  // NotificationLog and GroupMembership cascade from group/user deletes.
  for (const id of ids.groups) await db.group.delete({ where: { id } }).catch(() => {});
  for (const id of ids.users) await db.user.delete({ where: { id } }).catch(() => {});
  server.close();
  await db.$disconnect();
}
