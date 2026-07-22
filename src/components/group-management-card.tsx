import type { Group } from "@/lib/db";
import type { GroupMemberSummary } from "@/lib/services/groups";
import { GroupMemberList } from "@/components/group-member-list";
import { InviteLinkCard } from "@/components/invite-link-card";

interface GroupManagementCardProps {
  group: Group;
  members: GroupMemberSummary[];
  viewerId: string;
}

/**
 * One group's management panel on `/groups`: its invite link, its member
 * list, and a placeholder for role management. Editing who's an admin vs.
 * a regular member is a later task — this section exists so the eventual
 * UI has an obvious home, without building any roles yet.
 */
export function GroupManagementCard({ group, members, viewerId }: GroupManagementCardProps) {
  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {group.name}
        </h3>
        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
          {members.length} member{members.length === 1 ? "" : "s"}
        </span>
      </div>

      <InviteLinkCard inviteToken={group.inviteToken} />

      <GroupMemberList members={members} viewerId={viewerId} />

      <div className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        Roles &amp; permissions (owner vs. admin vs. member) are coming in a
        later update — for now every member has equal access.
      </div>
    </div>
  );
}
