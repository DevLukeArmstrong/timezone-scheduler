import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/services/users";
import { listGroupMembers, listGroupsForUser } from "@/lib/services/groups";
import { AppHeader } from "@/components/app-header";
import { CreateGroupForm } from "@/components/create-group-form";
import { GroupManagementCard } from "@/components/group-management-card";

export default async function GroupsPage() {
  // `proxy.ts` already gates this route, but Server Components should never
  // rely on that alone — see node_modules/next/dist/docs/.../guides/authentication.md.
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;

  if (!user) {
    redirect("/login?stale=1");
  }

  const groups = await listGroupsForUser(user.id);
  const memberLists = await Promise.all(groups.map((group) => listGroupMembers(group.id)));

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader user={user} activeNav="groups" />

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Groups
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Create a group and share its invite link — everyone who joins
            shows up on the{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Calendar
            </span>{" "}
            view once you select their group there.
          </p>
        </div>

        <CreateGroupForm />

        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Your groups
          </h2>

          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-400 dark:border-zinc-700">
              You&apos;re not in any groups yet — create one above.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((group, index) => {
                const members = memberLists[index];
                const viewerRole = members.find((member) => member.id === user.id)?.role;
                const viewerIsAdmin = viewerRole === "OWNER" || viewerRole === "ADMIN";
                return (
                  <GroupManagementCard
                    key={group.id}
                    group={group}
                    members={members}
                    viewerId={user.id}
                    viewerIsAdmin={viewerIsAdmin}
                    viewerIsOwner={viewerRole === "OWNER"}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
