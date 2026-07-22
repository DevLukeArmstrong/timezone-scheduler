export interface MemberColor {
  border: string;
  bg: string;
  text: string;
  dot: string;
}

// A fixed palette shared by the group calendar and the member list/legend,
// so "member #2's color" means the same thing everywhere on the page.
export const MEMBER_COLORS: MemberColor[] = [
  {
    border: "border-emerald-300 dark:border-emerald-700",
    bg: "bg-emerald-200/80 dark:bg-emerald-900/60",
    text: "text-emerald-900 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
  {
    border: "border-sky-300 dark:border-sky-700",
    bg: "bg-sky-200/80 dark:bg-sky-900/60",
    text: "text-sky-900 dark:text-sky-100",
    dot: "bg-sky-500",
  },
  {
    border: "border-amber-300 dark:border-amber-700",
    bg: "bg-amber-200/80 dark:bg-amber-900/60",
    text: "text-amber-900 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  {
    border: "border-fuchsia-300 dark:border-fuchsia-700",
    bg: "bg-fuchsia-200/80 dark:bg-fuchsia-900/60",
    text: "text-fuchsia-900 dark:text-fuchsia-100",
    dot: "bg-fuchsia-500",
  },
  {
    border: "border-indigo-300 dark:border-indigo-700",
    bg: "bg-indigo-200/80 dark:bg-indigo-900/60",
    text: "text-indigo-900 dark:text-indigo-100",
    dot: "bg-indigo-500",
  },
  {
    border: "border-rose-300 dark:border-rose-700",
    bg: "bg-rose-200/80 dark:bg-rose-900/60",
    text: "text-rose-900 dark:text-rose-100",
    dot: "bg-rose-500",
  },
  {
    border: "border-lime-300 dark:border-lime-700",
    bg: "bg-lime-200/80 dark:bg-lime-900/60",
    text: "text-lime-900 dark:text-lime-100",
    dot: "bg-lime-500",
  },
  {
    border: "border-cyan-300 dark:border-cyan-700",
    bg: "bg-cyan-200/80 dark:bg-cyan-900/60",
    text: "text-cyan-900 dark:text-cyan-100",
    dot: "bg-cyan-500",
  },
];

/**
 * Deterministic per-member color, keyed by the member's stable index in a
 * join-ordered member list (see `listGroupMembers`) — a member's color
 * never changes as long as the group's membership order doesn't.
 */
export function getMemberColor(memberIndex: number): MemberColor {
  return MEMBER_COLORS[memberIndex % MEMBER_COLORS.length];
}
