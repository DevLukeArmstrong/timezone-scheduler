import { isSameDay } from "date-fns";
import type { AvailabilitySlot } from "@/lib/db";
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  WEEKDAY_LABELS,
  layoutSlotsForWeek,
} from "@/lib/calendar";
import { utcToWallClock } from "@/lib/timezone";
import { deleteAvailabilitySlotAction } from "@/app/dashboard/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => i + GRID_START_HOUR,
);
const ROW_HEIGHT_REM = 4;

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display} ${period}`;
}

interface WeekCalendarProps {
  slots: AvailabilitySlot[];
  timeZone: string;
  weekDays: Date[];
}

export function WeekCalendar({ slots, timeZone, weekDays }: WeekCalendarProps) {
  const positioned = layoutSlotsForWeek(slots, timeZone, weekDays);
  const today = utcToWallClock(new Date(), timeZone);
  const gridHeight = `${HOURS.length * ROW_HEIGHT_REM}rem`;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] border-b border-zinc-200 dark:border-zinc-800">
        <div className="border-r border-zinc-200 p-2 dark:border-zinc-800" />
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={i}
              className={`border-r border-zinc-200 p-3 text-center last:border-r-0 dark:border-zinc-800 ${
                isToday ? "bg-zinc-50 dark:bg-zinc-800/50" : ""
              }`}
            >
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {WEEKDAY_LABELS[i]}
              </div>
              <div
                className={`mt-0.5 text-lg font-semibold ${
                  isToday
                    ? "text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))]">
        <div className="flex flex-col border-r border-zinc-200 dark:border-zinc-800">
          {HOURS.map((hour) => (
            <div
              key={hour}
              style={{ height: `${ROW_HEIGHT_REM}rem` }}
              className="flex items-start justify-end border-b border-zinc-100 px-2 py-1 text-xs text-zinc-400 last:border-b-0 dark:border-zinc-800/60"
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {weekDays.map((day, dayIndex) => (
          <div
            key={dayIndex}
            style={{ height: gridHeight }}
            className={`relative border-r border-zinc-100 last:border-r-0 dark:border-zinc-800/60 ${
              isSameDay(day, today) ? "bg-zinc-50/50 dark:bg-zinc-800/20" : ""
            }`}
          >
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: `${ROW_HEIGHT_REM}rem` }}
                className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60"
              />
            ))}

            {positioned
              .filter((p) => p.dayIndex === dayIndex)
              .map((p) => (
                <form
                  key={p.slot.id}
                  action={deleteAvailabilitySlotAction.bind(null, p.slot.id)}
                  className="group absolute inset-x-1 overflow-hidden rounded-md border border-emerald-300 bg-emerald-200/80 dark:border-emerald-700 dark:bg-emerald-900/60"
                  style={{ top: `${p.topPercent}%`, height: `${p.heightPercent}%` }}
                >
                  <ConfirmSubmitButton
                    confirmMessage={`Remove this availability slot (${p.label})?`}
                    title="Remove this slot"
                    className="absolute inset-0 flex h-full w-full flex-col items-start justify-start p-1.5 text-left"
                  >
                    <span className="truncate text-[11px] font-medium text-emerald-900 dark:text-emerald-100">
                      {p.label}
                    </span>
                    <span className="mt-auto text-[10px] text-emerald-800/0 transition-colors group-hover:text-emerald-800 dark:text-emerald-200/0 dark:group-hover:text-emerald-200">
                      Click to remove
                    </span>
                  </ConfirmSubmitButton>
                </form>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
