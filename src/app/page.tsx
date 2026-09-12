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
import { listFavoriteTimeZones } from "@/lib/services/favorite-timezones";
import {
  computeOverlapWindows,
  rankBestTimes,
  type OverlapGroup,
  type OverlapWindow,
} from "@/lib/overlap";
import {
  MONTH_LABELS,
  getMonthDays,
  getViewWindow,
  getWeekDays,
  getYearMonths,
  resolveCalendarView,
  resolveDateReference,
  resolveExpandedHours,
  resolveGroupIdsParam,
  resolvePeakHours,
  resolveWeekDayIndex,
  withExtraQuery,
} from "@/lib/calendar";
import {
  addLocalDays,
  formatLocalDateParts,
  getLocalDateParts,
  utcToWallClock,
} from "@/lib/timezone";
import type { Group } from "@/lib/db";
import { AppHeader } from "@/components/app-header";
import { BestTimes } from "@/components/best-times";
import { CalendarAvailabilityForm } from "@/components/calendar-availability-form";
import { CalendarGrid, type CalendarLegendMember } from "@/components/calendar-grid";
import { CalendarMonthGrid } from "@/components/calendar-month-grid";
import { CalendarNav } from "@/components/calendar-nav";
import { CalendarViewSwitcher } from "@/components/calendar-view-switcher";
import { CalendarYearGrid } from "@/components/calendar-year-grid";
import { FirstAvailabilityNudge } from "@/components/first-availability-nudge";
import { FreeRightNow } from "@/components/free-right-now";
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
    /** Index (0–6) of the day the phone-width week grid shows. */
    day?: string;
    /** `all` to render every hour at full height instead of compressing off-peak ones. */
    hours?: string;
  }>;
}) {
  // `proxy.ts` already gates this route, but Server Components should never
  // rely on that alone — see node_modules/next/dist/docs/.../guides/authentication.md.
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  if (!user) {
    redirect("/login?stale=1");
  }

  const {
    view: viewParam,
    date: dateParam,
    week: weekParam,
    groups: groupsParam,
    day: dayParam,
    hours: hoursParam,
  } = await searchParams;

  const view = resolveCalendarView(viewParam);
  // Prefer `date`; fall back to legacy `week=` so old links keep working.
  const reference = resolveDateReference(dateParam ?? weekParam, user.timezone);

  // Only id/name leave the server: the full row carries `inviteToken` and
  // `discordWebhookUrl`, and whatever is passed as a prop to a Client
  // Component below is serialized into every member's page.
  const allGroups = (await listGroupsForUser(user.id)).map(({ id, name }) => ({ id, name }));
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

  const now = new Date();

  const [slots, memberLists, favoriteTimeZones, allGroupSlots] = await Promise.all([
    listAvailabilitySlotsForGroups(selectedIds),
    Promise.all(selectedIds.map((id) => listGroupMembers(id))),
    listFavoriteTimeZones(user.id),
    // Independent of the group filter above — "who's free right now" always
    // looks across every group the viewer is in, not just the selected ones.
    listAvailabilitySlotsForGroups(allGroupIds),
  ]);

  const members = dedupeMembers(memberLists.flat());
  const ownSlots = slots.filter((slot) => slot.user.id === user.id);

  // A 1ms window is enough: `expandSlotsToOccurrences`'s half-open interval
  // check (`start < windowEnd && end > windowStart`) then keeps exactly the
  // occurrences whose own start/end actually straddle this instant, the same
  // overlap convention used everywhere else in this app.
  const seenFreeNowIds = new Set<string>();
  const freeRightNow = expandSlotsToOccurrences(allGroupSlots, {
    start: now,
    end: new Date(now.getTime() + 1),
  })
    .map((occurrence) => occurrence.user)
    .filter((person) => {
      if (person.id === user.id || seenFreeNowIds.has(person.id)) return false;
      seenFreeNowIds.add(person.id);
      return true;
    })
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

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

  // Week-grid-only display state: which day the phone-width grid shows, and
  // whether the off-peak band is expanded. Both are links like every other
  // control here, so they survive navigation and work without JavaScript.
  const { peakStartHour, peakEndHour } = resolvePeakHours(
    user.peakStartHour,
    user.peakEndHour,
  );
  const expandedHours = resolveExpandedHours(hoursParam);
  const mobileDayIndex = weekDays
    ? resolveWeekDayIndex(dayParam, weekDays, user.timezone)
    : 0;

  const hoursExtraQuery = expandedHours ? undefined : "hours=all";
  const dayExtraQuery = `day=${mobileDayIndex}`;

  // Overlap shading and the best-times list are week-grid features, and both
  // read from one `computeOverlapWindows` call — which is itself a call into
  // the same `findQuorumWindows` the Discord alert runs (see src/lib/overlap.ts).
  // Computing it twice, or computing it here and again in the grid, is exactly
  // the divergence this is meant to rule out.
  const overlapGroups: OverlapGroup[] = authorizedGroups.map((group, index) => ({
    id: group.id,
    name: group.name,
    quorumThreshold: group.quorumThreshold,
    memberIds: memberLists[index].map((member) => member.id),
  }));
  const overlapWindows: OverlapWindow[] =
    view === "week" ? computeOverlapWindows(occurrences, overlapGroups, window) : [];

  // A week already gone has no "best times" left to suggest, so fall back to
  // what it held rather than showing an empty card on every past week.
  const upcomingBest = rankBestTimes(
    overlapWindows.filter((overlap) => overlap.endTime > now),
  );
  const bestTimes = upcomingBest.length > 0 ? upcomingBest : rankBestTimes(overlapWindows);
  const bestTimesAreHistorical = upcomingBest.length === 0 && bestTimes.length > 0;

  const hoursToggleHref = withExtraQuery(
    "/",
    joinQueryParts([dateExtraQuery, groupsExtraQuery, dayExtraQuery, hoursExtraQuery]),
  );

  // Stepping off either end of the week rolls into the adjacent one rather
  // than dead-ending on Monday or Sunday. `timeZone` is lifted out of `user`
  // because the null-check above doesn't narrow inside a closure.
  const timeZone = user.timezone;
  function dayStepHref(delta: -1 | 1): string {
    if (!weekDays) return "/";
    const next = mobileDayIndex + delta;
    if (next >= 0 && next <= 6) {
      return withExtraQuery(
        "/",
        joinQueryParts([
          dateExtraQuery,
          groupsExtraQuery,
          `day=${next}`,
          expandedHours ? "hours=all" : undefined,
        ]),
      );
    }
    const rolledInto = delta === -1 ? weekDays[0] : weekDays[6];
    const rolledDate = formatLocalDateParts(
      addLocalDays(getLocalDateParts(rolledInto, timeZone), delta, timeZone),
    );
    return withExtraQuery(
      "/",
      joinQueryParts([
        `date=${rolledDate}`,
        groupsExtraQuery,
        `day=${delta === -1 ? 6 : 0}`,
        expandedHours ? "hours=all" : undefined,
      ]),
    );
  }

  const dayHrefs = Array.from({ length: 7 }, (_, index) =>
    withExtraQuery(
      "/",
      joinQueryParts([
        dateExtraQuery,
        groupsExtraQuery,
        `day=${index}`,
        expandedHours ? "hours=all" : undefined,
      ]),
    ),
  );

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader user={user} activeNav="calendar" />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/*
          Below `lg` this stacks underneath the calendar instead of beside it.
          It used to be `hidden lg:flex`, which meant adding availability and
          reviewing your own slots were impossible on a phone — the calendar
          was read-only on exactly the device it gets used on most.
        */}
        <aside className="order-2 flex w-full shrink-0 flex-col gap-4 lg:order-1 lg:w-64">
          <CalendarAvailabilityForm
            groups={allGroups}
            defaultGroupIds={
              selectedIds.length > 0 ? selectedIds : allGroups.map((group) => group.id)
            }
            defaultTimeZone={user.timezone}
            favoriteTimeZones={favoriteTimeZones}
          />

          <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Your availability
            </h2>
            <SlotList slots={ownSlots} timeZone={user.timezone} />
          </section>
        </aside>

        <main className="order-1 min-w-0 flex-1 space-y-4 lg:order-2">
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
                basePath="/"
                view={view}
                extraQuery={viewSwitcherExtraQuery}
              />
              <CalendarNav
                basePath="/"
                view={view}
                reference={reference}
                timeZone={user.timezone}
                extraQuery={navExtraQuery}
              />
            </div>
          </div>

          <FreeRightNow people={freeRightNow} />

          {allGroups.length > 0 && ownSlots.length === 0 && <FirstAvailabilityNudge />}

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
                basePath="/"
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

          {view === "week" && weekDays && selectedIds.length > 0 && (
            <BestTimes
              windows={bestTimes}
              members={members}
              timeZone={user.timezone}
              weekDays={weekDays}
              viewerId={user.id}
              showGroupNames={selectedIds.length > 1}
              dayHrefs={dayHrefs}
              historical={bestTimesAreHistorical}
            />
          )}

          {view === "week" && weekDays && (
            <CalendarGrid
              occurrences={occurrences}
              overlapWindows={overlapWindows}
              members={members}
              timeZone={user.timezone}
              weekDays={weekDays}
              viewerId={user.id}
              favoriteTimeZones={favoriteTimeZones}
              showGroupNames={selectedIds.length > 1}
              peakStartHour={peakStartHour}
              peakEndHour={peakEndHour}
              expandedHours={expandedHours}
              hoursToggleHref={hoursToggleHref}
              mobileDayIndex={mobileDayIndex}
              prevDayHref={dayStepHref(-1)}
              nextDayHref={dayStepHref(1)}
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
