import Link from "next/link";
import { withExtraQuery } from "@/lib/calendar";

const PILL_BASE_CLASSNAME =
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors";
const PILL_SELECTED_CLASSNAME =
  "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200 dark:hover:bg-emerald-900";
const PILL_UNSELECTED_CLASSNAME =
  "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800";
const QUICK_LINK_CLASSNAME =
  "text-xs font-medium text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-600 hover:underline dark:text-zinc-500 dark:hover:text-zinc-300";

interface GroupFilterGroup {
  id: string;
  name: string;
}

interface GroupFilterProps {
  /** Route this filter navigates within, e.g. `/calendar`. */
  basePath: string;
  /** Every group the current user belongs to — the full universe of choices. */
  groups: GroupFilterGroup[];
  /** Groups currently shown on the calendar (already validated server-side). */
  selectedIds: string[];
  /** Other already-serialized search params to preserve — see `CalendarNav`. */
  extraQuery?: string;
}

/**
 * A multi-select "which groups should the calendar overlay?" control, driven
 * entirely by the `?groups=id1,id2` search param — like `CalendarNav`, every
 * pill here is a plain link to a different value of that param, so toggling
 * a group works with JavaScript disabled and needs no client component.
 * Selecting every group omits the param entirely (the default), and
 * deselecting all of them serializes to an explicit empty `groups=`.
 */
export function GroupFilter({ basePath, groups, selectedIds, extraQuery }: GroupFilterProps) {
  if (groups.length === 0) return null;

  const allIds = groups.map((group) => group.id);
  const selectedSet = new Set(selectedIds);

  function hrefFor(nextIds: string[]): string {
    const isDefault = nextIds.length === allIds.length;
    const base = isDefault ? basePath : `${basePath}?groups=${encodeURIComponent(nextIds.join(","))}`;
    return withExtraQuery(base, extraQuery);
  }

  function toggleHref(groupId: string): string {
    const next = new Set(selectedSet);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    return hrefFor(allIds.filter((id) => next.has(id)));
  }

  const allHref = hrefFor(allIds);
  const noneHref = withExtraQuery(`${basePath}?groups=`, extraQuery);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Groups
      </span>
      {groups.map((group) => {
        const isSelected = selectedSet.has(group.id);
        return (
          <Link
            key={group.id}
            href={toggleHref(group.id)}
            role="button"
            aria-pressed={isSelected}
            className={`${PILL_BASE_CLASSNAME} ${
              isSelected ? PILL_SELECTED_CLASSNAME : PILL_UNSELECTED_CLASSNAME
            }`}
          >
            {isSelected ? "✓ " : ""}
            {group.name}
          </Link>
        );
      })}
      <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
      <Link href={allHref} className={QUICK_LINK_CLASSNAME}>
        All
      </Link>
      <Link href={noneHref} className={QUICK_LINK_CLASSNAME}>
        None
      </Link>
    </div>
  );
}
