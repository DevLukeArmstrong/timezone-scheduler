/**
 * Quorum ("N of you are free at the same time") computation and the
 * anti-spam reconciliation against alerts already sent. Pure functions —
 * the database and Discord sides live in src/lib/services/quorum.ts.
 *
 * The problem this solves: "≥ N people overlap" describes a *state*, and
 * states persist, so anything that re-evaluates naively re-posts. Worse,
 * there is no edit path for a slot — nudging a window by fifteen minutes
 * is a delete and a create — so identity can't come from slot ids or from
 * exact times. Identity here is fuzzy on purpose: a computed window is
 * "the same quorum" as a stored alert when the two overlap in time at all
 * and share at least N members. That survives nudges, extensions,
 * shrinks, one member swapping out for another, and delete-then-re-add.
 */

/** Two people overlapping is a chat, not a quorum — the smallest allowed threshold. */
export const MIN_QUORUM_THRESHOLD = 2;

/** One member's concrete free window (a one-off slot or an expanded occurrence). */
export interface MemberWindow {
  userId: string;
  startTime: Date;
  endTime: Date;
}

/** A maximal span during which exactly `memberIds` (≥ threshold of them) are all free. */
export interface QuorumWindow {
  /** Sorted, unique. */
  memberIds: string[];
  startTime: Date;
  endTime: Date;
}

/** The subset of a stored `QuorumAlert` row the reconciliation needs. */
export interface StoredQuorumAlert {
  id: string;
  memberIds: string[];
  startTime: Date;
  endTime: Date;
  everyone: boolean;
}

export interface QuorumReconciliation {
  /** Brand-new quorums: post, and store one alert per window. */
  post: QuorumWindow[];
  /**
   * Known quorums that just reached every member: post `window` (the span
   * everyone shares) once and mark the alert `everyone`. The same alert
   * also appears in `update` with its full merged span.
   */
  upgrade: Array<{ alertId: string; window: QuorumWindow }>;
  /** Known quorums that drifted: rewrite the stored bounds/members, post nothing. */
  update: Array<{ alertId: string; window: QuorumWindow }>;
}

/**
 * Sweep-line over every member's windows inside `horizon`. Emits maximal
 * spans where the set of free members is constant and at least
 * `threshold` large. Adjacent spans with *different* sets stay separate
 * (7–9pm four people, 9–10pm three) — the message lists them as two
 * lines, which is what a reader wants to know.
 *
 * At equal instants, ends are processed before starts, so back-to-back
 * windows (one ends 9:00, another starts 9:00) never count as overlapping.
 */
export function findQuorumWindows(
  windows: MemberWindow[],
  threshold: number,
  horizon: { start: Date; end: Date },
): QuorumWindow[] {
  type Event = { at: number; delta: 1 | -1; userId: string };
  const events: Event[] = [];
  const horizonStart = horizon.start.getTime();
  const horizonEnd = horizon.end.getTime();

  for (const window of windows) {
    const start = Math.max(window.startTime.getTime(), horizonStart);
    const end = Math.min(window.endTime.getTime(), horizonEnd);
    if (end <= start) continue;
    events.push({ at: start, delta: 1, userId: window.userId });
    events.push({ at: end, delta: -1, userId: window.userId });
  }
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);

  // A member may have two windows that overlap each other (e.g. a one-off
  // inside a recurring series), so count per member rather than toggling.
  const active = new Map<string, number>();
  const result: QuorumWindow[] = [];
  let previousAt: number | null = null;

  const flush = (until: number) => {
    if (previousAt === null || until <= previousAt) return;
    const members = [...active.keys()].sort();
    if (members.length < threshold) return;
    const last = result[result.length - 1];
    if (
      last &&
      last.endTime.getTime() === previousAt &&
      sameMembers(last.memberIds, members)
    ) {
      last.endTime = new Date(until);
      return;
    }
    result.push({ memberIds: members, startTime: new Date(previousAt), endTime: new Date(until) });
  };

  for (const event of events) {
    flush(event.at);
    const count = (active.get(event.userId) ?? 0) + event.delta;
    if (count <= 0) active.delete(event.userId);
    else active.set(event.userId, count);
    previousAt = event.at;
  }

  return result;
}

/**
 * Whether a freshly computed window and a stored alert describe the same
 * quorum: they overlap in time at all, and at least `threshold` of the
 * same people are in both. Touching-but-not-overlapping is not the same.
 */
export function isSameQuorum(
  window: QuorumWindow,
  alert: StoredQuorumAlert,
  threshold: number,
): boolean {
  if (window.startTime >= alert.endTime || window.endTime <= alert.startTime) return false;
  return sharedCount(window.memberIds, alert.memberIds) >= threshold;
}

/**
 * Decides what to do with this evaluation's windows given what has already
 * been posted. Every stored alert absorbs all windows that are "the same
 * quorum" as it (a window that split into two segments still belongs to
 * one alert) and is rewritten to their combined span and member union —
 * silently, unless that union has just reached every member of the group,
 * which earns one upgrade post. Windows no alert claims are new.
 *
 * Stored alerts that claim nothing are left alone. That's the stickiness:
 * if the quorum collapsed because someone deleted a slot to re-add it
 * later, the alert is still there to claim the re-added window.
 */
export function reconcileQuorumWindows(
  windows: QuorumWindow[],
  alerts: StoredQuorumAlert[],
  threshold: number,
  memberCount: number,
): QuorumReconciliation {
  const claimed = new Set<QuorumWindow>();
  const result: QuorumReconciliation = { post: [], upgrade: [], update: [] };

  for (const alert of alerts) {
    const matched = windows.filter((window) => isSameQuorum(window, alert, threshold));
    if (matched.length === 0) continue;
    for (const window of matched) claimed.add(window);

    const merged: QuorumWindow = {
      memberIds: [...new Set(matched.flatMap((window) => window.memberIds))].sort(),
      startTime: new Date(Math.min(...matched.map((window) => window.startTime.getTime()))),
      endTime: new Date(Math.max(...matched.map((window) => window.endTime.getTime()))),
    };

    result.update.push({ alertId: alert.id, window: merged });

    const everyoneWindow = matched.find((window) => window.memberIds.length >= memberCount);
    if (everyoneWindow && !alert.everyone) {
      result.upgrade.push({ alertId: alert.id, window: everyoneWindow });
    }
  }

  for (const window of windows) {
    if (!claimed.has(window)) result.post.push(window);
  }

  return result;
}

function sharedCount(a: string[], b: string[]): number {
  const set = new Set(b);
  let count = 0;
  for (const id of a) if (set.has(id)) count++;
  return count;
}

function sameMembers(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
