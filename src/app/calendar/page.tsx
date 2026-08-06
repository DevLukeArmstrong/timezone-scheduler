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
import {
  expandSlotsToOccurrences,
  listAvailabilitySlotsForGroups,
} from "@/lib/services/availability";
import {
  MONTH_LABELS,
  getMonthDays,
  getViewWindow,
  getWeekDays,
  getYearMonths,
  resolveCalendarView,
  resolveDateReference,
  resolveGroupIdsParam,
} from "@/lib/calendar";
import {
  formatLocalDateParts,
  getLocalDateParts,
  utcToWallClock,
} from "@/lib/timezone";
import type { Group } from "@/lib/db";
import { AppHeader } from "@/components/app-header";
import { CalendarAvailabilityForm } from "@/components/calendar-availability-form";
import { CalendarGrid, type CalendarLegendMember } from "@/components/calendar-grid";
import { CalendarMonthGrid } from "@/components/calendar-month-grid";
import { CalendarNav } from "@/components/calendar-nav";
import { CalendarViewSwitcher } from "@/components/calendar-view-switcher";
import { CalendarYearGrid } from "@/components/calendar-year-grid";
import { GroupFilter } from "@/components/group-filter";
import { SlotList } from "@/components/slot-list";

function dedupeMembers(members: GroupMemberSummary[]): CalendarLegendMember[] {
  const seen = new Map<string, CalendarLegendMember>();
  for (const member of members) {
    if (!seen.has(member.id)) {
      seen.set(member.id, { id: member.id, name: member.name, email: member.email });
    }
  }
  return [...seen.values()];
}

function joinQueryParts(parts: Array<string | undefined>): string | undefined {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join("&") : undefined;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    date?: string;
    /** @deprecated Prefer `date`; still accepted for existing bookmarks. */
    week?: string;
    groups?: string;
  }>;
}) {
  // `proxy.ts` already gates this route, but Server Components should never
  // rely on that alone — see node_modules/next/dist/docs/.../guides/authentication.md.
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  if (!user) {
    redirect("/login");
  }

  const {
    view: viewParam,
    date: dateParam,
    week: weekParam,
    groups: groupsParam,
  } = await searchParams;

  const view = resolveCalendarView(viewParam);
  // Prefer `date`; fall back to legacy `week=` so old links keep working.
  const reference = resolveDateReference(dateParam ?? weekParam, user.timezone);

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

  const window = getViewWindow(view, user.timezone, reference);
  const occurrences = expandSlotsToOccurrences(slots, window);

  const weekDays = view === "week" ? getWeekDays(user.timezone, reference) : null;
  const monthDays = view === "month" ? getMonthDays(user.timezone, reference) : null;
  const yearMonths = view === "year" ? getYearMonths(user.timezone, reference) : null;

  const localRef = utcToWallClock(reference, user.timezone);
  const dateKey = formatLocalDateParts(getLocalDateParts(reference, user.timezone));

  const weekLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: user.timezone,
  });

  let periodDescription: string;
  if (view === "week" && weekDays) {
    periodDescription = `Week of ${weekLabel.format(weekDays[0])} – ${weekLabel.format(weekDays[6])}`;
  } else if (view === "month") {
    periodDescription = `${MONTH_LABELS[localRef.getMonth()]} ${localRef.getFullYear()}`;
  } else {
    periodDescription = `${localRef.getFullYear()}`;
  }

  // Each nav control preserves the *other* ones' already-resolved values, so
  // switching weeks/views never resets the group filter and vice versa.
  const groupsExtraQuery =
    selectedIds.length === allGroupIds.length
      ? undefined
      : `groups=${encodeURIComponent(selectedIds.join(","))}`;
  const viewExtraQuery = view === "week" ? undefined : `view=${view}`;
  const dateExtraQuery = `date=${dateKey}`;

  const navExtraQuery = joinQueryParts([viewExtraQuery, groupsExtraQuery]);
  const viewSwitcherExtraQuery = joinQueryParts([dateExtraQuery, groupsExtraQuery]);
  const groupFilterExtraQuery = joinQueryParts([viewExtraQuery, dateExtraQuery]);
  const drillExtraQuery = groupsExtraQuery;

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader user={user} activeNav="calendar" />

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 lg:flex">
          <CalendarAvailabilityForm
            groups={allGroups}
            defaultGroupIds={
              selectedIds.length > 0 ? selectedIds : allGroups.map((group) => group.id)
            }
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
                {periodDescription} · Shown in {user.timezone.replace(/_/g, " ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CalendarViewSwitcher
                basePath="/calendar"
                view={view}
                extraQuery={viewSwitcherExtraQuery}
              />
              <CalendarNav
                basePath="/calendar"
                view={view}
                reference={reference}
                timeZone={user.timezone}
                extraQuery={navExtraQuery}
              />
            </div>
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
                extraQuery={groupFilterExtraQuery}
              />

              {selectedIds.length === 0 && (
                <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-400 dark:border-zinc-700">
                  No groups selected — choose at least one above to see availability.
                </p>
              )}
            </>
          )}

          {view === "week" && weekDays && (
            <CalendarGrid
              occurrences={occurrences}
              members={members}
              timeZone={user.timezone}
              weekDays={weekDays}
              viewerId={user.id}
              showGroupNames={selectedIds.length > 1}
            />
          )}

          {view === "month" && monthDays && (
            <CalendarMonthGrid
              occurrences={occurrences}
              members={members}
              timeZone={user.timezone}
              monthDays={monthDays}
              reference={reference}
              viewerId={user.id}
              drillExtraQuery={drillExtraQuery}
            />
          )}

          {view === "year" && yearMonths && (
            <CalendarYearGrid
              occurrences={occurrences}
              timeZone={user.timezone}
              yearMonths={yearMonths}
              drillExtraQuery={drillExtraQuery}
            />
          )}
        </main>
      </div>
    </div>
  );
}
