/**
 * The heat scale for the week grid's overlap shading, kept beside
 * `member-colors.ts` for the same reason: "three people free" has to look
 * the same in the grid, the best-times list and the legend.
 *
 * Two ramps, not one. Below the group's quorum the wash is neutral and
 * deepens with each extra person; at or above it the wash turns green and
 * keeps deepening. The break at quorum is therefore *categorical* — colour
 * appears — rather than one more step of the same shade, so the windows
 * worth acting on separate from the rest without anyone having to compare
 * two greens side by side. Green is also what the year heatmap already means
 * by "people are free here", and the neutral half stays clear of all eight
 * member hues underneath it.
 *
 * The levels are absolute (a headcount maps to a shade) rather than scaled
 * to the busiest window on screen, so flipping between weeks compares like
 * with like instead of re-normalising under you.
 */

export interface OverlapHeat {
  /**
   * Wash painted across the whole day column, behind the member blocks. Kept
   * light on purpose: it tints a region of the calendar without turning the
   * blocks on top of it to mud.
   */
  bg: string;
  /**
   * Solid fill for the gutter strip down the left of the column — and the
   * same swatch in the legend and the best-times list. This is the reading
   * that has to survive at any density, because it is the one part of the
   * column no slot block ever covers, so it carries the saturation the wash
   * cannot afford.
   */
  strip: string;
  /** Pill classes for the "4 free" badge. Only rendered at or above quorum. */
  badge: string;
}

/**
 * Neutral: 1, 2, 3-or-more people free, all short of quorum. One person free
 * gets the faintest wash of the set on purpose — it is usually most of the
 * week, and a solid grey afternoon would drown out the hour that matters.
 * Its strip still marks it.
 */
const BELOW_QUORUM: Array<Pick<OverlapHeat, "bg" | "strip">> = [
  { bg: "bg-zinc-200/40 dark:bg-zinc-500/15", strip: "bg-zinc-300 dark:bg-zinc-700" },
  { bg: "bg-zinc-300/75 dark:bg-zinc-400/30", strip: "bg-zinc-400 dark:bg-zinc-600" },
  { bg: "bg-zinc-400/70 dark:bg-zinc-300/35", strip: "bg-zinc-500 dark:bg-zinc-500" },
];

/** Green: exactly quorum, then one, two, three-or-more people spare. */
const AT_QUORUM: Array<Pick<OverlapHeat, "bg" | "strip">> = [
  { bg: "bg-emerald-300/60 dark:bg-emerald-600/30", strip: "bg-emerald-400 dark:bg-emerald-600" },
  { bg: "bg-emerald-400/65 dark:bg-emerald-500/35", strip: "bg-emerald-500 dark:bg-emerald-500" },
  { bg: "bg-emerald-500/65 dark:bg-emerald-400/40", strip: "bg-emerald-600 dark:bg-emerald-400" },
  { bg: "bg-emerald-600/70 dark:bg-emerald-300/45", strip: "bg-emerald-700 dark:bg-emerald-300" },
];

const QUORUM_BADGE =
  "bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950";
const NO_BADGE = "bg-zinc-500 text-white dark:bg-zinc-400 dark:text-zinc-950";

/**
 * Shading for a span where `freeCount` of a group whose quorum is
 * `quorumThreshold` are all free.
 */
export function getOverlapHeat(freeCount: number, quorumThreshold: number): OverlapHeat {
  if (freeCount < quorumThreshold) {
    const level = BELOW_QUORUM[Math.min(Math.max(freeCount, 1), BELOW_QUORUM.length) - 1];
    return { ...level, badge: NO_BADGE };
  }
  const spare = freeCount - quorumThreshold;
  const level = AT_QUORUM[Math.min(spare, AT_QUORUM.length - 1)];
  return { ...level, badge: QUORUM_BADGE };
}

/**
 * The headcounts to show in the grid's heat legend: every step from one
 * person up to the densest overlap on screen, but never so many swatches
 * that the legend outgrows the thing it explains.
 */
export function heatLegendCounts(maxFreeCount: number, quorumThreshold: number): number[] {
  const top = Math.max(maxFreeCount, quorumThreshold);
  const counts = new Set<number>([1, quorumThreshold, top]);
  if (quorumThreshold > 2) counts.add(quorumThreshold - 1);
  return [...counts].filter((count) => count >= 1 && count <= top).sort((a, b) => a - b);
}
