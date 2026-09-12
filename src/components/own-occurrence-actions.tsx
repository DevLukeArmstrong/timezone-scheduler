import type { CSSProperties, ReactNode } from "react";
import {
  deleteCalendarAvailabilityOccurrenceAction,
  deleteCalendarAvailabilitySlotAction,
} from "@/app/calendar-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { EditOccurrenceButton } from "@/components/edit-occurrence-popover";
import { ConversionPreviewButton } from "@/components/occurrence-conversion-preview";
import type { RecurrenceRule } from "@/lib/db";

/** Shared badge styling for the small corner-overlay buttons ("all", info) on an own block. */
const CORNER_BUTTON_CLASSNAME =
  "absolute z-10 rounded px-1 py-0.5 text-[10px] font-semibold leading-4 opacity-80 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10";

interface OwnOccurrenceActionsProps {
  slotId: string;
  occurrenceDate: string | null;
  isRecurring: boolean;
  label: string;
  className: string;
  style: CSSProperties;
  children: ReactNode;
  startUtc: Date;
  endUtc: Date;
  displayTimeZone: string;
  favoriteTimeZones: string[];
  /** The series' recurrence rule when `isRecurring` is true, for the edit form's defaults. */
  recurrence: RecurrenceRule | null;
}

/**
 * Delete controls for the viewer's own grid block. One-offs remove the row;
 * recurring occurrences offer "this occurrence" (default click) vs "whole
 * series" (explicit series button).
 */
export function OwnOccurrenceActions({
  slotId,
  occurrenceDate,
  isRecurring,
  label,
  className,
  style,
  children,
  startUtc,
  endUtc,
  displayTimeZone,
  favoriteTimeZones,
  recurrence,
}: OwnOccurrenceActionsProps) {
  const conversionData = { startUtc, endUtc, displayTimeZone, favoriteTimeZones, heading: label };
  const editProps = { slotId, isRecurring, startUtc, endUtc, displayTimeZone, recurrence };

  if (!isRecurring || !occurrenceDate) {
    return (
      <div className={className} style={style}>
        <form
          action={deleteCalendarAvailabilitySlotAction.bind(null, slotId)}
          className="absolute inset-0"
        >
          <ConfirmSubmitButton
            confirmMessage={`Remove this availability slot (${label})?`}
            title="Remove this slot"
            className="absolute inset-0 flex h-full w-full flex-col items-start justify-start p-1 pr-6 text-left"
          >
            {children}
          </ConfirmSubmitButton>
        </form>
        <ConversionPreviewButton
          {...conversionData}
          className={`${CORNER_BUTTON_CLASSNAME} right-0.5 top-0.5`}
        />
        <EditOccurrenceButton
          {...editProps}
          className={`${CORNER_BUTTON_CLASSNAME} right-0.5 bottom-0.5`}
        />
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      <form
        action={deleteCalendarAvailabilityOccurrenceAction.bind(
          null,
          slotId,
          occurrenceDate,
        )}
        className="absolute inset-0"
      >
        <ConfirmSubmitButton
          confirmMessage={`Remove only this occurrence (${label})? The rest of the series will stay.`}
          title="Remove this occurrence"
          className="flex h-full w-full flex-col items-start justify-start p-1 pr-8 text-left"
        >
          {children}
        </ConfirmSubmitButton>
      </form>
      <form
        action={deleteCalendarAvailabilitySlotAction.bind(null, slotId)}
        className="absolute right-0.5 top-0.5 z-10"
      >
        <ConfirmSubmitButton
          confirmMessage={`Remove the entire recurring series (${label})?`}
          title="Remove entire series"
          // Sits on top of the "remove this occurrence" target, and both are
          // destructive, so it needs to be comfortably bigger than the ~16x12
          // it used to be — mis-tapping it deleted a whole series.
          className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide opacity-80 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
        >
          all
        </ConfirmSubmitButton>
      </form>
      <ConversionPreviewButton
        {...conversionData}
        className={`${CORNER_BUTTON_CLASSNAME} right-0.5 bottom-0.5`}
      />
      <EditOccurrenceButton
        {...editProps}
        className={`${CORNER_BUTTON_CLASSNAME} left-0.5 bottom-0.5`}
      />
    </div>
  );
}
