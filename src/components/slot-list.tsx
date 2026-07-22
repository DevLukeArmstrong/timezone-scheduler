import type { AvailabilitySlot } from "@/lib/db";
import { utcToWallClock } from "@/lib/timezone";
import { deleteAvailabilitySlotAction } from "@/app/dashboard/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

function formatSlot(slot: AvailabilitySlot, timeZone: string): string {
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
  return `${dateFmt.format(start)} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

export function SlotList({
  slots,
  timeZone,
}: {
  slots: AvailabilitySlot[];
  timeZone: string;
}) {
  if (slots.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-400 dark:border-zinc-700">
        No availability yet — add a window above.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {slots.map((slot) => {
        const label = formatSlot(slot, timeZone);
        return (
          <li
            key={slot.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <span>{label}</span>
            <form action={deleteAvailabilitySlotAction.bind(null, slot.id)}>
              <ConfirmSubmitButton
                confirmMessage={`Remove this availability slot (${label})?`}
                title="Remove this slot"
                className="shrink-0 rounded-md px-1.5 py-0.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                ✕
              </ConfirmSubmitButton>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
