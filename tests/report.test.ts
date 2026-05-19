import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, bucketIssues } from "@/lib/report";
import type { NormalizedIssue } from "@/lib/jira/types";

function issue(over: Partial<NormalizedIssue> & { key: string }): NormalizedIssue {
  return {
    serverId: "s1",
    serverName: "Test",
    key: over.key,
    url: `https://example.atlassian.net/browse/${over.key}`,
    summary: over.summary ?? "summary",
    rawStatus: over.rawStatus ?? "To Do",
    effectiveStatus: over.effectiveStatus ?? { label: "To Do", color: "#94A3B8" },
    labels: [],
    ...over,
  };
}

const RANGE = {
  start: new Date("2026-05-12T00:00:00.000Z"),
  end: new Date("2026-05-19T00:00:00.000Z"),
};

test("resolved-in-range goes to resolved bucket and is excluded from others", () => {
  const issues = [
    issue({
      key: "P-1",
      created: "2026-05-10T08:00:00.000Z",
      updated: "2026-05-15T10:00:00.000Z",
      resolved: "2026-05-15T10:00:00.000Z",
    }),
  ];
  const b = bucketIssues(issues, RANGE);
  assert.equal(b.resolved.length, 1);
  assert.equal(b.newlyCreated.length, 0);
  assert.equal(b.updated.length, 0);
});

test("created-in-range without resolution goes to newlyCreated", () => {
  const issues = [
    issue({
      key: "P-2",
      created: "2026-05-13T08:00:00.000Z",
      updated: "2026-05-13T08:00:00.000Z",
    }),
  ];
  const b = bucketIssues(issues, RANGE);
  assert.equal(b.newlyCreated.length, 1);
  assert.equal(b.resolved.length, 0);
  assert.equal(b.updated.length, 0);
});

test("updated-only-in-range goes to updated bucket", () => {
  const issues = [
    issue({
      key: "P-3",
      created: "2026-04-01T08:00:00.000Z",
      updated: "2026-05-14T08:00:00.000Z",
    }),
  ];
  const b = bucketIssues(issues, RANGE);
  assert.equal(b.updated.length, 1);
  assert.equal(b.resolved.length, 0);
  assert.equal(b.newlyCreated.length, 0);
});

test("created AND resolved in range only appears in resolved", () => {
  const issues = [
    issue({
      key: "P-4",
      created: "2026-05-13T08:00:00.000Z",
      updated: "2026-05-14T08:00:00.000Z",
      resolved: "2026-05-14T08:00:00.000Z",
    }),
  ];
  const b = bucketIssues(issues, RANGE);
  assert.equal(b.resolved.length, 1);
  assert.equal(b.newlyCreated.length, 0);
  assert.equal(b.updated.length, 0);
});

test("openAtEnd counts issues created on or before end and unresolved at end", () => {
  const issues = [
    // Open throughout
    issue({ key: "O-1", created: "2026-05-01T00:00:00.000Z" }),
    // Resolved before range end
    issue({
      key: "O-2",
      created: "2026-05-01T00:00:00.000Z",
      resolved: "2026-05-15T10:00:00.000Z",
    }),
    // Created after range end → shouldn't count
    issue({ key: "O-3", created: "2026-06-01T00:00:00.000Z" }),
  ];
  const b = bucketIssues(issues, RANGE);
  assert.equal(b.openAtEnd.length, 1);
  assert.equal(b.openAtEnd[0].key, "O-1");
});

test("byStatusOpen groups counts by effective status with deterministic order", () => {
  const issues = [
    issue({
      key: "S-1",
      created: "2026-05-01T00:00:00.000Z",
      effectiveStatus: { label: "In Progress", color: "#3B82F6" },
    }),
    issue({
      key: "S-2",
      created: "2026-05-01T00:00:00.000Z",
      effectiveStatus: { label: "In Progress", color: "#3B82F6" },
    }),
    issue({
      key: "S-3",
      created: "2026-05-01T00:00:00.000Z",
      effectiveStatus: { label: "To Do", color: "#94A3B8" },
    }),
  ];
  const b = bucketIssues(issues, RANGE);
  assert.deepEqual(
    b.byStatusOpen.map((s) => [s.label, s.count]),
    [
      ["In Progress", 2],
      ["To Do", 1],
    ],
  );
});

test("buildReport produces a section per non-empty bucket and includes counts", () => {
  const issues = [
    issue({
      key: "P-1",
      summary: "Resolved one",
      created: "2026-05-10T08:00:00.000Z",
      resolved: "2026-05-15T10:00:00.000Z",
      updated: "2026-05-15T10:00:00.000Z",
    }),
    issue({
      key: "P-2",
      summary: "New one",
      created: "2026-05-13T08:00:00.000Z",
      updated: "2026-05-13T08:00:00.000Z",
    }),
    issue({
      key: "P-3",
      summary: "Just moved",
      created: "2026-04-01T00:00:00.000Z",
      updated: "2026-05-14T08:00:00.000Z",
    }),
  ];
  const md = buildReport({
    dashboardName: "Test Dash",
    issues,
    range: RANGE,
    includeNotes: false,
  });
  assert.match(md, /^# 보고서: 2026-05-12 ~ 2026-05-19/m);
  assert.match(md, /해결 완료 \(1건\)/);
  assert.match(md, /신규 \(진행 중, 1건\)/);
  assert.match(md, /기타 진행 변경 \(1건\)/);
  assert.match(md, /Resolved one/);
  assert.match(md, /New one/);
  assert.match(md, /Just moved/);
  // Note column header must NOT appear when includeNotes=false
  assert.doesNotMatch(md, /\| 노트 \|/);
});

test("buildReport includes a note column only when includeNotes=true", () => {
  const issues = [
    issue({
      key: "P-1",
      created: "2026-05-13T08:00:00.000Z",
      updated: "2026-05-13T08:00:00.000Z",
      note: "내부 메모입니다",
    }),
  ];
  const md = buildReport({
    dashboardName: "D",
    issues,
    range: RANGE,
    includeNotes: true,
  });
  assert.match(md, /\| 노트 \|/);
  assert.match(md, /내부 메모입니다/);
});

test("buildReport renders an explicit empty-activity notice", () => {
  const md = buildReport({
    dashboardName: "D",
    issues: [],
    range: RANGE,
    includeNotes: false,
  });
  assert.match(md, /이 기간 동안 활동이 없습니다/);
});

test("table cell escapes pipe and newline characters in summaries and notes", () => {
  const issues = [
    issue({
      key: "P-1",
      summary: "Summary with | pipe and\nnewline",
      created: "2026-05-13T08:00:00.000Z",
      updated: "2026-05-13T08:00:00.000Z",
      note: "Note with | pipe\nsecond line",
    }),
  ];
  const md = buildReport({
    dashboardName: "D",
    issues,
    range: RANGE,
    includeNotes: true,
  });
  assert.match(md, /Summary with \\\| pipe and \/ newline/);
  assert.match(md, /Note with \\\| pipe \/ second line/);
});
