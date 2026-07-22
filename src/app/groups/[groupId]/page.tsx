import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/services/users";
import { getGroupForMember, listGroupMembers } from "@/lib/services/groups";
import { listAvailabilitySlotsForGroup } from "@/lib/services/availability";
import { getWeekDays } from "@/lib/calendar";
import { AppHeader } from "@/components/app-header";
import { GroupCalendar } from "@/components/group-calendar";
import { GroupAvailabilityForm } from "@/components/group-availability-form";
import { GroupMemberList } from "@/components/group-member-list";
import { InviteLinkCard } from "@/components/invite-link-card";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  // `proxy.ts` already gates every /groups route behind a session, but
  // Server Components should never rely on that alone — see
  // node_modules/next/dist/docs/.../guides/authentication.md.
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  if (!user) {
    redirect("/login");
  }

  // The core authorization gate for this page: a `groupId` in the URL is
  // just a string a visitor typed or guessed — only proceed if this user is
  // actually a member. Anyone else gets a 404, not a redirect, so a group's
  // very existence isn't leaked to non-members either.
  const group = await getGroupForMember(groupId, user.id);
  if (!group) {
    notFound();
  }

  const [slots, members] = await Promise.all([
    listAvailabilitySlotsForGroup(groupId),
    listGroupMembers(groupId),
  ]);
  const weekDays = getWeekDays(user.timezone);

  const weekLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: user.timezone,
  });

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader user={user} activeNav="groups" />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-64">
          <GroupAvailabilityForm groupId={groupId} defaultTimeZone={user.timezone} />
          <InviteLinkCard inviteToken={group.inviteToken} />
          <GroupMemberList members={members} viewerId={user.id} />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {group.name}
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                Week of {weekLabel.format(weekDays[0])} – {weekLabel.format(weekDays[6])} ·
                Shown in {user.timezone.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          <GroupCalendar
            groupId={groupId}
            slots={slots}
            members={members}
            timeZone={user.timezone}
            weekDays={weekDays}
            viewerId={user.id}
          />
        </main>
      </div>
    </div>
  );
}
