/**
 * Pure aggregation helpers for the Resolution Time dashboard.
 *
 * - calculateResolutionHours: created→resolved in hours (null if not resolved)
 * - buildHistogram: bucket resolution times into duration ranges
 * - buildTimeSeries: bucket resolved issues by their resolved-on date, compute
 *   per-bucket average resolution time
 * - buildFacets / applyFacets: facet-style "smart filters" (Status / Assignee
 *   / Type / Priority / Label) per source
 *
 * All functions are framework-free so they can be unit tested directly.
 */
import type { NormalizedIssue } from "@/lib/jira/types";

export const MS_PER_HOUR = 3600 * 1000;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export type ResolvedIssue = NormalizedIssue & {
  resolutionHours: number;
};

/** Resolution duration in hours. Returns null if the issue is not resolved. */
export function calculateResolutionHours(issue: NormalizedIssue): number | null {
  if (!issue.created || !issue.resolved) return null;
  const c = Date.parse(issue.created);
  const r = Date.parse(issue.resolved);
  if (!Number.isFinite(c) || !Number.isFinite(r)) return null;
  if (r < c) return 0;
  return (r - c) / MS_PER_HOUR;
}

/** Returns only resolved issues with `resolutionHours` attached. */
export function withResolutionHours(issues: NormalizedIssue[]): ResolvedIssue[] {
  const out: ResolvedIssue[] = [];
  for (const i of issues) {
    const h = calculateResolutionHours(i);
    if (h === null) continue;
    out.push({ ...i, resolutionHours: h });
  }
  return out;
}

export function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  let s = 0;
  for (const n of nums) s += n;
  return s / nums.length;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[m - 1] + sorted[m]) / 2;
  return sorted[m];
}

export function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/* -------------------------------------------------------------------------- */
/*  Histogram                                                                  */
/* -------------------------------------------------------------------------- */

export type HistogramBin = {
  /** Lower bound in hours, inclusive */
  fromHours: number;
  /** Upper bound in hours, exclusive (`null` for the open-ended last bin) */
  toHours: number | null;
  label: string;
  count: number;
  /** Issue keys (and serverId) for issues that fell in this bin */
  issues: ResolvedIssue[];
};

export const HOURS_PER_WEEK = 7 * 24;

/**
 * Graduated tail boundaries: past the fixed-width (linear) region the bins
 * widen to calendar-ish steps — 1주 / 2주 / 1달(30d) / 3달(90d) — so a long
 * tail doesn't get squashed into a single overflow bin.
 */
const GRADUATED_BOUNDARIES: ReadonlyArray<{ hours: number; label: string }> = [
  { hours: HOURS_PER_WEEK, label: "1주" },
  { hours: 2 * HOURS_PER_WEEK, label: "2주" },
  { hours: 30 * 24, label: "1달" },
  { hours: 90 * 24, label: "3달" },
];

function formatBoundary(h: number): string {
  const named = GRADUATED_BOUNDARIES.find((g) => g.hours === h);
  if (named) return named.label;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  return d < 10 ? `${d.toFixed(1)}d` : `${Math.round(d)}d`;
}

function formatBinLabel(fromHours: number, toHours: number | null): string {
  if (toHours === null) return `${formatBoundary(fromHours)}+`;
  return `${formatBoundary(fromHours)}–${formatBoundary(toHours)}`;
}

/**
 * Bucket resolved issues into duration bins. The first region uses fixed
 * `bucketHours`-wide bins (capped at `maxLinearBins`, and never past 1 week);
 * beyond that the bins widen to graduated steps — 1주, 2주, 1달, 3달 — with an
 * open-ended `3달+` bin at the end. This keeps short-lived issues readable at
 * the chosen granularity while still spreading out the long tail instead of
 * dumping everything into one overflow bin.
 */
export function buildHistogram(
  issues: ResolvedIssue[],
  bucketHours: number,
  maxLinearBins: number = 12,
): HistogramBin[] {
  // Upper edges of every bin; the final bin past the last edge is open-ended.
  const edges: number[] = [];
  const linearBins = Math.min(
    maxLinearBins,
    Math.max(1, Math.floor(HOURS_PER_WEEK / bucketHours)),
  );
  for (let i = 1; i <= linearBins; i++) edges.push(i * bucketHours);
  for (const g of GRADUATED_BOUNDARIES) {
    if (g.hours > edges[edges.length - 1]) edges.push(g.hours);
  }

  const out: HistogramBin[] = [];
  let from = 0;
  for (const to of edges) {
    out.push({
      fromHours: from,
      toHours: to,
      label: formatBinLabel(from, to),
      count: 0,
      issues: [],
    });
    from = to;
  }
  out.push({
    fromHours: from,
    toHours: null,
    label: formatBinLabel(from, null),
    count: 0,
    issues: [],
  });

  for (const issue of issues) {
    const h = issue.resolutionHours;
    let idx = edges.findIndex((to) => h < to);
    if (idx === -1) idx = out.length - 1; // past the last edge → open-ended bin
    out[idx].issues.push(issue);
    out[idx].count += 1;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Time series                                                                */
/* -------------------------------------------------------------------------- */

export type TimeBucket = "day" | "week" | "month" | "quarter";

export type TimeSeriesPoint = {
  /** ISO date for the bucket start (yyyy-mm-dd) */
  date: string;
  /** Display label (e.g., "05-30" or "2026-W22") */
  label: string;
  /** Average resolution time, in hours; null if there were no resolved issues */
  avgHours: number | null;
  median: number | null;
  p90: number | null;
  count: number;
};

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  // ISO week: Monday = 1, Sunday = 7
  const dow = (out.getDay() + 6) % 7; // shift so Monday = 0
  out.setDate(out.getDate() - dow);
  return out;
}

function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

function startOfQuarter(d: Date): Date {
  const out = startOfMonth(d);
  const q = Math.floor(out.getMonth() / 3);
  out.setMonth(q * 3);
  return out;
}

function bucketStart(d: Date, bucket: TimeBucket): Date {
  if (bucket === "day") return startOfDay(d);
  if (bucket === "week") return startOfWeek(d);
  if (bucket === "month") return startOfMonth(d);
  return startOfQuarter(d);
}

function advance(d: Date, bucket: TimeBucket): Date {
  const out = new Date(d);
  if (bucket === "day") out.setDate(out.getDate() + 1);
  else if (bucket === "week") out.setDate(out.getDate() + 7);
  else if (bucket === "month") out.setMonth(out.getMonth() + 1);
  else out.setMonth(out.getMonth() + 3);
  return out;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function bucketLabel(d: Date, bucket: TimeBucket): string {
  if (bucket === "quarter") {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  }
  if (bucket === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (bucket === "week") {
    // Display as MM-DD (week start)
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Build a series of time buckets covering the last `windowDays` days, with the
 * average resolution time (in hours) of issues that were *resolved* in each
 * bucket. Useful to track whether resolution time is trending up or down.
 */
export function buildTimeSeries(
  issues: ResolvedIssue[],
  windowDays: number,
  bucket: TimeBucket,
  now: Date = new Date(),
): TimeSeriesPoint[] {
  const end = bucketStart(now, bucket);
  const startBoundary = new Date(end);
  startBoundary.setDate(startBoundary.getDate() - windowDays + 1);
  const start = bucketStart(startBoundary, bucket);

  const buckets: TimeSeriesPoint[] = [];
  const indexByKey = new Map<string, number>();
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = isoDate(cursor);
    indexByKey.set(key, buckets.length);
    buckets.push({
      date: key,
      label: bucketLabel(cursor, bucket),
      avgHours: null,
      median: null,
      p90: null,
      count: 0,
    });
    cursor = advance(cursor, bucket);
  }

  const samples: number[][] = buckets.map(() => []);
  for (const issue of issues) {
    if (!issue.resolved) continue;
    const resolvedAt = new Date(issue.resolved);
    if (Number.isNaN(resolvedAt.getTime())) continue;
    const b = bucketStart(resolvedAt, bucket);
    const key = isoDate(b);
    const idx = indexByKey.get(key);
    if (idx === undefined) continue;
    samples[idx].push(issue.resolutionHours);
  }

  for (let i = 0; i < buckets.length; i++) {
    const arr = samples[i];
    if (arr.length === 0) continue;
    buckets[i].avgHours = average(arr);
    buckets[i].median = median(arr);
    buckets[i].p90 = percentile(arr, 90);
    buckets[i].count = arr.length;
  }
  return buckets;
}

export type UnresolvedTimeSeriesPoint = {
  /** ISO date for the bucket start (yyyy-mm-dd) */
  date: string;
  /** Display label */
  label: string;
  /** Count of issues unresolved as of the END of this bucket */
  unresolved: number;
};

/**
 * Build a snapshot count of unresolved issues at the end of each bucket. An
 * issue counts as "unresolved at time T" when it was created on or before T
 * AND either has no resolved timestamp or was resolved after T.
 */
export function buildUnresolvedTimeSeries(
  issues: NormalizedIssue[],
  windowDays: number,
  bucket: TimeBucket,
  now: Date = new Date(),
): UnresolvedTimeSeriesPoint[] {
  const end = bucketStart(now, bucket);
  const startBoundary = new Date(end);
  startBoundary.setDate(startBoundary.getDate() - windowDays + 1);
  const start = bucketStart(startBoundary, bucket);

  const buckets: { date: string; label: string; startMs: number }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    buckets.push({
      date: isoDate(cursor),
      label: bucketLabel(cursor, bucket),
      startMs: cursor.getTime(),
    });
    cursor = advance(cursor, bucket);
  }

  const parsed = issues
    .map((i) => {
      const c = i.created ? Date.parse(i.created) : NaN;
      const r = i.resolved ? Date.parse(i.resolved) : NaN;
      return {
        created: Number.isFinite(c) ? c : null,
        resolved: Number.isFinite(r) ? r : null,
      };
    })
    .filter((p): p is { created: number; resolved: number | null } =>
      p.created !== null,
    );

  return buckets.map((b, i) => {
    const next = buckets[i + 1];
    const bucketEndMs = next ? next.startMs : Number.POSITIVE_INFINITY;
    let count = 0;
    for (const p of parsed) {
      if (p.created >= bucketEndMs) continue;
      if (p.resolved !== null && p.resolved < bucketEndMs) continue;
      count += 1;
    }
    return { date: b.date, label: b.label, unresolved: count };
  });
}

export type BugRatePoint = {
  /** ISO date for the bucket start (yyyy-mm-dd) */
  date: string;
  label: string;
  /** Issues created in this bucket. */
  total: number;
  /** Of those, how many were bug-type. */
  bugs: number;
  /** bugs / total in 0..1; 0 when total is 0. */
  ratio: number;
};

/** True when an issue type looks like a bug/defect (locale-tolerant). */
export function isBugType(issueType: string | undefined | null): boolean {
  if (!issueType) return false;
  const t = issueType.toLowerCase();
  return (
    t.includes("bug") ||
    t.includes("defect") ||
    issueType.includes("버그") ||
    issueType.includes("결함") ||
    issueType.includes("장애")
  );
}

/**
 * Per-bucket share of newly-created issues that are bugs. Bucketed by the
 * `created` date (incoming bug rate) — a rising line means a growing fraction
 * of incoming work is defects, a quality signal worth watching.
 *
 * Kept as a thin wrapper over the general `buildRatioSeries` for the built-in
 * bug-rate behaviour and its unit tests.
 */
export function buildBugRateSeries(
  issues: NormalizedIssue[],
  windowDays: number,
  bucket: TimeBucket,
  now: Date = new Date(),
): BugRatePoint[] {
  return buildRatioSeries(issues, windowDays, bucket, {
    numerator: (i) => isBugType(i.issueType),
    denominator: null,
    basis: "created",
    now,
  }).map((p) => ({
    date: p.date,
    label: p.label,
    total: p.denominator,
    bugs: p.numerator,
    ratio: p.ratio,
  }));
}

export type RatioBasis = "created" | "resolved";

export type RatioPoint = {
  /** ISO date for the bucket start (yyyy-mm-dd) */
  date: string;
  label: string;
  /** Issues in the denominator set that fell in this bucket. */
  denominator: number;
  /** Of those, how many also match the numerator predicate. */
  numerator: number;
  /** numerator / denominator in 0..1; 0 when denominator is 0. */
  ratio: number;
};

export type RatioOptions = {
  /** Predicate selecting the "of interest" subset (numerator). */
  numerator: (issue: NormalizedIssue) => boolean;
  /**
   * Predicate selecting the base set (denominator). `null` means "all issues
   * with a valid date for the chosen basis".
   */
  denominator: ((issue: NormalizedIssue) => boolean) | null;
  /** Bucket by created date (incoming) or resolved date (outgoing). */
  basis: RatioBasis;
  now?: Date;
};

/**
 * General ratio time-series: per bucket, the share of denominator-matching
 * issues that also match the numerator. Bucketed by created or resolved date.
 * Powers the configurable "비율 분석" cards (e.g. numerator `issuetype = Bug`,
 * denominator = all → bug intake rate).
 */
export function buildRatioSeries(
  issues: NormalizedIssue[],
  windowDays: number,
  bucket: TimeBucket,
  options: RatioOptions,
): RatioPoint[] {
  const now = options.now ?? new Date();
  const end = bucketStart(now, bucket);
  const startBoundary = new Date(end);
  startBoundary.setDate(startBoundary.getDate() - windowDays + 1);
  const start = bucketStart(startBoundary, bucket);

  const buckets: RatioPoint[] = [];
  const indexByKey = new Map<string, number>();
  let cursor = new Date(start);
  while (cursor <= end) {
    indexByKey.set(isoDate(cursor), buckets.length);
    buckets.push({
      date: isoDate(cursor),
      label: bucketLabel(cursor, bucket),
      denominator: 0,
      numerator: 0,
      ratio: 0,
    });
    cursor = advance(cursor, bucket);
  }

  for (const issue of issues) {
    const dateStr = options.basis === "resolved" ? issue.resolved : issue.created;
    if (!dateStr) continue;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) continue;
    if (options.denominator && !options.denominator(issue)) continue;
    const idx = indexByKey.get(isoDate(bucketStart(d, bucket)));
    if (idx === undefined) continue;
    buckets[idx].denominator += 1;
    if (options.numerator(issue)) buckets[idx].numerator += 1;
  }

  for (const b of buckets) {
    b.ratio = b.denominator > 0 ? b.numerator / b.denominator : 0;
  }
  return buckets;
}

/**
 * Map a calendar date to the matching bucket label in the given time series.
 * Returns null if the date falls outside the series window.
 *
 * Used by the time-series chart to anchor milestone ReferenceLines to the
 * correct category position on the X axis.
 */
export function findBucketLabelForDate(
  date: Date,
  points: ReadonlyArray<{ date: string; label: string }>,
): string | null {
  if (points.length === 0) return null;
  const target = date.getTime();
  if (!Number.isFinite(target)) return null;
  const firstStart = new Date(points[0].date).getTime();
  if (target < firstStart) return null;
  let lastMatch: string | null = null;
  for (const p of points) {
    const t = new Date(p.date).getTime();
    if (t <= target) lastMatch = p.label;
    else break;
  }
  return lastMatch;
}

/* -------------------------------------------------------------------------- */
/*  Smart filters (facets)                                                     */
/* -------------------------------------------------------------------------- */

export type FacetField =
  | "status"
  | "assignee"
  | "issueType"
  | "priority"
  | "labels"
  | "reporter";

export type Facets = {
  status: { value: string; count: number }[];
  assignee: { value: string; count: number }[];
  issueType: { value: string; count: number }[];
  priority: { value: string; count: number }[];
  labels: { value: string; count: number }[];
  reporter: { value: string; count: number }[];
};

export type FacetSelection = Partial<Record<FacetField, string[]>>;

/**
 * Selection state for the user-defined "custom" facets (e.g., "운영체제").
 * Outer key is the facet id, inner array holds the ids of selected values.
 */
export type CustomFacetSelection = Record<string, string[]>;

/**
 * The shape consumed by the smart-filter UI and the apply step. Each value
 * carries a compiled predicate so the dashboard view doesn't repeatedly parse
 * the same JQL on every render. `compiled === null` means the stored JQL was
 * invalid and we simply skip that value at filter time.
 */
export type CustomFacetForFilter = {
  id: string;
  name: string;
  values: Array<{
    id: string;
    name: string;
    compiled: ((issue: NormalizedIssue) => boolean) | null;
  }>;
};

/** Aggregate field-value counts. Useful to populate filter dropdowns. */
export function buildFacets(issues: NormalizedIssue[]): Facets {
  const counts: Record<FacetField, Map<string, number>> = {
    status: new Map(),
    assignee: new Map(),
    issueType: new Map(),
    priority: new Map(),
    labels: new Map(),
    reporter: new Map(),
  };
  for (const i of issues) {
    bump(counts.status, i.effectiveStatus.label);
    bump(counts.assignee, i.assignee?.name ?? "(미할당)");
    bump(counts.reporter, i.reporter?.name ?? "(미상)");
    bump(counts.issueType, i.issueType ?? "(미상)");
    bump(counts.priority, i.priority ?? "(미상)");
    for (const l of i.labels) bump(counts.labels, l);
  }
  return {
    status: toEntries(counts.status),
    assignee: toEntries(counts.assignee),
    issueType: toEntries(counts.issueType),
    priority: toEntries(counts.priority),
    labels: toEntries(counts.labels),
    reporter: toEntries(counts.reporter),
  };
}

function bump(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function toEntries(m: Map<string, number>): { value: string; count: number }[] {
  return [...m.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Keeps only the issues whose facet values match all active selections.
 * Multiple values within the same facet are OR'd, distinct facets are AND'd.
 */
export function applyFacets(
  issues: NormalizedIssue[],
  selection: FacetSelection,
): NormalizedIssue[] {
  const checks: ((i: NormalizedIssue) => boolean)[] = [];
  if (selection.status && selection.status.length > 0) {
    const set = new Set(selection.status);
    checks.push((i) => set.has(i.effectiveStatus.label));
  }
  if (selection.assignee && selection.assignee.length > 0) {
    const set = new Set(selection.assignee);
    checks.push((i) => set.has(i.assignee?.name ?? "(미할당)"));
  }
  if (selection.reporter && selection.reporter.length > 0) {
    const set = new Set(selection.reporter);
    checks.push((i) => set.has(i.reporter?.name ?? "(미상)"));
  }
  if (selection.issueType && selection.issueType.length > 0) {
    const set = new Set(selection.issueType);
    checks.push((i) => set.has(i.issueType ?? "(미상)"));
  }
  if (selection.priority && selection.priority.length > 0) {
    const set = new Set(selection.priority);
    checks.push((i) => set.has(i.priority ?? "(미상)"));
  }
  if (selection.labels && selection.labels.length > 0) {
    const set = new Set(selection.labels);
    checks.push((i) => i.labels.some((l) => set.has(l)));
  }
  if (checks.length === 0) return issues;
  return issues.filter((i) => checks.every((fn) => fn(i)));
}

/**
 * Apply custom (user-defined, JQL-backed) facets. Like `applyFacets`, values
 * within a single facet are OR'd and distinct facets are AND'd. Selected
 * values whose JQL didn't compile are silently ignored.
 */
export function applyCustomFacets(
  issues: NormalizedIssue[],
  customFacets: CustomFacetForFilter[],
  selection: CustomFacetSelection,
): NormalizedIssue[] {
  const checks: ((i: NormalizedIssue) => boolean)[] = [];
  for (const facet of customFacets) {
    const selectedIds = selection[facet.id];
    if (!selectedIds || selectedIds.length === 0) continue;
    const preds = facet.values
      .filter((v) => selectedIds.includes(v.id) && v.compiled !== null)
      .map((v) => v.compiled as (i: NormalizedIssue) => boolean);
    if (preds.length === 0) continue;
    checks.push((i) => preds.some((p) => p(i)));
  }
  if (checks.length === 0) return issues;
  return issues.filter((i) => checks.every((fn) => fn(i)));
}

/* -------------------------------------------------------------------------- */
/*  Source helpers                                                             */
/* -------------------------------------------------------------------------- */

export type SourceStats = {
  total: number;
  resolved: number;
  unresolved: number;
  avgHours: number | null;
  medianHours: number | null;
  p90Hours: number | null;
};

export function statsForSource(resolved: ResolvedIssue[], total: number): SourceStats {
  if (resolved.length === 0) {
    return {
      total,
      resolved: 0,
      unresolved: total,
      avgHours: null,
      medianHours: null,
      p90Hours: null,
    };
  }
  const hours = resolved.map((r) => r.resolutionHours);
  return {
    total,
    resolved: resolved.length,
    unresolved: total - resolved.length,
    avgHours: average(hours),
    medianHours: median(hours),
    p90Hours: percentile(hours, 90),
  };
}

/* -------------------------------------------------------------------------- */
/*  Period comparison                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Split resolved issues into the current window `[now - windowDays, now]` and
 * the immediately preceding window of the same length
 * `[now - 2·windowDays, now - windowDays)`. Issues resolved before both
 * windows are dropped. Lets the dashboard compare "this period vs last
 * period" for retro-style decisions.
 */
export function partitionResolvedByPeriod(
  resolved: ResolvedIssue[],
  windowDays: number,
  now: number = Date.now(),
): { current: ResolvedIssue[]; previous: ResolvedIssue[] } {
  const windowMs = windowDays * MS_PER_DAY;
  const curFrom = now - windowMs;
  const prevFrom = now - 2 * windowMs;
  const current: ResolvedIssue[] = [];
  const previous: ResolvedIssue[] = [];
  for (const r of resolved) {
    if (!r.resolved) continue;
    const t = Date.parse(r.resolved);
    if (!Number.isFinite(t)) continue;
    if (t >= curFrom && t <= now) current.push(r);
    else if (t >= prevFrom && t < curFrom) previous.push(r);
  }
  return { current, previous };
}

/* -------------------------------------------------------------------------- */
/*  Long-tail (slow issue) analysis                                            */
/* -------------------------------------------------------------------------- */

export type LabeledResolvedIssue = ResolvedIssue & {
  sourceId: string;
  sourceLabel: string;
  sourceColor: string;
};

/**
 * Flatten per-source resolved arrays into a single list, tagging each issue
 * with its source label so the long-tail table can show source attribution.
 */
export function flattenResolvedWithSource(
  perSource: ReadonlyArray<{
    sourceId: string;
    sourceLabel: string;
    sourceColor: string;
    resolved: ResolvedIssue[];
  }>,
): LabeledResolvedIssue[] {
  const out: LabeledResolvedIssue[] = [];
  for (const ps of perSource) {
    for (const r of ps.resolved) {
      out.push({
        ...r,
        sourceId: ps.sourceId,
        sourceLabel: ps.sourceLabel,
        sourceColor: ps.sourceColor,
      });
    }
  }
  return out;
}

export type DimensionBreakdownEntry = {
  value: string;
  count: number;
  /** Fraction of the slow set this value accounts for (0..1). */
  share: number;
};

export type DimensionBreakdown = {
  status: DimensionBreakdownEntry[];
  assignee: DimensionBreakdownEntry[];
  issueType: DimensionBreakdownEntry[];
  priority: DimensionBreakdownEntry[];
  labels: DimensionBreakdownEntry[];
};

function breakdownEntries(
  m: Map<string, number>,
  total: number,
  topN: number,
): DimensionBreakdownEntry[] {
  return [...m.entries()]
    .map(([value, count]) => ({
      value,
      count,
      share: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, topN);
}

/**
 * For a slow-issue set, return the top N most common values per facet so the
 * user can spot dominant patterns at a glance (e.g., "60% of slow issues are
 * tagged `payment`").
 */
export function dimensionBreakdown(
  issues: ReadonlyArray<NormalizedIssue>,
  topN: number = 3,
): DimensionBreakdown {
  const counts: Record<keyof DimensionBreakdown, Map<string, number>> = {
    status: new Map(),
    assignee: new Map(),
    issueType: new Map(),
    priority: new Map(),
    labels: new Map(),
  };
  for (const i of issues) {
    bump(counts.status, i.effectiveStatus.label);
    bump(counts.assignee, i.assignee?.name ?? "(미할당)");
    bump(counts.issueType, i.issueType ?? "(미상)");
    bump(counts.priority, i.priority ?? "(미상)");
    for (const l of i.labels) bump(counts.labels, l);
  }
  const total = issues.length;
  return {
    status: breakdownEntries(counts.status, total, topN),
    assignee: breakdownEntries(counts.assignee, total, topN),
    issueType: breakdownEntries(counts.issueType, total, topN),
    priority: breakdownEntries(counts.priority, total, topN),
    labels: breakdownEntries(counts.labels, total, topN),
  };
}

/**
 * "Slow factor" = how many times slower than the population median this
 * issue resolved. Returns 1.0 when median is 0 (degenerate set).
 */
export function slowFactor(hours: number, medianHours: number): number {
  if (medianHours <= 0) return 1;
  return hours / medianHours;
}

/* -------------------------------------------------------------------------- */
/*  Aging WIP (open issue) analysis                                            */
/* -------------------------------------------------------------------------- */

export type AgingIssue = NormalizedIssue & {
  /** Hours since the issue was created (how long it has been open). */
  ageHours: number;
  /** Hours since the issue was last updated (idle / staleness signal). */
  idleHours: number;
};

export type LabeledAgingIssue = AgingIssue & {
  sourceId: string;
  sourceLabel: string;
  sourceColor: string;
};

/**
 * Keep only unresolved ("work in progress") issues and attach age (since
 * created) and idle (since last update) durations in hours. An issue counts
 * as unresolved when it has no `resolved` timestamp — see normalizeIssue,
 * which already folds done-category issues into `resolved`.
 *
 * Unlike resolution time (which measures finished work), aging WIP surfaces
 * what is *currently* stuck, which is usually the more actionable signal.
 */
export function withAging(
  issues: NormalizedIssue[],
  now: number = Date.now(),
): AgingIssue[] {
  const out: AgingIssue[] = [];
  for (const i of issues) {
    if (i.resolved) continue; // resolved → not WIP
    const created = i.created ? Date.parse(i.created) : NaN;
    if (!Number.isFinite(created)) continue;
    const updatedParsed = i.updated ? Date.parse(i.updated) : NaN;
    const updated = Number.isFinite(updatedParsed) ? updatedParsed : created;
    out.push({
      ...i,
      ageHours: Math.max(0, (now - created) / MS_PER_HOUR),
      idleHours: Math.max(0, (now - updated) / MS_PER_HOUR),
    });
  }
  return out;
}

/**
 * Flatten per-source aging arrays into one list, tagging each issue with its
 * source so the aging-WIP table can show source attribution.
 */
export function flattenAgingWithSource(
  perSource: ReadonlyArray<{
    sourceId: string;
    sourceLabel: string;
    sourceColor: string;
    aging: AgingIssue[];
  }>,
): LabeledAgingIssue[] {
  const out: LabeledAgingIssue[] = [];
  for (const ps of perSource) {
    for (const a of ps.aging) {
      out.push({
        ...a,
        sourceId: ps.sourceId,
        sourceLabel: ps.sourceLabel,
        sourceColor: ps.sourceColor,
      });
    }
  }
  return out;
}

/** Pretty-print hours like `36h` or `2.5d`. */
export function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined || !Number.isFinite(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 24;
  if (d < 10) return `${d.toFixed(1)}d`;
  return `${Math.round(d)}d`;
}
