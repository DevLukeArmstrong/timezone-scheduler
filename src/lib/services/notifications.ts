import { db } from "@/lib/db";
import {
  discordTimeRange,
  discordTimestamp,
  escapeDiscordMarkdown,
  sendDiscordMessage,
} from "@/lib/discord";
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
 * Posts "<name> is free <when>" to each group's Discord channel. Runs
 * after the response has been sent (the calendar action wraps it in
 * `after()`), so Discord latency never delays the UI and a Discord failure
 * never fails the save — every error path here logs and returns.
 *
 * Honours the *actor's* `notifyNewAvailability`: on a shared channel the
 * only opt-out that can be enforced is "don't announce what I do".
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
      where: { id: { in: input.groupIds }, discordWebhookUrl: { not: null } },
      select: { id: true, name: true, discordWebhookUrl: true },
    });

    const who = escapeDiscordMarkdown(actor.name?.trim() || actor.email);
    for (const group of groups) {
      const content = newAvailabilityMessage(who, group.name, input.window);
      try {
        await sendDiscordMessage(group.discordWebhookUrl!, content);
      } catch (error) {
        console.error(`Discord new-availability post failed for group ${group.id}:`, error);
      }
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
