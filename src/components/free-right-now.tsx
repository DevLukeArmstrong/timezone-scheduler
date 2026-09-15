interface FreeRightNowPerson {
  id: string;
  name: string | null;
  email: string;
}

interface FreeRightNowProps {
  /** Members (any group the viewer is in, not just the current filter) with a
   *  slot covering this exact instant — the viewer themself excluded. */
  people: FreeRightNowPerson[];
}

/**
 * Small "who's around right now" line for spontaneous, unplanned check-ins —
 * the rest of the calendar is about *scheduling* free time, this is about
 * finding it already happening. Computed once at page load from the same
 * occurrence data as everything else; there's no client-side clock or
 * polling, so it goes stale exactly at the pace of a page refresh.
 */
export function FreeRightNow({ people }: FreeRightNowProps) {
  if (people.length === 0) return null;

  return (
    <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-medium">Free right now:</span>
      <span>{people.map((person) => person.name ?? person.email).join(", ")}</span>
    </p>
  );
}
