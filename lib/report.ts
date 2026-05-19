import type { NormalizedIssue } from "@/lib/jira/types";

export type ReportRange = {
  start: Date; // inclusive day
  end: Date; // inclusive day
};

export type ReportInput = {
  dashboardName: string;
  issues: NormalizedIssue[];
  range: ReportRange;
  includeNotes: boolean;
};

export type ReportBuckets = {
  resolved: NormalizedIssue[];
  newlyCreated: NormalizedIssue[]; // created in range AND not in resolved
  updated: NormalizedIssue[]; // updated in range AND not in resolved/created
  openAtEnd: NormalizedIssue[];
  byStatusOpen: Array<{ label: string; color: string; count: number }>;
};

function dayBounds(range: ReportRange): { startMs: number; endMs: number } {
  const start = new Date(range.start);
  start.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function tsOrNull(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function inRange(iso: string | undefined, startMs: number, endMs: number): boolean {
  const t = tsOrNull(iso);
  return t !== null && t >= startMs && t <= endMs;
}

export function bucketIssues(
  issues: NormalizedIssue[],
  range: ReportRange,
): ReportBuckets {
  const { startMs, endMs } = dayBounds(range);

  const resolved = issues.filter((i) => inRange(i.resolved, startMs, endMs));
  const resolvedKeys = new Set(resolved.map((i) => `${i.serverId}::${i.key}`));

  const newlyCreated = issues.filter(
    (i) =>
      inRange(i.created, startMs, endMs) &&
      !resolvedKeys.has(`${i.serverId}::${i.key}`),
  );
  const newKeys = new Set(newlyCreated.map((i) => `${i.serverId}::${i.key}`));

  const updated = issues.filter((i) => {
    const k = `${i.serverId}::${i.key}`;
    if (resolvedKeys.has(k) || newKeys.has(k)) return false;
    return inRange(i.updated, startMs, endMs);
  });

  const openAtEnd = issues.filter((i) => {
    const c = tsOrNull(i.created);
    if (c === null || c > endMs) return false;
    const r = tsOrNull(i.resolved);
    return r === null || r > endMs;
  });

  const byStatusMap = new Map<string, { label: string; color: string; count: number }>();
  for (const i of openAtEnd) {
    const key = i.effectiveStatus.label;
    const existing = byStatusMap.get(key);
    if (existing) existing.count += 1;
    else
      byStatusMap.set(key, {
        label: i.effectiveStatus.label,
        color: i.effectiveStatus.color,
        count: 1,
      });
  }
  const byStatusOpen = Array.from(byStatusMap.values()).sort(
    (a, b) => b.count - a.count,
  );

  return { resolved, newlyCreated, updated, openAtEnd, byStatusOpen };
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function escapeCell(s: string): string {
  if (!s) return "";
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " / ");
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function issueRow(
  i: NormalizedIssue,
  cols: Array<"key" | "status" | "summary" | "assignee" | "date" | "note">,
  dateField: "resolved" | "created" | "updated",
  includeNotes: boolean,
): string {
  const cells = cols
    .filter((c) => (c === "note" ? includeNotes : true))
    .map((c) => {
      switch (c) {
        case "key":
          return `[${i.key}](${i.url})`;
        case "status":
          return escapeCell(i.effectiveStatus.label);
        case "summary":
          return escapeCell(truncate(i.summary, 80));
        case "assignee":
          return escapeCell(i.assignee?.name ?? "—");
        case "date": {
          const v = i[dateField];
          return v ? fmtDate(new Date(v)) : "—";
        }
        case "note":
          return escapeCell(truncate(i.note ?? "", 120));
      }
    });
  return `| ${cells.join(" | ")} |`;
}

function tableHeader(
  labels: string[],
  includeNotes: boolean,
): { head: string; sep: string } {
  const filtered = labels.filter((l) => (l === "노트" ? includeNotes : true));
  return {
    head: `| ${filtered.join(" | ")} |`,
    sep: `| ${filtered.map(() => "---").join(" | ")} |`,
  };
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Render a self-contained Markdown report of activity within the given range.
 * The output is intentionally clipboard-friendly: stable, no emoji, no embedded
 * HTML, and human-skimmable.
 */
export function buildReport(input: ReportInput): string {
  const { dashboardName, issues, range, includeNotes } = input;
  const buckets = bucketIssues(issues, range);
  const days = daysBetween(range.start, range.end);

  const lines: string[] = [];
  lines.push(`# 보고서: ${fmtDate(range.start)} ~ ${fmtDate(range.end)}`);
  lines.push("");
  lines.push(
    `> 대시보드: **${escapeCell(dashboardName)}** · 기간 ${days}일 · 작성 ${fmtDate(new Date())}`,
  );
  lines.push("");

  // Summary — count anything created in-range (including those also resolved)
  const { startMs, endMs } = dayBounds(range);
  const createdInRange = issues.filter((i) =>
    inRange(i.created, startMs, endMs),
  ).length;
  lines.push("## 요약");
  lines.push(`- 기간 내 신규 생성: **${createdInRange}건**`);
  lines.push(`- 기간 내 해결: **${buckets.resolved.length}건**`);
  lines.push(`- 기간 내 기타 업데이트: ${buckets.updated.length}건`);
  lines.push(`- 기간 종료 시점 미해결 잔량: **${buckets.openAtEnd.length}건**`);
  lines.push("");

  if (buckets.byStatusOpen.length > 0) {
    lines.push("### 미해결 잔량 — 상태별");
    for (const s of buckets.byStatusOpen) {
      lines.push(`- ${s.label}: ${s.count}건`);
    }
    lines.push("");
  }

  // Resolved
  if (buckets.resolved.length > 0) {
    lines.push(`## 해결 완료 (${buckets.resolved.length}건)`);
    const { head, sep } = tableHeader(
      ["Key", "상태", "Summary", "담당자", "해결일", "노트"],
      includeNotes,
    );
    lines.push(head);
    lines.push(sep);
    for (const i of buckets.resolved) {
      lines.push(
        issueRow(
          i,
          ["key", "status", "summary", "assignee", "date", "note"],
          "resolved",
          includeNotes,
        ),
      );
    }
    lines.push("");
  }

  // Newly created (still open)
  if (buckets.newlyCreated.length > 0) {
    lines.push(`## 신규 (진행 중, ${buckets.newlyCreated.length}건)`);
    const { head, sep } = tableHeader(
      ["Key", "상태", "Summary", "담당자", "생성일", "노트"],
      includeNotes,
    );
    lines.push(head);
    lines.push(sep);
    for (const i of buckets.newlyCreated) {
      lines.push(
        issueRow(
          i,
          ["key", "status", "summary", "assignee", "date", "note"],
          "created",
          includeNotes,
        ),
      );
    }
    lines.push("");
  }

  // Other updates
  if (buckets.updated.length > 0) {
    lines.push(`## 기타 진행 변경 (${buckets.updated.length}건)`);
    const { head, sep } = tableHeader(
      ["Key", "상태", "Summary", "담당자", "수정일", "노트"],
      includeNotes,
    );
    lines.push(head);
    lines.push(sep);
    for (const i of buckets.updated) {
      lines.push(
        issueRow(
          i,
          ["key", "status", "summary", "assignee", "date", "note"],
          "updated",
          includeNotes,
        ),
      );
    }
    lines.push("");
  }

  if (
    buckets.resolved.length === 0 &&
    buckets.newlyCreated.length === 0 &&
    buckets.updated.length === 0
  ) {
    lines.push("> 이 기간 동안 활동이 없습니다.");
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "*생성: jira-collector. 해결일은 `resolutiondate` 우선, 없으면 status가 Done 카테고리일 때 `updated` 를 사용합니다.*",
  );

  return lines.join("\n");
}
