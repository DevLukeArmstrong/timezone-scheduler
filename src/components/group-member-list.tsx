import type { GroupRole } from "@/lib/db";
import type { GroupMemberSummary } from "@/lib/services/groups";
import { getMemberColor } from "@/lib/member-colors";
import { MemberRoleActions } from "@/components/member-role-actions";

const ROLE_LABEL: Record<GroupRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export function GroupMemberList({
  groupId,
  members,
  viewerId,
  viewerIsAdmin,
}: {
  groupId: string;
  members: GroupMemberSummary[];
  viewerId: string;
  /** Whether the viewer is this group's OWNER or an ADMIN — gates the
   * promote/demote/remove controls. Plain members always get a read-only
   * list; hiding these controls in the UI is not the real check, the
   * server actions re-verify this via `getGroupForAdmin` regardless. */
  viewerIsAdmin: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Members ({members.length})
      </h3>
      <ul className="space-y-1.5">
        {members.map((member, index) => {
          const color = getMemberColor(index);
          const isSelf = member.id === viewerId;
          // Nobody can promote/demote/remove themselves or the owner —
          // the owner guard is also enforced server-side in the service
          // layer, this just avoids rendering controls that would 403.
          const showActions = viewerIsAdmin && !isSelf && member.role !== "OWNER";
          return (
            <li
              key={member.id}
              className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <span className={`size-2.5 shrink-0 rounded-full ${color.dot}`} />
              <span className="truncate">{member.name ?? member.email}</span>
              {isSelf && (
                <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                  (you)
                </span>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {member.role !== "MEMBER" && (
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {ROLE_LABEL[member.role]}
                  </span>
                )}
                {showActions && (
                  <MemberRoleActions
                    groupId={groupId}
                    memberId={member.id}
                    memberLabel={member.name ?? member.email}
                    role={member.role}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
