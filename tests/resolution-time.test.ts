import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFacets,
  average,
  buildFacets,
  buildHistogram,
  buildTimeSeries,
  calculateResolutionHours,
  dimensionBreakdown,
  findBucketLabelForDate,
  flattenResolvedWithSource,
  formatHours,
  median,
  percentile,
  slowFactor,
  statsForSource,
  withAging,
  withResolutionHours,
  flattenAgingWithSource,
  partitionResolvedByPeriod,
  buildBugRateSeries,
  buildRatioSeries,
  isBugType,
  type ResolvedIssue,
} from "@/lib/resolution-time";
import type { NormalizedIssue } from "@/lib/jira/types";

function makeIssue(overrides: Partial<NormalizedIssue> = {}): NormalizedIssue {
  return {
    serverId: "s1",
    serverName: "Test",
    key: "T-1",
    url: "https://example.com/browse/T-1",
    summary: "issue",
    rawStatus: "Done",
    statusCategoryKey: "done",
    effectiveStatus: { label: "Done", color: "#10B981" },
    labels: [],
    ...overrides,
  };
}

/* ---------------------------- basic stat utils ---------------------------- */

test("average / median / percentile basic behaviour", () => {
  assert.equal(average([]), 0);
  assert.equal(average([2, 4, 6]), 4);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9.1);
});

test("formatHours emits readable units", () => {
  assert.equal(formatHours(null), "—");
  assert.equal(formatHours(0.5), "30m");
  assert.equal(formatHours(3.5), "3.5h");
  assert.equal(formatHours(48), "2.0d");
  assert.equal(formatHours(24 * 30), "30d");
});

/* ----------------------- resolution hours computation -------------------- */

test("calculateResolutionHours returns null when not resolved", () => {
  const issue = makeIssue({ created: "2026-05-01T00:00:00Z" });
  assert.equal(calculateResolutionHours(issue), null);
});

test("calculateResolutionHours returns elapsed hours", () => {
  const issue = makeIssue({
    created: "2026-05-01T00:00:00Z",
    resolved: "2026-05-02T12:00:00Z",
  });
  assert.equal(calculateResolutionHours(issue), 36);
});

test("calculateResolutionHours clamps negative durations to 0", () => {
  const issue = makeIssue({
    created: "2026-05-02T00:00:00Z",
    resolved: "2026-05-01T00:00:00Z",
  });
  assert.equal(calculateResolutionHours(issue), 0);
});

test("withResolutionHours filters out unresolved issues", () => {
  const issues: NormalizedIssue[] = [
    makeIssue({
      key: "A",
      created: "2026-05-01T00:00:00Z",
      resolved: "2026-05-02T00:00:00Z",
    }),
    makeIssue({ key: "B", created: "2026-05-01T00:00:00Z" }),
  ];
  const out = withResolutionHours(issues);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "A");
  assert.equal(out[0].resolutionHours, 24);
});

/* ------------------------------ aging WIP -------------------------------- */

test("withAging keeps only unresolved issues and computes age/idle", () => {
  const now = Date.parse("2026-05-31T00:00:00Z");
  const issues: NormalizedIssue[] = [
    // unresolved, created 10 days ago, updated 2 days ago
    makeIssue({
      key: "OPEN",
      rawStatus: "In Progress",
      statusCategoryKey: "indeterminate",
      effectiveStatus: { label: "In Progress", color: "#F59E0B" },
      created: "2026-05-21T00:00:00Z",
      updated: "2026-05-29T00:00:00Z",
    }),
    // resolved → excluded
    makeIssue({
      key: "DONE",
      created: "2026-05-01T00:00:00Z",
      resolved: "2026-05-02T00:00:00Z",
    }),
  ];
  const out = withAging(issues, now);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "OPEN");
  assert.equal(out[0].ageHours, 240); // 10 days
  assert.equal(out[0].idleHours, 48); // 2 days
});

test("withAging falls back to created when updated is missing", () => {
  const now = Date.parse("2026-05-31T00:00:00Z");
  const out = withAging(
    [
      makeIssue({
        key: "X",
        rawStatus: "To Do",
        statusCategoryKey: "new",
        effectiveStatus: { label: "To Do", color: "#888" },
        created: "2026-05-30T00:00:00Z",
        updated: undefined,
      }),
    ],
    now,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].ageHours, 24);
  assert.equal(out[0].idleHours, 24);
});

test("flattenAgingWithSource tags each issue with its source", () => {
  const now = Date.parse("2026-05-31T00:00:00Z");
  const aging = withAging(
    [
      makeIssue({
        key: "A",
        statusCategoryKey: "new",
        effectiveStatus: { label: "To Do", color: "#888" },
        created: "2026-05-20T00:00:00Z",
        updated: "2026-05-20T00:00:00Z",
      }),
    ],
    now,
  );
  const flat = flattenAgingWithSource([
    { sourceId: "s1", sourceLabel: "JQL 1", sourceColor: "#3B82F6", aging },
  ]);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].sourceLabel, "JQL 1");
  assert.equal(flat[0].key, "A");
});

/* --------------------------- period comparison --------------------------- */

test("partitionResolvedByPeriod splits current vs previous window", () => {
  const now = Date.parse("2026-05-31T00:00:00Z");
  const mk = (key: string, resolvedIso: string): ResolvedIssue => ({
    ...makeIssue({ key, resolved: resolvedIso }),
    resolutionHours: 10,
  });
  const issues = [
    mk("CUR1", "2026-05-30T00:00:00Z"), // 1 day ago → current (window 7d)
    mk("CUR2", "2026-05-26T00:00:00Z"), // 5 days ago → current
    mk("PREV1", "2026-05-22T00:00:00Z"), // 9 days ago → previous (7–14d)
    mk("OLD", "2026-05-10T00:00:00Z"), // 21 days ago → dropped
  ];
  const { current, previous } = partitionResolvedByPeriod(issues, 7, now);
  assert.deepEqual(
    current.map((i) => i.key).sort(),
    ["CUR1", "CUR2"],
  );
  assert.deepEqual(
    previous.map((i) => i.key),
    ["PREV1"],
  );
});

/* ------------------------------ bug rate --------------------------------- */

test("isBugType matches common bug/defect type names", () => {
  assert.equal(isBugType("Bug"), true);
  assert.equal(isBugType("Sub-bug"), true);
  assert.equal(isBugType("Defect"), true);
  assert.equal(isBugType("버그"), true);
  assert.equal(isBugType("Story"), false);
  assert.equal(isBugType(undefined), false);
});

test("buildBugRateSeries computes per-bucket bug ratio by created date", () => {
  const now = new Date("2026-05-31T00:00:00Z");
  const issues: NormalizedIssue[] = [
    makeIssue({ key: "B1", issueType: "Bug", created: "2026-05-30T00:00:00Z" }),
    makeIssue({ key: "S1", issueType: "Story", created: "2026-05-30T00:00:00Z" }),
    makeIssue({ key: "T1", issueType: "Task", created: "2026-05-30T00:00:00Z" }),
  ];
  const series = buildBugRateSeries(issues, 7, "day", now);
  const day30 = series.find((p) => p.date === "2026-05-30");
  assert.ok(day30);
  assert.equal(day30!.total, 3);
  assert.equal(day30!.bugs, 1);
  assert.ok(Math.abs(day30!.ratio - 1 / 3) < 1e-9);
});

test("buildRatioSeries honors numerator/denominator predicates and basis", () => {
  const now = new Date("2026-05-31T00:00:00Z");
  const issues: NormalizedIssue[] = [
    // resolved on 05-30: high priority bug
    makeIssue({
      key: "A",
      issueType: "Bug",
      priority: "High",
      resolved: "2026-05-30T00:00:00Z",
    }),
    // resolved on 05-30: low priority bug (in denominator "bugs", not numerator "high")
    makeIssue({
      key: "B",
      issueType: "Bug",
      priority: "Low",
      resolved: "2026-05-30T00:00:00Z",
    }),
    // resolved on 05-30: a story → excluded by denominator (issuetype=Bug)
    makeIssue({
      key: "C",
      issueType: "Story",
      priority: "High",
      resolved: "2026-05-30T00:00:00Z",
    }),
  ];
  const series = buildRatioSeries(issues, 7, "day", {
    numerator: (i) => i.priority === "High",
    denominator: (i) => i.issueType === "Bug",
    basis: "resolved",
    now,
  });
  const day = series.find((p) => p.date === "2026-05-30")!;
  assert.equal(day.denominator, 2); // two bugs
  assert.equal(day.numerator, 1); // one of them high priority
  assert.equal(day.ratio, 0.5);
});

/* ----------------------------- histogram --------------------------------- */

test("buildHistogram puts each issue in correct bin", () => {
  const issues = [
    { hours: 5 }, // bin 0
    { hours: 23 }, // bin 0
    { hours: 25 }, // bin 1
    { hours: 100 }, // bin 4
    { hours: 1000 }, // overflow
  ].map((x, i) =>
    Object.assign(
      makeIssue({
        key: `K${i}`,
        created: "2026-05-01T00:00:00Z",
        resolved: new Date(
          Date.parse("2026-05-01T00:00:00Z") + x.hours * 3_600_000,
        ).toISOString(),
      }),
      { resolutionHours: x.hours },
    ),
  );
  const hist = buildHistogram(issues, 24, 12);
  assert.equal(hist.length, 13); // 12 + overflow
  assert.equal(hist[0].count, 2);
  assert.equal(hist[1].count, 1);
  assert.equal(hist[4].count, 1);
  assert.equal(hist[12].count, 1);
  assert.equal(hist[12].toHours, null);
  assert.equal(hist[0].issues.length, 2);
});

test("buildHistogram count and issues stay in sync", () => {
  const issues = [12, 12, 12, 50].map((h, i) =>
    Object.assign(
      makeIssue({
        key: `H${i}`,
        created: "2026-05-01T00:00:00Z",
        resolved: new Date(
          Date.parse("2026-05-01T00:00:00Z") + h * 3_600_000,
        ).toISOString(),
      }),
      { resolutionHours: h },
    ),
  );
  const hist = buildHistogram(issues, 24, 12);
  for (const b of hist) {
    assert.equal(b.count, b.issues.length);
  }
});

/* ----------------------------- time series ------------------------------- */

test("buildTimeSeries buckets resolved issues into weeks", () => {
  // Monday 2026-05-04 to Sunday 2026-05-10 = week 1
  // Monday 2026-05-11 to Sunday 2026-05-17 = week 2
  const baseCreated = "2026-05-01T00:00:00Z";
  const issues = [
    { resolved: "2026-05-05T00:00:00Z", h: 96 }, // week 1
    { resolved: "2026-05-07T00:00:00Z", h: 144 }, // week 1
    { resolved: "2026-05-13T00:00:00Z", h: 288 }, // week 2
  ].map((x, i) =>
    Object.assign(
      makeIssue({
        key: `S${i}`,
        created: baseCreated,
        resolved: x.resolved,
      }),
      { resolutionHours: x.h },
    ),
  );
  // Pretend "now" is 2026-05-17 so we cover the two weeks above
  const series = buildTimeSeries(issues, 14, "week", new Date("2026-05-17T12:00:00Z"));
  const nonEmpty = series.filter((p) => p.count > 0);
  assert.equal(nonEmpty.length, 2);
  // Week 1 average: (96 + 144) / 2 = 120
  assert.equal(nonEmpty[0].avgHours, 120);
  // Week 2 average: 288
  assert.equal(nonEmpty[1].avgHours, 288);
});

test("buildTimeSeries leaves buckets without data as null", () => {
  const series = buildTimeSeries([], 30, "day", new Date("2026-05-30T00:00:00Z"));
  assert.equal(series.length, 30);
  assert.ok(series.every((p) => p.avgHours === null));
});

test("buildTimeSeries supports quarter buckets", () => {
  // 2026-Q1 = Jan/Feb/Mar; 2026-Q2 = Apr/May/Jun
  const issues = [
    { resolved: "2026-02-10T00:00:00Z", h: 100 }, // Q1
    { resolved: "2026-02-20T00:00:00Z", h: 200 }, // Q1
    { resolved: "2026-05-15T00:00:00Z", h: 400 }, // Q2
  ].map((x, i) =>
    Object.assign(
      makeIssue({
        key: `Q${i}`,
        created: "2026-01-01T00:00:00Z",
        resolved: x.resolved,
      }),
      { resolutionHours: x.h },
    ),
  );
  const series = buildTimeSeries(
    issues,
    180,
    "quarter",
    new Date("2026-06-15T00:00:00Z"),
  );
  const nonEmpty = series.filter((p) => p.count > 0);
  assert.equal(nonEmpty.length, 2);
  assert.equal(nonEmpty[0].label, "2026-Q1");
  assert.equal(nonEmpty[0].avgHours, 150);
  assert.equal(nonEmpty[1].label, "2026-Q2");
  assert.equal(nonEmpty[1].avgHours, 400);
});

/* -------------------- long-tail analysis ---------------------- */

test("flattenResolvedWithSource tags each issue with its source", () => {
  const a: ResolvedIssue = Object.assign(makeIssue({ key: "A" }), {
    resolutionHours: 10,
  });
  const b: ResolvedIssue = Object.assign(makeIssue({ key: "B" }), {
    resolutionHours: 20,
  });
  const out = flattenResolvedWithSource([
    {
      sourceId: "s1",
      sourceLabel: "Source 1",
      sourceColor: "#000",
      resolved: [a],
    },
    {
      sourceId: "s2",
      sourceLabel: "Source 2",
      sourceColor: "#fff",
      resolved: [b],
    },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].sourceLabel, "Source 1");
  assert.equal(out[1].sourceLabel, "Source 2");
});

test("dimensionBreakdown returns top-N values per facet with share", () => {
  const issues = [
    makeIssue({
      key: "A",
      assignee: { name: "Alice" },
      effectiveStatus: { label: "Done", color: "#0" },
      labels: ["payment"],
    }),
    makeIssue({
      key: "B",
      assignee: { name: "Alice" },
      effectiveStatus: { label: "Done", color: "#0" },
      labels: ["payment", "frontend"],
    }),
    makeIssue({
      key: "C",
      assignee: { name: "Bob" },
      effectiveStatus: { label: "Closed", color: "#0" },
      labels: ["frontend"],
    }),
  ];
  const bd = dimensionBreakdown(issues, 3);
  assert.equal(bd.assignee[0].value, "Alice");
  assert.equal(bd.assignee[0].count, 2);
  assert.equal(bd.assignee[0].share, 2 / 3);
  // labels: payment=2, frontend=2 — both 2/3 share
  assert.equal(bd.labels[0].count, 2);
});

test("slowFactor returns ratio vs median, fallback when median is 0", () => {
  assert.equal(slowFactor(100, 25), 4);
  assert.equal(slowFactor(0, 25), 0);
  // Degenerate set: when median is zero, slow factor falls back to 1
  assert.equal(slowFactor(100, 0), 1);
});

/* -------------------- milestone bucket mapping ---------------------- */

test("findBucketLabelForDate maps date to enclosing bucket", () => {
  const points = [
    { date: "2026-05-04", label: "05-04" }, // week 1 start
    { date: "2026-05-11", label: "05-11" }, // week 2 start
    { date: "2026-05-18", label: "05-18" }, // week 3 start
  ];
  // Date in week 2
  assert.equal(
    findBucketLabelForDate(new Date("2026-05-13T00:00:00Z"), points),
    "05-11",
  );
  // Date exactly at bucket start
  assert.equal(
    findBucketLabelForDate(new Date("2026-05-18T00:00:00Z"), points),
    "05-18",
  );
  // Before window
  assert.equal(
    findBucketLabelForDate(new Date("2026-04-30T00:00:00Z"), points),
    null,
  );
  // After window — clamps to last bucket
  assert.equal(
    findBucketLabelForDate(new Date("2026-06-15T00:00:00Z"), points),
    "05-18",
  );
});

test("findBucketLabelForDate returns null for empty series or invalid date", () => {
  assert.equal(findBucketLabelForDate(new Date(), []), null);
  assert.equal(
    findBucketLabelForDate(new Date("invalid"), [
      { date: "2026-01-01", label: "x" },
    ]),
    null,
  );
});

/* ----------------------------- facets ------------------------------------ */

test("buildFacets aggregates field counts", () => {
  const issues = [
    makeIssue({
      key: "A",
      assignee: { name: "Alice" },
      effectiveStatus: { label: "Done", color: "#0" },
      labels: ["frontend"],
    }),
    makeIssue({
      key: "B",
      assignee: { name: "Bob" },
      effectiveStatus: { label: "Done", color: "#0" },
      labels: ["frontend", "urgent"],
    }),
    makeIssue({
      key: "C",
      effectiveStatus: { label: "In Progress", color: "#0" },
      labels: ["backend"],
    }),
  ];
  const f = buildFacets(issues);
  // status: Done=2, In Progress=1
  assert.equal(f.status.find((x) => x.value === "Done")?.count, 2);
  assert.equal(f.status.find((x) => x.value === "In Progress")?.count, 1);
  // assignee: Alice=1, Bob=1, (미할당)=1
  assert.equal(f.assignee.find((x) => x.value === "(미할당)")?.count, 1);
  // labels (count by occurrence): frontend=2, urgent=1, backend=1
  assert.equal(f.labels.find((x) => x.value === "frontend")?.count, 2);
});

test("applyFacets AND across facets, OR within facet", () => {
  const issues = [
    makeIssue({
      key: "A",
      assignee: { name: "Alice" },
      effectiveStatus: { label: "Done", color: "#0" },
    }),
    makeIssue({
      key: "B",
      assignee: { name: "Bob" },
      effectiveStatus: { label: "Done", color: "#0" },
    }),
    makeIssue({
      key: "C",
      assignee: { name: "Alice" },
      effectiveStatus: { label: "Open", color: "#0" },
    }),
  ];
  // status=Done AND assignee in (Alice) → only A
  const r1 = applyFacets(issues, {
    status: ["Done"],
    assignee: ["Alice"],
  });
  assert.deepEqual(
    r1.map((x) => x.key),
    ["A"],
  );
  // assignee in (Alice, Bob) AND status=Done → A, B
  const r2 = applyFacets(issues, {
    assignee: ["Alice", "Bob"],
    status: ["Done"],
  });
  assert.deepEqual(
    r2.map((x) => x.key),
    ["A", "B"],
  );
  // No filter → all
  const r3 = applyFacets(issues, {});
  assert.equal(r3.length, 3);
});

/* ----------------------------- source stats ------------------------------ */

test("statsForSource handles empty resolved set", () => {
  const stats = statsForSource([], 5);
  assert.equal(stats.resolved, 0);
  assert.equal(stats.unresolved, 5);
  assert.equal(stats.avgHours, null);
});

test("statsForSource computes avg/median/p90", () => {
  const hours = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const resolved = hours.map((h, i) =>
    Object.assign(
      makeIssue({
        key: `R${i}`,
        created: "2026-05-01T00:00:00Z",
        resolved: new Date(
          Date.parse("2026-05-01T00:00:00Z") + h * 3_600_000,
        ).toISOString(),
      }),
      { resolutionHours: h },
    ),
  );
  const stats = statsForSource(resolved, 10);
  assert.equal(stats.avgHours, 55);
  assert.equal(stats.medianHours, 55);
  assert.equal(stats.p90Hours, 91);
});
