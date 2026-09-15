"use client";

import { useActionState } from "react";
import {
  saveGamerOfTheMonthAction,
  takeDownGamerOfTheMonthAction,
  type GamerOfTheMonthActionState,
} from "@/app/admin/gamer-of-the-month/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { youTubeWatchUrl } from "@/lib/youtube";

const initialState: GamerOfTheMonthActionState = {};

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const LABEL_CLASS =
  "text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400";
const PRIMARY_BUTTON_CLASS =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const SECONDARY_BUTTON_CLASS =
  "rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

interface GamerOfTheMonthAdminFormProps {
  members: Array<{ id: string; name: string | null; email: string }>;
  /** The live feature, prefilled into the form; `null` when nothing is published. */
  current: {
    id: string;
    userId: string;
    title: string;
    blurb: string;
    imageUrl: string | null;
    youtubeVideoId: string | null;
  } | null;
}

/**
 * The whole admin surface for the feature: one form, prefilled with what's
 * live. With something already published there are two ways to submit —
 * "Save changes" keeps the same feature (people who dismissed it stay
 * dismissed) and "Publish as new month" replaces it (everyone sees it
 * again) — plus a confirm-gated "Take down". Which submit was pressed
 * travels as the button's `intent` value in the same FormData.
 */
export function GamerOfTheMonthAdminForm({ members, current }: GamerOfTheMonthAdminFormProps) {
  const [saveState, saveFormAction, savePending] = useActionState(
    saveGamerOfTheMonthAction,
    initialState,
  );
  const [takeDownState, takeDownFormAction, takeDownPending] = useActionState(
    takeDownGamerOfTheMonthAction,
    initialState,
  );

  const pending = savePending || takeDownPending;
  const error = saveState.error ?? takeDownState.error;
  const success = saveState.success ?? takeDownState.success;

  return (
    <div className="w-full max-w-lg space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/*
        `key` resets the uncontrolled fields when the live feature changes —
        e.g. after "Take down" they should go blank, and after "Publish"
        the hidden `currentId` must point at the new row.
      */}
      <form key={current?.id ?? "new"} action={saveFormAction} className="space-y-4">
        {current && <input type="hidden" name="currentId" value={current.id} />}

        <div className="space-y-1.5">
          <label htmlFor="gotm-user" className={LABEL_CLASS}>
            Member
          </label>
          <select
            id="gotm-user"
            name="userId"
            required
            defaultValue={current?.userId ?? ""}
            className={INPUT_CLASS}
          >
            <option value="" disabled>
              Pick someone…
            </option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name ? `${member.name} (${member.email})` : member.email}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="gotm-title" className={LABEL_CLASS}>
            Title
          </label>
          <input
            id="gotm-title"
            name="title"
            type="text"
            required
            maxLength={80}
            defaultValue={current?.title ?? ""}
            placeholder="Clutch of the Century"
            className={INPUT_CLASS}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="gotm-blurb" className={LABEL_CLASS}>
            Blurb
          </label>
          <textarea
            id="gotm-blurb"
            name="blurb"
            required
            rows={6}
            maxLength={2000}
            defaultValue={current?.blurb ?? ""}
            placeholder="Why this person, this month. Line breaks are kept."
            className={INPUT_CLASS}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="gotm-image" className={LABEL_CLASS}>
            Picture URL <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="gotm-image"
            name="imageUrl"
            type="url"
            inputMode="url"
            defaultValue={current?.imageUrl ?? ""}
            placeholder="https://…"
            className={INPUT_CLASS}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Must be https. Discord <em>attachment</em> links expire after a day —
            use a Discord avatar link, Imgur, or similar.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="gotm-youtube" className={LABEL_CLASS}>
            YouTube clip <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="gotm-youtube"
            name="youtube"
            type="text"
            inputMode="url"
            defaultValue={current?.youtubeVideoId ? youTubeWatchUrl(current.youtubeVideoId) : ""}
            placeholder="https://youtu.be/… or https://www.youtube.com/watch?v=…"
            className={INPUT_CLASS}
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {current ? (
            <>
              <button
                type="submit"
                name="intent"
                value="update"
                disabled={pending}
                className={PRIMARY_BUTTON_CLASS}
              >
                {savePending ? "Saving…" : "Save changes"}
              </button>
              <button
                type="submit"
                name="intent"
                value="publish"
                disabled={pending}
                title="Replaces the current feature. Everyone sees the popup again, including people who dismissed the last one."
                className={SECONDARY_BUTTON_CLASS}
              >
                Publish as new month
              </button>
            </>
          ) : (
            <button
              type="submit"
              name="intent"
              value="publish"
              disabled={pending}
              className={PRIMARY_BUTTON_CLASS}
            >
              {savePending ? "Publishing…" : "Publish"}
            </button>
          )}
        </div>
      </form>

      {current && (
        <form
          action={takeDownFormAction}
          className="flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800"
        >
          <ConfirmSubmitButton
            confirmMessage="Take down the current gamer of the month? The popup stops showing for everyone until you publish a new one."
            disabled={pending}
            className="text-xs font-medium text-red-600 underline-offset-2 transition-colors hover:text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300"
          >
            {takeDownPending ? "Taking down…" : "Take down"}
          </ConfirmSubmitButton>
        </form>
      )}
    </div>
  );
}
