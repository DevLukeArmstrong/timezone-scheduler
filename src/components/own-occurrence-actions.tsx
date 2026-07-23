import type { CSSProperties, ReactNode } from "react";
import {
  deleteCalendarAvailabilityOccurrenceAction,
  deleteCalendarAvailabilitySlotAction,
} from "@/app/calendar/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

interface OwnOccurrenceActionsProps {
  slotId: string;
  occurrenceDate: string | null;
  isRecurring: boolean;
  label: string;
  className: string;
  style: CSSProperties;
  children: ReactNode;
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
}: OwnOccurrenceActionsProps) {
  if (!isRecurring || !occurrenceDate) {
    return (
      <form
        action={deleteCalendarAvailabilitySlotAction.bind(null, slotId)}
        className={className}
        style={style}
      >
        <ConfirmSubmitButton
          confirmMessage={`Remove this availability slot (${label})?`}
          title="Remove this slot"
          className="absolute inset-0 flex h-full w-full flex-col items-start justify-start p-1 text-left"
        >
          {children}
        </ConfirmSubmitButton>
      </form>
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
          className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide opacity-70 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
        >
          all
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
