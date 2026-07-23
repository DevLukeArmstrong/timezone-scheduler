import { isSameDay } from "date-fns";
import type { GroupAvailabilitySlot } from "@/lib/services/availability";
import { utcToWallClock } from "@/lib/timezone";
import {
  deleteCalendarAvailabilityBatchAction,
  deleteCalendarAvailabilitySlotAction,
} from "@/app/calendar/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

function formatSlot(slot: GroupAvailabilitySlot, timeZone: string, showGroupName: boolean): string {
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
    // A slot spanning midnight (or several days) — show both dates so it's
    // clear the end time belongs to a different day.
    : `${dateFmt.format(start)} ${timeFmt.format(start)} → ${dateFmt.format(end)} ${timeFmt.format(end)}`;

  return showGroupName ? `${range} · ${slot.group.name}` : range;
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
                    all
                  </ConfirmSubmitButton>
                </form>
              )}
              <form action={deleteCalendarAvailabilitySlotAction.bind(null, slot.id)}>
                <ConfirmSubmitButton
                  confirmMessage={`Remove this availability slot (${label})?`}
                  title="Remove this slot"
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
