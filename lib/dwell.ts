/**
 * Status dwell-time computation.
 *
 * Given an issue's creation time, current status, end time (resolved date or
 * "now"), and its ordered status transitions, we reconstruct how long the
 * issue spent in each status and aggregate across issues.
 *
 * Framework-free so it can be unit tested directly.
 */

export type StatusTransition = {
  /** Epoch ms of the transition. */
  at: number;
  /** Status the issue moved out of (null if unknown). */
  from: string | null;
  /** Status the issue moved into (null if unknown). */
  to: string | null;
};

export type DwellInterval = {
  status: string;
  hours: number;
};

export type DwellInput = {
  createdMs: number;
  /** Current status — used when an issue has no recorded transitions. */
  currentStatus: string;
  /** Resolved date (ms) for finished issues, else "now". */
  endMs: number;
  transitions: StatusTransition[];
};

export type DwellAggregateEntry = {
  status: string;
  totalHours: number;
  /** Number of (issue, status) intervals that contributed. */
  count: number;
  avgHours: number;
};

const MS_PER_HOUR = 3600 * 1000;

/**
 * Reconstruct per-status dwell intervals for a single issue.
 *
 * The timeline is: created → (transition 1) → (transition 2) → … → end.
 * The status before the first transition is that transition's `from`; the
 * status of each later segment is the previous transition's `to`. For a
 * resolved issue `endMs` is the resolution time, so the terminal "Done"
 * segment naturally collapses to ~0. For an open issue `endMs` is now, so
 * the current segment reflects how long it has been sitting there.
 */
export function computeDwellIntervals(input: DwellInput): DwellInterval[] {
  const { createdMs, currentStatus, endMs } = input;
  const valid = input.transitions
    .filter((t) => Number.isFinite(t.at))
    .sort((a, b) => a.at - b.at);

  if (valid.length === 0) {
    const hours = Math.max(0, (endMs - createdMs) / MS_PER_HOUR);
    return hours > 0 ? [{ status: currentStatus, hours }] : [];
  }

  const intervals: DwellInterval[] = [];
  let prev = createdMs;
  let status: string | null = valid[0].from ?? currentStatus;
  for (const t of valid) {
    const hours = Math.max(0, (t.at - prev) / MS_PER_HOUR);
    if (status) intervals.push({ status, hours });
    prev = t.at;
    status = t.to ?? status;
  }
  const finalHours = Math.max(0, (endMs - prev) / MS_PER_HOUR);
  if (status) intervals.push({ status, hours: finalHours });
  return intervals;
}

/**
 * Aggregate dwell intervals across issues into per-status totals and averages.
 * Sorted by total hours descending so the most time-consuming statuses lead.
 */
export function aggregateDwell(issues: DwellInput[]): DwellAggregateEntry[] {
  const totals = new Map<string, { total: number; count: number }>();
  for (const issue of issues) {
    for (const iv of computeDwellIntervals(issue)) {
      const e = totals.get(iv.status) ?? { total: 0, count: 0 };
      e.total += iv.hours;
      e.count += 1;
      totals.set(iv.status, e);
    }
  }
  return [...totals.entries()]
    .map(([status, e]) => ({
      status,
      totalHours: e.total,
      count: e.count,
      avgHours: e.count > 0 ? e.total / e.count : 0,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}
