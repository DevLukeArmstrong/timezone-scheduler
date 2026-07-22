import type { GroupMemberSummary } from "@/lib/services/groups";
import { getMemberColor } from "@/lib/member-colors";

export function GroupMemberList({
  members,
  viewerId,
}: {
  members: GroupMemberSummary[];
  viewerId: string;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Members ({members.length})
      </h2>
      <ul className="space-y-1.5">
        {members.map((member, index) => {
          const color = getMemberColor(index);
          return (
            <li
              key={member.id}
              className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <span className={`size-2.5 shrink-0 rounded-full ${color.dot}`} />
              <span className="truncate">{member.name ?? member.email}</span>
              {member.id === viewerId && (
                <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                  (you)
                </span>
              )}
              {member.isOwner && (
                <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Owner
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
