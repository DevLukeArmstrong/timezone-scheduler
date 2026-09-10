"use client";

import { useActionState } from "react";
import {
  sendDiscordTestMessageAction,
  setDiscordWebhookAction,
  type DiscordWebhookActionState,
} from "@/app/groups/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const initialState: DiscordWebhookActionState = {};

/**
 * Where a group's Discord channel gets connected. Deliberately receives
 * only *whether* a webhook is set, never the URL — it's a credential, and
 * showing it back would put it in every admin's page source. Replacing it
 * means pasting a new one.
 */
export function DiscordWebhookCard({
  groupId,
  hasWebhook,
  isAdmin,
}: {
  groupId: string;
  hasWebhook: boolean;
  /** Only the owner/admin can change this — enforced again server-side by
   * `setGroupDiscordWebhook` via `getGroupForAdmin`. */
  isAdmin: boolean;
}) {
  const [saveState, saveFormAction, savePending] = useActionState(
    setDiscordWebhookAction.bind(null, groupId),
    initialState,
  );
  const [testState, testFormAction, testPending] = useActionState(
    sendDiscordTestMessageAction.bind(null, groupId),
    initialState,
  );

  const inputClass =
    "w-full truncate rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  const buttonClass =
    "shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Discord notifications
        </h3>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {hasWebhook ? "Connected" : "Off"}
        </span>
      </div>

      {isAdmin ? (
        <>
          <form action={saveFormAction} className="flex items-center gap-1.5">
            <input
              type="url"
              name="webhookUrl"
              required
              placeholder={
                hasWebhook
                  ? "Paste a new webhook URL to replace the current one"
                  : "https://discord.com/api/webhooks/…"
              }
              aria-label="Discord webhook URL"
              autoComplete="off"
              className={inputClass}
            />
            <button type="submit" name="intent" value="save" disabled={savePending} className={buttonClass}>
              {savePending ? "Saving…" : "Save"}
            </button>
          </form>

          {hasWebhook && (
            <div className="flex items-center gap-3">
              <form action={testFormAction}>
                <button type="submit" disabled={testPending} className={buttonClass}>
                  {testPending ? "Sending…" : "Send test message"}
                </button>
              </form>
              <form action={saveFormAction}>
                <input type="hidden" name="intent" value="clear" />
                <ConfirmSubmitButton
                  confirmMessage="Turn off Discord notifications for this group?"
                  disabled={savePending}
                  className="text-xs font-medium text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Turn off
                </ConfirmSubmitButton>
              </form>
            </div>
          )}

          {(saveState.error || testState.error) && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {saveState.error ?? testState.error}
            </p>
          )}
          {(saveState.success || testState.success) && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {saveState.success ?? testState.success}
            </p>
          )}

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy URL.
            Posts here when someone adds availability, plus a weekly reminder.
          </p>
        </>
      ) : (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {hasWebhook
            ? "This group posts availability updates and reminders to a Discord channel."
            : "An owner or admin can connect a Discord channel for availability updates."}
        </p>
      )}
    </div>
  );
}
