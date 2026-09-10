"use client";

import { useActionState } from "react";
import {
  updateNotificationPreferencesAction,
  type UpdateNotificationPreferencesActionState,
} from "@/app/account/actions";

const initialState: UpdateNotificationPreferencesActionState = {};

// Group notifications post to a shared Discord channel, so none of these
// can hide a post from one person. Each controls the only thing that *can*
// be enforced: whether you're named, or whether your own action posts.
const TOGGLES = [
  {
    name: "notifyReminder",
    label: "Weekly reminder",
    description:
      "Name me in the Friday reminder if I haven't added availability for next week.",
  },
  {
    name: "notifyOverlap",
    label: "Free-together alerts",
    description:
      "Name me when enough of a group is free at the same time. Off still counts me — it just doesn't call me out.",
  },
  {
    name: "notifyNewAvailability",
    label: "Announce my availability",
    description: "Post to the group's channel when I add availability.",
  },
] as const;

interface AccountNotificationsFormProps {
  defaultNotifyReminder: boolean;
  defaultNotifyOverlap: boolean;
  defaultNotifyNewAvailability: boolean;
}

export function AccountNotificationsForm({
  defaultNotifyReminder,
  defaultNotifyOverlap,
  defaultNotifyNewAvailability,
}: AccountNotificationsFormProps) {
  const [state, formAction, pending] = useActionState(
    updateNotificationPreferencesAction,
    initialState,
  );

  const defaults: Record<(typeof TOGGLES)[number]["name"], boolean> = {
    notifyReminder: defaultNotifyReminder,
    notifyOverlap: defaultNotifyOverlap,
    notifyNewAvailability: defaultNotifyNewAvailability,
  };

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          How you appear in your groups&apos; Discord posts. Email is only used
          for password reset.
        </p>
      </div>

      <div className="space-y-3">
        {TOGGLES.map((toggle) => (
          <label
            key={toggle.name}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/60"
          >
            <input
              type="checkbox"
              name={toggle.name}
              defaultChecked={defaults[toggle.name]}
              className="mt-0.5 size-3.5 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
            />
            <span>
              <span className="block font-medium text-zinc-800 dark:text-zinc-200">
                {toggle.label}
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {toggle.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Notification preferences updated.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Save notification preferences"}
      </button>
    </form>
  );
}
