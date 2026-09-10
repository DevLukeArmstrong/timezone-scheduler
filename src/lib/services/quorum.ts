import { db } from "@/lib/db";
import { discordTimeRange, escapeDiscordMarkdown, sendDiscordMessage } from "@/lib/discord";
import {
  findQuorumWindows,
  reconcileQuorumWindows,
  type MemberWindow,
  type QuorumWindow,
} from "@/lib/quorum";
import {
  expandSlotsToOccurrences,
  listAvailabilitySlotsForGroups,
} from "@/lib/services/availability";

/**
 * How long a group's `quorumDirtyAt` must be before it's evaluated. A slot
 * write never computes anything itself — it only stamps the group — so a
 * burst of edits (delete, re-add, adjust, four friends filling in on the
 * same evening) collapses into one evaluation and at most one post.
 */
export const QUORUM_DEBOUNCE_MS = 2 * 60 * 1000;

/** Overlaps more than two weeks out aren't actionable; don't post about them yet. */
export const QUORUM_LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000;

export interface QuorumEvaluationSummary {
  groupsEvaluated: number;
  postsSent: number;
  /** Groups whose webhook rejected the post; left dirty so they're retried. */
  failed: number;
}

/**
 * Evaluates every group that has been dirty for at least
 * {@link QUORUM_DEBOUNCE_MS} and has a Discord channel. Called once per
 * scheduler tick; `ignoreDebounce` is for the manual cron route.
 *
 * Groups without a webhook are left dirty rather than evaluated: the flag
 * then survives until an admin connects a channel, at which point the
 * first evaluation posts every quorum currently on the calendar — a
 * reasonable "here's what's on" welcome.
 */
export async function evaluateDirtyGroupQuorums(
  now: Date = new Date(),
  options: { ignoreDebounce?: boolean } = {},
): Promise<QuorumEvaluationSummary> {
  const cutoff = options.ignoreDebounce ? now : new Date(now.getTime() - QUORUM_DEBOUNCE_MS);
  const groups = await db.group.findMany({
    where: { quorumDirtyAt: { not: null, lte: cutoff }, discordWebhookUrl: { not: null } },
    select: { id: true },
  });

  const summary: QuorumEvaluationSummary = { groupsEvaluated: 0, postsSent: 0, failed: 0 };
  for (const { id } of groups) {
    const outcome = await evaluateGroupQuorum(id, now);
    summary.groupsEvaluated++;
    if (outcome === "posted") summary.postsSent++;
    if (outcome === "failed") summary.failed++;
  }
  return summary;
}

/**
 * One group's full evaluation: prune expired alerts, compute this
 * fortnight's quorum windows from current members' availability, reconcile
 * against stored alerts, post whatever is genuinely new, persist. The
 * dirty flag is cleared only if nothing re-dirtied the group meanwhile
 * (compare-and-clear on the timestamp we read), and only after a
 * successful post — a failed webhook leaves the group dirty for the next
 * tick, and since no alert rows were written, that retry posts again.
 */
export async function evaluateGroupQuorum(
  groupId: string,
  now: Date = new Date(),
): Promise<"posted" | "quiet" | "failed" | "skipped"> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      discordWebhookUrl: true,
      quorumThreshold: true,
      quorumDirtyAt: true,
      memberships: {
        select: {
          user: { select: { id: true, name: true, email: true, notifyOverlap: true } },
        },
      },
    },
  });
  if (!group || !group.discordWebhookUrl) return "skipped";

  const dirtyAt = group.quorumDirtyAt;
  const members = new Map(group.memberships.map(({ user }) => [user.id, user]));
  const horizon = { start: now, end: new Date(now.getTime() + QUORUM_LOOKAHEAD_MS) };

  await db.quorumAlert.deleteMany({ where: { groupId, endTime: { lt: now } } });

  // Slots of people who have since left the group are still rows in the
  // table; only current members can make a quorum.
  const slots = await listAvailabilitySlotsForGroups([groupId]);
  const windows: MemberWindow[] = expandSlotsToOccurrences(slots, horizon)
    .filter((occurrence) => members.has(occurrence.user.id))
    .map((occurrence) => ({
      userId: occurrence.user.id,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
    }));

  const quorumWindows = findQuorumWindows(windows, group.quorumThreshold, horizon);
  const alerts = await db.quorumAlert.findMany({ where: { groupId } });
  const plan = reconcileQuorumWindows(quorumWindows, alerts, group.quorumThreshold, members.size);

  for (const { alertId, window } of plan.update) {
    await db.quorumAlert.update({
      where: { id: alertId },
      data: { memberIds: window.memberIds, startTime: window.startTime, endTime: window.endTime },
    });
  }

  let outcome: "posted" | "quiet" | "failed" = "quiet";
  const lines = [
    ...plan.upgrade.map(({ window }) => ({ window, everyone: true })),
    ...plan.post.map((window) => ({ window, everyone: window.memberIds.length >= members.size })),
  ].sort((a, b) => a.window.startTime.getTime() - b.window.startTime.getTime());

  if (lines.length > 0) {
    const content = quorumAlertMessage(
      group.name,
      lines.map(({ window, everyone }) => ({
        ...window,
        everyone,
        named: window.memberIds
          .map((id) => members.get(id)!)
          .filter((user) => user.notifyOverlap)
          .map((user) => escapeDiscordMarkdown(user.name?.trim() || user.email)),
      })),
    );
    try {
      await sendDiscordMessage(group.discordWebhookUrl, content);
      outcome = "posted";
    } catch (error) {
      console.error(`Quorum alert post failed for group ${groupId}:`, error);
      return "failed";
    }

    for (const { alertId } of plan.upgrade) {
      await db.quorumAlert.update({ where: { id: alertId }, data: { everyone: true } });
    }
    for (const window of plan.post) {
      await db.quorumAlert.create({
        data: {
          groupId,
          memberIds: window.memberIds,
          startTime: window.startTime,
          endTime: window.endTime,
          everyone: window.memberIds.length >= members.size,
        },
      });
    }
  }

  // Compare-and-clear: a write that landed during this evaluation bumped
  // the timestamp, and that newer value must survive to trigger another pass.
  await db.group.updateMany({
    where: { id: groupId, quorumDirtyAt: dirtyAt },
    data: { quorumDirtyAt: null },
  });

  return outcome;
}

export interface QuorumAlertLine extends QuorumWindow {
  everyone: boolean;
  /** Display names of members who haven't opted out of being named, already escaped. */
  named: string[];
}

/** The message body — exported for tests and for eyeballing the copy. */
export function quorumAlertMessage(groupName: string, lines: QuorumAlertLine[]): string {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const out = [`🎉 **Free together** · *${escapeDiscordMarkdown(groupName)}*`];

  for (const line of lines) {
    const count = line.memberIds.length;
    const who = line.everyone ? `All ${count} of you` : `${count} of you`;
    const unnamed = count - line.named.length;
    const people = [...line.named];
    if (unnamed > 0) people.push(`${unnamed} other${unnamed === 1 ? "" : "s"}`);
    out.push(`• **${who}** — ${discordTimeRange(line.startTime, line.endTime)}: ${joinNames(people)}`);
  }

  out.push(`<${appUrl}>`);
  return out.join("\n");
}

function joinNames(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
