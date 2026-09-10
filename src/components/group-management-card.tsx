import type { Group } from "@/lib/db";
import type { GroupMemberSummary } from "@/lib/services/groups";
import { GroupMemberList } from "@/components/group-member-list";
import { InviteLinkCard } from "@/components/invite-link-card";
import { DiscordWebhookCard } from "@/components/discord-webhook-card";

interface GroupManagementCardProps {
  group: Group;
  members: GroupMemberSummary[];
  viewerId: string;
  /** Whether the viewer is this group's OWNER or an ADMIN. */
  viewerIsAdmin: boolean;
}

/**
 * One group's management panel on `/groups`: its invite link (regenerable
 * by owners/admins), its Discord connection, and its member list
 * (promote/demote/remove for owners/admins, read-only for everyone else).
 *
 * This is a Server Component holding the full `Group` row, so it decides
 * what reaches the client: `inviteToken` (already a shareable link) goes
 * down; `discordWebhookUrl` (a channel-posting credential) never does —
 * only whether one is set.
 */
export function GroupManagementCard({
  group,
  members,
  viewerId,
  viewerIsAdmin,
}: GroupManagementCardProps) {
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

      <InviteLinkCard groupId={group.id} inviteToken={group.inviteToken} isAdmin={viewerIsAdmin} />

      <DiscordWebhookCard
        groupId={group.id}
        hasWebhook={group.discordWebhookUrl !== null}
        quorumThreshold={group.quorumThreshold}
        memberCount={members.length}
        isAdmin={viewerIsAdmin}
      />

      <GroupMemberList
        groupId={group.id}
        members={members}
        viewerId={viewerId}
        viewerIsAdmin={viewerIsAdmin}
      />
    </div>
  );
}
