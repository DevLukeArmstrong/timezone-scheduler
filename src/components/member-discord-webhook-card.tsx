"use client";

import { useActionState } from "react";
import {
  sendOwnDiscordTestMessageAction,
  setOwnDiscordWebhookAction,
  type DiscordWebhookActionState,
} from "@/app/groups/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const initialState: DiscordWebhookActionState = {};

/**
 * Where a member points this group's posts at a server of their own —
 * available to everyone in the group, not just owners and admins, which is
 * the whole point: you don't need a say over the group's channel to get its
 * notifications somewhere you can see them.
 *
 * Like {@link DiscordWebhookCard} it receives only *whether* a webhook is
 * set, never the URL. Nobody else in the group can see it or change it,
 * admins included.
 */
export function MemberDiscordWebhookCard({
  groupId,
  hasOwnWebhook,
}: {
  groupId: string;
  /** Whether the viewer has their own webhook on this group's membership. */
  hasOwnWebhook: boolean;
}) {
  const [saveState, saveFormAction, savePending] = useActionState(
    setOwnDiscordWebhookAction.bind(null, groupId),
    initialState,
  );
  const [testState, testFormAction, testPending] = useActionState(
    sendOwnDiscordTestMessageAction.bind(null, groupId),
    initialState,
  );
  const error = saveState.error ?? testState.error;
  const success = saveState.success ?? testState.success;

  const inputClass =
    "w-full truncate rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  const buttonClass =
    "shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <div className="space-y-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Your own Discord
        </h3>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {hasOwnWebhook ? "Connected" : "Off"}
        </span>
      </div>

      <form action={saveFormAction} className="flex items-center gap-1.5">
        <input
          type="url"
          name="webhookUrl"
          required
          placeholder={
            hasOwnWebhook
              ? "Paste a new webhook URL to replace yours"
              : "https://discord.com/api/webhooks/…"
          }
          aria-label="Your own Discord webhook URL for this group"
          autoComplete="off"
          className={inputClass}
        />
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={savePending}
          className={buttonClass}
        >
          {savePending ? "Saving…" : "Save"}
        </button>
      </form>

      {hasOwnWebhook && (
        <div className="flex items-center gap-3">
          <form action={testFormAction}>
            <button type="submit" disabled={testPending} className={buttonClass}>
              {testPending ? "Sending…" : "Send test message"}
            </button>
          </form>
          <form action={saveFormAction}>
            <input type="hidden" name="intent" value="clear" />
            <ConfirmSubmitButton
              confirmMessage="Stop sending this group's posts to your own server?"
              disabled={savePending}
              className="text-xs font-medium text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Turn off
            </ConfirmSubmitButton>
          </form>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {success && !error && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
      )}

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Gets the same posts as the group channel, in a server of your own — availability
        updates, overlap alerts and the weekly reminder. Only you can see or change this,
        and it follows your notification settings. In Discord: channel settings →
        Integrations → Webhooks → New Webhook → Copy URL.
      </p>
    </div>
  );
}
