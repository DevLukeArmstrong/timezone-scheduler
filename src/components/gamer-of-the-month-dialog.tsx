"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { dismissGamerOfTheMonthAction } from "@/app/actions";
import {
  GamerOfTheMonthCard,
  type GamerOfTheMonthCardFeature,
} from "@/components/gamer-of-the-month-card";

interface GamerOfTheMonthDialogProps {
  feature: GamerOfTheMonthCardFeature;
  /** True when the viewer is the featured member — the copy changes a little. */
  isViewer: boolean;
}

/**
 * The popup itself. Opens on mount as a native modal `<dialog>` (focus
 * trapped, Escape closes) unless this tab already closed it this session.
 *
 * Two levels of "go away", matching what the checkbox implies:
 * - Close without ticking it: hidden for this browser tab only
 *   (`sessionStorage`), so it's back next visit.
 * - Close with "don't show this again this month" ticked: recorded on the
 *   viewer's `User` row via a Server Action, so it stays gone on every
 *   device until the admin publishes a new feature (new id).
 */
export function GamerOfTheMonthDialog({ feature, isViewer }: GamerOfTheMonthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [closed, setClosed] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [, startTransition] = useTransition();

  const sessionKey = `gamer-of-the-month:closed:${feature.id}`;

  useEffect(() => {
    // The <dialog> is in the markup from the first render but shows nothing
    // until `showModal()` — so the server HTML and the first client render
    // agree, and the sessionStorage check (which only the browser can do)
    // just decides whether to open it.
    try {
      if (window.sessionStorage.getItem(sessionKey) === "1") return;
    } catch {
      // Storage can throw in private windows / with site data blocked —
      // then it's just a popup that comes back on every load, not a crash.
    }
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [sessionKey]);

  // Runs for every way the dialog can close — the button, Escape, and a
  // backdrop click all end up at `dialog.close()`, which fires `close`.
  function handleClose() {
    if (dontShowAgain) {
      startTransition(() => dismissGamerOfTheMonthAction(feature.id));
    } else {
      try {
        window.sessionStorage.setItem(sessionKey, "1");
      } catch {
        // See above.
      }
    }
    setClosed(true);
  }

  if (closed) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={(event) => {
        // The dialog element itself is only the click target when the
        // click landed on the backdrop, outside the card.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      // `dvh`, not `vh`: on iOS Safari `100vh` is the height with the
      // toolbars *hidden*, so a `vh`-sized card runs under the bottom bar and
      // the Close button ends up unreachable. `dvh` is the visible height.
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-zinc-950/60 backdrop:backdrop-blur-sm dark:bg-zinc-900"
    >
      <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <GamerOfTheMonthCard
          feature={feature}
          isViewer={isViewer}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(event) => setDontShowAgain(event.target.checked)}
                  className="size-3.5 rounded border-zinc-300 accent-brand-700 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-900"
                />
                Don&apos;t show this again this month
              </label>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 dark:bg-brand-400 dark:text-brand-950 dark:hover:bg-brand-300"
              >
                Close
              </button>
            </div>
          }
        />
      </div>
    </dialog>
  );
}
