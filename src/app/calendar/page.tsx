import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/services/users";
import {
  getGroupForMember,
  listGroupMembers,
  listGroupsForUser,
  type GroupMemberSummary,
} from "@/lib/services/groups";
import { listAvailabilitySlotsForGroups } from "@/lib/services/availability";
import {
  formatWeekParam,
  getWeekDays,
  resolveGroupIdsParam,
  resolveWeekReference,
} from "@/lib/calendar";
import type { Group } from "@/lib/db";
import { AppHeader } from "@/components/app-header";
import { CalendarAvailabilityForm } from "@/components/calendar-availability-form";
import { CalendarGrid, type CalendarLegendMember } from "@/components/calendar-grid";
import { GroupFilter } from "@/components/group-filter";
import { SlotList } from "@/components/slot-list";
import { WeekNav } from "@/components/week-nav";

function dedupeMembers(members: GroupMemberSummary[]): CalendarLegendMember[] {
  const seen = new Map<string, CalendarLegendMember>();
  for (const member of members) {
    if (!seen.has(member.id)) {
      seen.set(member.id, { id: member.id, name: member.name, email: member.email });
    }
  }
  return [...seen.values()];
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; groups?: string }>;
}) {
  // `proxy.ts` already gates this route, but Server Components should never
  // rely on that alone — see node_modules/next/dist/docs/.../guides/authentication.md.
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  if (!user) {
    redirect("/login");
  }

  const { week, groups: groupsParam } = await searchParams;

  const allGroups = await listGroupsForUser(user.id);
  const allGroupIds = allGroups.map((group) => group.id);
  const requestedIds = resolveGroupIdsParam(groupsParam, allGroupIds);

  // `requestedIds` is already an intersection with `allGroups` (itself
  // scoped to this user's memberships via `listGroupsForUser`), but every
  // group data fetch in this app re-verifies membership through
  // `getGroupForMember` rather than trusting an id list alone — cheap here
  // since it's bounded by how many groups one user can be in.
  const authorizedGroups = (
    await Promise.all(requestedIds.map((id) => getGroupForMember(id, user.id)))
  ).filter((group): group is Group => group !== null);
  const selectedIds = authorizedGroups.map((group) => group.id);

  const [slots, memberLists] = await Promise.all([
    listAvailabilitySlotsForGroups(selectedIds),
    Promise.all(selectedIds.map((id) => listGroupMembers(id))),
  ]);

  const members = dedupeMembers(memberLists.flat());
  const ownSlots = slots.filter((slot) => slot.user.id === user.id);

  const weekDays = getWeekDays(user.timezone, resolveWeekReference(week, user.timezone));
  const weekLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: user.timezone,
  });

  // Each nav control preserves the *other* one's already-resolved value, so
  // switching weeks never resets the group filter and vice versa.
  const groupsExtraQuery =
    selectedIds.length === allGroupIds.length
      ? undefined
      : `groups=${encodeURIComponent(selectedIds.join(","))}`;
  const weekExtraQuery = `week=${formatWeekParam(weekDays[0])}`;

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader user={user} activeNav="calendar" />

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 lg:flex">
          <CalendarAvailabilityForm
            groups={allGroups}
            defaultGroupId={selectedIds[0]}
            defaultTimeZone={user.timezone}
          />

          <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Your availability
            </h2>
            <SlotList slots={ownSlots} timeZone={user.timezone} />
          </section>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Calendar
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                Week of {weekLabel.format(weekDays[0])} – {weekLabel.format(weekDays[6])} ·
                Shown in {user.timezone.replace(/_/g, " ")}
              </p>
            </div>
            <WeekNav basePath="/calendar" weekDays={weekDays} extraQuery={groupsExtraQuery} />
          </div>

          {allGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-400 dark:border-zinc-700">
              You&apos;re not in any groups yet —{" "}
              <Link href="/groups" className="font-medium underline">
                create or join one
              </Link>{" "}
              to start scheduling with others.
            </p>
          ) : (
            <>
              <GroupFilter
                basePath="/calendar"
                groups={allGroups}
                selectedIds={selectedIds}
                extraQuery={weekExtraQuery}
              />

              {selectedIds.length === 0 && (
                <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-400 dark:border-zinc-700">
                  No groups selected — choose at least one above to see availability.
                </p>
              )}
            </>
          )}

          <CalendarGrid
            slots={slots}
            members={members}
            timeZone={user.timezone}
            weekDays={weekDays}
            viewerId={user.id}
            showGroupNames={selectedIds.length > 1}
          />
        </main>
      </div>
    </div>
  );
}
