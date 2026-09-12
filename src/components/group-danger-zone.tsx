"use client";

import { useActionState } from "react";
import {
  deleteGroupAction,
  leaveGroupAction,
  type GroupMemberActionState,
} from "@/app/groups/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const initialState: GroupMemberActionState = {};

const DESTRUCTIVE_BUTTON_CLASS =
  "text-xs font-medium text-red-600 underline-offset-2 transition-colors hover:text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300";

/**
 * The bottom-of-card exit hatch: the OWNER gets "Delete group" (which
 * cascades to every membership, availability slot, and notification log
 * scoped to it — see `deleteGroup`'s doc comment), everyone else gets
 * "Leave group". Never both — an owner has to delete the group or transfer
 * ownership (not built yet) rather than leave, so `leaveGroup` rejects that
 * case server-side regardless of what renders here.
 */
export function GroupDangerZone({
  groupId,
  groupName,
  isOwner,
}: {
  groupId: string;
  groupName: string;
  isOwner: boolean;
}) {
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteGroupAction.bind(null, groupId),
    initialState,
  );
  const [leaveState, leaveFormAction, leavePending] = useActionState(
    leaveGroupAction.bind(null, groupId),
    initialState,
  );

  if (isOwner) {
    return (
      <div className="flex flex-col items-end gap-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <form action={deleteFormAction}>
          <ConfirmSubmitButton
            confirmMessage={`Delete "${groupName}"? This permanently deletes every member's availability in this group, its invite link, and its Discord connection — for everyone, with no undo.`}
            disabled={deletePending}
            className={DESTRUCTIVE_BUTTON_CLASS}
          >
            {deletePending ? "Deleting…" : "Delete group"}
          </ConfirmSubmitButton>
        </form>
        {deleteState.error && (
          <p className="text-xs text-red-600 dark:text-red-400">{deleteState.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <form action={leaveFormAction}>
        <ConfirmSubmitButton
          confirmMessage={`Leave "${groupName}"? You'll lose access to it and need a new invite link to rejoin.`}
          disabled={leavePending}
          className={DESTRUCTIVE_BUTTON_CLASS}
        >
          {leavePending ? "Leaving…" : "Leave group"}
        </ConfirmSubmitButton>
      </form>
      {leaveState.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{leaveState.error}</p>
      )}
    </div>
  );
}
