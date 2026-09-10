import { isSameDay } from "date-fns";
import type { GroupAvailabilitySlot } from "@/lib/services/availability";
import {
  dateOnlyToLocalDateParts,
  formatLocalDateParts,
  formatMinutesAsTime,
  utcToWallClock,
} from "@/lib/timezone";
import {
  deleteCalendarAvailabilityBatchAction,
  deleteCalendarAvailabilitySlotAction,
} from "@/app/calendar-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function formatOneOff(
  slot: GroupAvailabilitySlot,
  timeZone: string,
  showGroupName: boolean,
): string {
  const start = utcToWallClock(slot.startTime, timeZone);
  const end = utcToWallClock(slot.endTime, timeZone);
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  const range = isSameDay(start, end)
    ? `${dateFmt.format(start)} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`
    : `${dateFmt.format(start)} ${timeFmt.format(start)} → ${dateFmt.format(end)} ${timeFmt.format(end)}`;

  return showGroupName ? `${range} · ${slot.group.name}` : range;
}

function formatRecurring(
  slot: GroupAvailabilitySlot,
  showGroupName: boolean,
): string {
  const rule = slot.recurrence;
  if (!rule) return formatOneOff(slot, "UTC", showGroupName);

  const days =
    rule.daysOfWeek == null
      ? "Every day"
      : WEEKDAY_LABELS.filter((_, index) => (rule.daysOfWeek! & (1 << index)) !== 0).join(
          ", ",
        );

  const start = formatMinutesAsTime(rule.startMinute);
  const end = formatMinutesAsTime(rule.endMinute);
  const spansMidnight = rule.endMinute < rule.startMinute;
  const time = spansMidnight ? `${start}–${end} (+1 day)` : `${start}–${end}`;

  const rangeParts: string[] = [];
  if (rule.rangeStart) {
    rangeParts.push(formatLocalDateParts(dateOnlyToLocalDateParts(rule.rangeStart)));
  }
  if (rule.rangeEnd) {
    rangeParts.push(formatLocalDateParts(dateOnlyToLocalDateParts(rule.rangeEnd)));
  }
  const range =
    rangeParts.length === 0
      ? "open-ended"
      : rangeParts.length === 1
        ? rule.rangeStart
          ? `from ${rangeParts[0]}`
          : `until ${rangeParts[0]}`
        : `${rangeParts[0]}–${rangeParts[1]}`;

  const summary = `↻ ${days} · ${time} · ${range}`;
  return showGroupName ? `${summary} · ${slot.group.name}` : summary;
}

function formatSlot(
  slot: GroupAvailabilitySlot,
  timeZone: string,
  showGroupName: boolean,
): string {
  return slot.recurrence
    ? formatRecurring(slot, showGroupName)
    : formatOneOff(slot, timeZone, showGroupName);
}

export function SlotList({
  slots,
  timeZone,
}: {
  slots: GroupAvailabilitySlot[];
  timeZone: string;
}) {
  if (slots.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-400 dark:border-zinc-700">
        No availability yet — add a window above.
      </p>
    );
  }

  // Once the viewer's own slots span more than one group, each entry needs
  // its group name to stay unambiguous.
  const showGroupName = new Set(slots.map((slot) => slot.group.id)).size > 1;

  return (
    <ul className="space-y-2">
      {slots.map((slot) => {
        const label = formatSlot(slot, timeZone, showGroupName);
        const isRecurring = Boolean(slot.recurrence);
        return (
          <li
            key={slot.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <span>{label}</span>
            <div className="flex shrink-0 items-center gap-1">
              {slot.batchId && (
                <form
                  action={deleteCalendarAvailabilityBatchAction.bind(null, slot.batchId)}
                >
                  <ConfirmSubmitButton
                    confirmMessage={`Remove this availability from every group it was added to (${label})?`}
                    title="Remove from all groups in this batch"
                    className="rounded-md px-1.5 py-0.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    batch
                  </ConfirmSubmitButton>
                </form>
              )}
              <form action={deleteCalendarAvailabilitySlotAction.bind(null, slot.id)}>
                <ConfirmSubmitButton
                  confirmMessage={
                    isRecurring
                      ? `Remove the entire recurring series (${label})?`
                      : `Remove this availability slot (${label})?`
                  }
                  title={isRecurring ? "Remove entire series" : "Remove this slot"}
                  className="rounded-md px-1.5 py-0.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  ✕
                </ConfirmSubmitButton>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
