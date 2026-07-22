"use client";

import { useActionState } from "react";
import {
  demoteMemberAction,
  promoteMemberAction,
  removeMemberAction,
  type GroupMemberActionState,
} from "@/app/groups/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type { GroupRole } from "@/lib/db";

const initialState: GroupMemberActionState = {};

const BUTTON_CLASS =
  "shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

const DESTRUCTIVE_BUTTON_CLASS =
  "shrink-0 rounded-full border border-red-200 px-2 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/60";

/**
 * The owner/admin-only per-member controls: promote a MEMBER to ADMIN,
 * demote an ADMIN back to MEMBER, or remove the member outright. Each
 * button is its own tiny form + `useActionState`, bound to this one
 * member via `.bind(null, groupId, memberId)` (see the Server Actions
 * "Passing additional arguments" pattern in
 * node_modules/next/dist/docs/.../guides/forms.md) — so one member's
 * pending/error state never blocks or bleeds into another's.
 *
 * The caller (`GroupMemberList`) only renders this for rows where the
 * viewer is an admin/owner and the target isn't the owner or themselves,
 * but that's a rendering nicety — `promoteMemberAction` /
 * `demoteMemberAction` / `removeMemberAction` re-check both of those
 * server-side via the group service, so a forged request still 403s.
 */
export function MemberRoleActions({
  groupId,
  memberId,
  memberLabel,
  role,
}: {
  groupId: string;
  memberId: string;
  memberLabel: string;
  role: GroupRole;
}) {
  const [promoteState, promoteFormAction, promotePending] = useActionState(
    promoteMemberAction.bind(null, groupId, memberId),
    initialState,
  );
  const [demoteState, demoteFormAction, demotePending] = useActionState(
    demoteMemberAction.bind(null, groupId, memberId),
    initialState,
  );
  const [removeState, removeFormAction, removePending] = useActionState(
    removeMemberAction.bind(null, groupId, memberId),
    initialState,
  );

  const error = promoteState.error ?? demoteState.error ?? removeState.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {role === "MEMBER" && (
          <form action={promoteFormAction}>
            <button type="submit" disabled={promotePending} className={BUTTON_CLASS}>
              {promotePending ? "Promoting…" : "Make admin"}
            </button>
          </form>
        )}
        {role === "ADMIN" && (
          <form action={demoteFormAction}>
            <button type="submit" disabled={demotePending} className={BUTTON_CLASS}>
              {demotePending ? "Demoting…" : "Remove admin"}
            </button>
          </form>
        )}
        <form action={removeFormAction}>
          <ConfirmSubmitButton
            confirmMessage={`Remove ${memberLabel} from this group? They'll lose access immediately.`}
            disabled={removePending}
            className={DESTRUCTIVE_BUTTON_CLASS}
          >
            {removePending ? "Removing…" : "Remove"}
          </ConfirmSubmitButton>
        </form>
      </div>
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
