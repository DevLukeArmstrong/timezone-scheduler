/**
 * One-time nudge for someone who just joined a group and has never added
 * availability — the empty calendar they land on otherwise gives no hint
 * that this app expects one recurring window, not a slot per day. Points at
 * the "Add availability" form (`#add-availability`, in the sidebar) rather
 * than duplicating it. The caller is responsible for only rendering this
 * while the viewer's own availability is empty — there's no dismiss button,
 * it just stops rendering once they've added their first slot.
 */
export function FirstAvailabilityNudge() {
  return (
    <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/50">
      <p className="font-medium text-emerald-800 dark:text-emerald-300">
        You&apos;re in — now add your availability
      </p>
      <p className="text-emerald-700 dark:text-emerald-400">
        Most people set up one recurring weekly window instead of adding a
        slot every time — fill it in once and it just keeps showing up.{" "}
        <a href="#add-availability" className="font-medium underline">
          Add your first window
        </a>
        .
      </p>
    </div>
  );
}
