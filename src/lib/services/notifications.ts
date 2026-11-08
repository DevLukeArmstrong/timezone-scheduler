import { db } from "@/lib/db";
import {
  discordTimeRange,
  discordTimestamp,
  escapeDiscordMarkdown,
} from "@/lib/discord";
import {
  collectGroupDiscordTargets,
  deliverToGroupDiscordTargets,
  GROUP_HAS_DISCORD_TARGET,
} from "@/lib/services/discord-targets";
import { WEEKDAY_BITS, type RecurrenceRuleInput } from "@/lib/recurrence";
import { formatLocalDateParts, formatMinutesAsTime } from "@/lib/timezone";

/**
 * What was just added, as the calendar action knows it. One-offs carry the
 * resolved UTC window; recurring rules carry the rule itself plus the
 * first concrete occurrence, so the post can say both "every Mon/Wed
 * 19:00–22:00 NZ time" and "first one is <t:…>" in the reader's own zone.
 */
export type NewAvailabilityWindow =
  | { kind: "one-off"; startTime: Date; endTime: Date }
  | { kind: "recurring"; rule: RecurrenceRuleInput; firstStart: Date; firstEnd: Date };

export interface AnnounceNewAvailabilityInput {
  actorUserId: string;
  /** Groups the window was successfully added to. */
  groupIds: string[];
  window: NewAvailabilityWindow;
}

/**
 * Posts "<name> is free <when>" to each group's Discord channel, and to the
 * server of any member who has connected their own. Runs after the response
 * has been sent (the calendar action wraps it in `after()`), so Discord
 * latency never delays the UI and a Discord failure never fails the save —
 * every error path here logs and returns.
 *
 * Honours the *actor's* `notifyNewAvailability`: that opt-out means "don't
 * announce what I do", so it suppresses the announcement everywhere.
 *
 * Personal webhooks additionally honour the *recipient's* own
 * `notifyNewAvailability`, which a shared channel could never do — and the
 * actor's own server is skipped, since echoing your own action back at you
 * is noise. The group channel is unaffected by both.
 */
export async function announceNewAvailability(
  input: AnnounceNewAvailabilityInput,
): Promise<void> {
  try {
    const actor = await db.user.findUnique({
      where: { id: input.actorUserId },
      select: { name: true, email: true, notifyNewAvailability: true },
    });
    if (!actor || !actor.notifyNewAvailability || input.groupIds.length === 0) return;

    const groups = await db.group.findMany({
      where: { id: { in: input.groupIds }, ...GROUP_HAS_DISCORD_TARGET },
      select: {
        id: true,
        name: true,
        discordWebhookUrl: true,
        memberships: {
          select: {
            userId: true,
            discordWebhookUrl: true,
            user: { select: { notifyNewAvailability: true } },
          },
        },
      },
    });

    const who = escapeDiscordMarkdown(actor.name?.trim() || actor.email);
    for (const group of groups) {
      const wantsIt = new Map(
        group.memberships.map((m) => [m.userId, m.user.notifyNewAvailability]),
      );
      const targets = collectGroupDiscordTargets(group, {
        excludeMemberId: input.actorUserId,
        memberFilter: (userId) => wantsIt.get(userId) === true,
      });
      if (targets.length === 0) continue;

      const content = newAvailabilityMessage(who, group.name, input.window);
      await deliverToGroupDiscordTargets(targets, content, `new-availability group ${group.id}`);
    }
  } catch (error) {
    console.error("announceNewAvailability failed:", error);
  }
}

/** The message body — exported for tests and for eyeballing the copy. */
export function newAvailabilityMessage(
  who: string,
  groupName: string,
  window: NewAvailabilityWindow,
): string {
  const group = `*${escapeDiscordMarkdown(groupName)}*`;
  if (window.kind === "one-off") {
    return `📅 **${who}** is free ${discordTimeRange(window.startTime, window.endTime)} · ${group}`;
  }

  const { rule } = window;
  const days = describeDaysOfWeek(rule.daysOfWeek ?? null);
  const hours = `${formatMinutesAsTime(rule.startMinute)}–${formatMinutesAsTime(rule.endMinute)}`;
  const bounds: string[] = [];
  if (rule.rangeStart) bounds.push(`from ${formatLocalDateParts(rule.rangeStart)}`);
  if (rule.rangeEnd) bounds.push(`until ${formatLocalDateParts(rule.rangeEnd)}`);
  const boundsText = bounds.length ? ` ${bounds.join(" ")}` : "";

  return (
    `🔁 **${who}** is free ${days} ${hours} (${rule.timeZone})${boundsText} · ${group}\n` +
    `First one: ${discordTimestamp(window.firstStart, "F")} – ${discordTimestamp(window.firstEnd, "t")}`
  );
}

const WEEKDAY_LABELS: Array<[number, string]> = [
  [WEEKDAY_BITS.mon, "Mon"],
  [WEEKDAY_BITS.tue, "Tue"],
  [WEEKDAY_BITS.wed, "Wed"],
  [WEEKDAY_BITS.thu, "Thu"],
  [WEEKDAY_BITS.fri, "Fri"],
  [WEEKDAY_BITS.sat, "Sat"],
  [WEEKDAY_BITS.sun, "Sun"],
];

function describeDaysOfWeek(mask: number | null): string {
  if (mask === null) return "every day";
  const names = WEEKDAY_LABELS.filter(([bit]) => mask & bit).map(([, name]) => name);
  if (names.length === 7) return "every day";
  if (names.length === 1) return `every ${names[0]}`;
  return `every ${names.join("/")}`;
}
