"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpHint, HelpRow } from "@/components/help-hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  dimensionBreakdown,
  flattenResolvedWithSource,
  formatHours,
  median as computeMedian,
  slowFactor,
  type LabeledResolvedIssue,
  type ResolvedIssue,
} from "@/lib/resolution-time";
import { formatDate, truncate } from "@/lib/utils";

type SourceBlock = {
  sourceId: string;
  sourceLabel: string;
  sourceColor: string;
  resolved: ResolvedIssue[];
};

type SortKey = "resolution" | "slowFactor" | "resolved" | "priority";

const PRESETS = [
  { label: "7일", days: 7 },
  { label: "14일", days: 14 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
];

const PAGE_SIZE = 10;

const PRIORITY_RANK: Record<string, number> = {
  Highest: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Lowest: 1,
};

/** Latest comment shape (same as NormalizedIssue.latestComment / the API). */
type LazyComment = { author?: string; body: string; created: string };

const commentKey = (i: { serverId: string; key: string }) =>
  `${i.serverId}::${i.key}`;

/** Merge a fetched comment map into the cache; requested-but-absent → null. */
function mergeFetched(
  prev: Record<string, LazyComment | null>,
  fetched: Record<string, LazyComment | null>,
  requested: Array<{ serverId: string; key: string }>,
): Record<string, LazyComment | null> {
  const next = { ...prev };
  for (const k of Object.keys(fetched)) next[k] = fetched[k];
  for (const r of requested) {
    const k = `${r.serverId}::${r.key}`;
    if (!(k in next)) next[k] = null;
  }
  return next;
}

export function LongTailTable({
  dashboardId,
  perSource,
}: {
  dashboardId: string;
  perSource: SourceBlock[];
}) {
  const storageKey = `resolution-longtail:${dashboardId}`;

  const [thresholdDays, setThresholdDays] = React.useState<number>(() => {
    if (typeof window === "undefined") return 14;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return 14;
      const parsed = JSON.parse(raw) as { thresholdDays?: number };
      return typeof parsed.thresholdDays === "number"
        ? parsed.thresholdDays
        : 14;
    } catch {
      return 14;
    }
  });
  const [sourceFilter, setSourceFilterRaw] = React.useState<string>("all");
  const [sortKey, setSortKeyRaw] = React.useState<SortKey>("slowFactor");
  const [page, setPage] = React.useState(0);

  const updateThresholdDays = React.useCallback((v: number) => {
    setThresholdDays(v);
    setPage(0);
  }, []);
  const setSourceFilter = React.useCallback((v: string) => {
    setSourceFilterRaw(v);
    setPage(0);
  }, []);
  const setSortKey = React.useCallback((v: SortKey) => {
    setSortKeyRaw(v);
    setPage(0);
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ thresholdDays }),
      );
    } catch {}
  }, [storageKey, thresholdDays]);

  const allResolved = React.useMemo(
    () => flattenResolvedWithSource(perSource),
    [perSource],
  );

  const filteredBySource = React.useMemo(() => {
    if (sourceFilter === "all") return allResolved;
    return allResolved.filter((i) => i.sourceId === sourceFilter);
  }, [allResolved, sourceFilter]);

  // Use the FULL resolved population (within the source filter, but
  // pre-threshold) for the median so the slow-factor is meaningful.
  const populationMedian = React.useMemo(
    () => computeMedian(filteredBySource.map((i) => i.resolutionHours)),
    [filteredBySource],
  );

  const thresholdHours = thresholdDays * 24;

  const slowIssues = React.useMemo(() => {
    const filtered = filteredBySource.filter(
      (i) => i.resolutionHours >= thresholdHours,
    );
    return sortIssues(filtered, sortKey, populationMedian);
  }, [filteredBySource, thresholdHours, sortKey, populationMedian]);

  const breakdown = React.useMemo(
    () => dimensionBreakdown(slowIssues, 3),
    [slowIssues],
  );

  const slowAvg = React.useMemo(() => {
    if (slowIssues.length === 0) return 0;
    const sum = slowIssues.reduce((s, i) => s + i.resolutionHours, 0);
    return sum / slowIssues.length;
  }, [slowIssues]);

  const slowShare =
    filteredBySource.length === 0
      ? 0
      : slowIssues.length / filteredBySource.length;

  const totalPages = Math.max(1, Math.ceil(slowIssues.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, slowIssues.length);
  const pagedIssues = React.useMemo(
    () => slowIssues.slice(pageStart, pageEnd),
    [slowIssues, pageStart, pageEnd],
  );

  // Comments are omitted from the bulk issue search (they're the heaviest
  // field) and fetched lazily per visible row here. `undefined` = not yet
  // fetched (spinner), `null` = fetched, none present.
  const [lazyComments, setLazyComments] = React.useState<
    Record<string, LazyComment | null>
  >({});

  const fetchComments = React.useCallback(
    async (reqs: Array<{ serverId: string; key: string }>) => {
      if (reqs.length === 0) return {} as Record<string, LazyComment | null>;
      const res = await fetch(`/api/resolution-time/${dashboardId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: reqs }),
      });
      if (!res.ok) return {} as Record<string, LazyComment | null>;
      const json = (await res.json()) as {
        comments: Record<string, LazyComment | null>;
      };
      return json.comments;
    },
    [dashboardId],
  );

  // Fetch comments for the currently visible page (signature avoids re-running
  // when unrelated state changes).
  const visibleSig = pagedIssues.map((i) => commentKey(i)).join("|");
  React.useEffect(() => {
    const missing = pagedIssues
      .filter((i) => !i.latestComment && !(commentKey(i) in lazyComments))
      .map((i) => ({ serverId: i.serverId, key: i.key }));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched = await fetchComments(missing);
      if (!cancelled) {
        setLazyComments((prev) => mergeFetched(prev, fetched, missing));
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSig, fetchComments]);

  async function copyMarkdown() {
    if (slowIssues.length === 0) {
      toast.info("복사할 이슈가 없습니다");
      return;
    }
    // Comments load lazily per visible row; make sure every slow issue's
    // comment is fetched before building the export (only the missing ones).
    let comments: Record<string, LazyComment | null> = lazyComments;
    const missing = slowIssues
      .filter((i) => !i.latestComment && !(commentKey(i) in lazyComments))
      .map((i) => ({ serverId: i.serverId, key: i.key }));
    if (missing.length > 0) {
      const toastId = toast.loading(`코멘트 ${missing.length}개 불러오는 중…`);
      try {
        const fetched = await fetchComments(missing);
        setLazyComments((prev) => mergeFetched(prev, fetched, missing));
        comments = mergeFetched(lazyComments, fetched, missing);
      } catch {}
      toast.dismiss(toastId);
    }
    const lines: string[] = [];
    lines.push(`# 슬로우 이슈 분석 (>${thresholdDays}일)`);
    lines.push("");
    lines.push(
      `- 대상: ${sourceFilter === "all" ? "전체 소스" : perSource.find((s) => s.sourceId === sourceFilter)?.sourceLabel}`,
    );
    lines.push(
      `- 이슈 수: ${slowIssues.length}개 (전체 해결의 ${(slowShare * 100).toFixed(1)}%)`,
    );
    lines.push(`- 평균 해결 시간: ${formatHours(slowAvg)}`);
    lines.push(`- 중앙값 대비 평균: ${(slowAvg / Math.max(1, populationMedian)).toFixed(1)}배`);
    lines.push("");
    lines.push("## 차원별 분포 (상위 3개)");
    lines.push("");
    const dimSection = (title: string, entries: typeof breakdown.status) => {
      if (entries.length === 0) return;
      lines.push(`**${title}**`);
      for (const e of entries) {
        lines.push(
          `- ${e.value} — ${e.count}개 (${(e.share * 100).toFixed(0)}%)`,
        );
      }
      lines.push("");
    };
    dimSection("상태", breakdown.status);
    dimSection("담당자", breakdown.assignee);
    dimSection("타입", breakdown.issueType);
    dimSection("우선순위", breakdown.priority);
    dimSection("라벨", breakdown.labels);
    lines.push("## 이슈 목록");
    lines.push("");
    lines.push(
      "| Key | 소스 | 요약 | 상태 | 담당자 | 우선순위 | 해결 시간 | 느림 배율 | 최근 코멘트 | 해결일 |",
    );
    lines.push(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const i of slowIssues) {
      const factor = slowFactor(i.resolutionHours, populationMedian);
      const raw = i.latestComment ?? comments[commentKey(i)];
      const comment = raw?.body ? truncate(stripHtml(raw.body), 80) : "";
      lines.push(
        `| [${i.key}](${i.url}) | ${i.sourceLabel} | ${escapeMd(i.summary)} | ${i.effectiveStatus.label} | ${i.assignee?.name ?? "미할당"} | ${i.priority ?? "—"} | ${formatHours(i.resolutionHours)} | ${factor.toFixed(1)}x | ${escapeMd(comment)} | ${formatDate(i.resolved)} |`,
      );
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Markdown으로 복사했습니다");
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          오래 걸린 이슈 분석
          <HelpHint title="오래 걸린 이슈 분석">
            <HelpRow label="대상:">
              이미 해결됐지만 임계값보다 오래 걸린 이슈입니다(노화 WIP와 달리
              이미 끝난 일의 사후 분석).
            </HelpRow>
            <HelpRow label="느림 배율:">
              전체 중앙값 대비 몇 배 걸렸는지입니다. 클수록 두드러진 이상치.
            </HelpRow>
            <HelpRow label="활용:">
              차원별 분포에서 특정 담당자/라벨/타입에 쏠려 있으면 그쪽이 느림의
              원인일 가능성이 큽니다.
            </HelpRow>
          </HelpHint>
          <span className="text-xs font-normal text-muted-foreground">
            {slowIssues.length}개 · 전체의{" "}
            {(slowShare * 100).toFixed(1)}%
          </span>
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={copyMarkdown}
          disabled={slowIssues.length === 0}
        >
          <Copy className="h-3.5 w-3.5" />
          Markdown 복사
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card/30 p-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              임계값 (일)
            </Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={thresholdDays}
              onChange={(e) =>
                updateThresholdDays(Math.max(1, Number(e.target.value)))
              }
              className="h-7 w-[80px] text-xs"
            />
          </div>
          <div className="flex items-end gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.days}
                type="button"
                size="sm"
                variant={thresholdDays === p.days ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => updateThresholdDays(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              <Filter className="inline h-3 w-3" /> 소스
            </Label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-7 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {perSource.map((s) => (
                  <SelectItem key={s.sourceId} value={s.sourceId}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ background: s.sourceColor }}
                      />
                      {s.sourceLabel}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              <ArrowUpDown className="inline h-3 w-3" /> 정렬
            </Label>
            <Select
              value={sortKey}
              onValueChange={(v) => setSortKey(v as SortKey)}
            >
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slowFactor">
                  느림 배율 (큰 순)
                </SelectItem>
                <SelectItem value="resolution">해결 시간 (긴 순)</SelectItem>
                <SelectItem value="resolved">해결일 (최근 순)</SelectItem>
                <SelectItem value="priority">우선순위 (높은 순)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <div className="text-[11px] text-muted-foreground">
            기준 중앙값 {formatHours(populationMedian)} · 슬로우 평균{" "}
            {formatHours(slowAvg)}
          </div>
        </div>

        {slowIssues.length === 0 ? (
          <div className="rounded-md border bg-card/30 py-8 text-center text-xs text-muted-foreground">
            임계값({thresholdDays}일)을 초과한 이슈가 없습니다. 임계값을
            낮추거나 윈도/소스를 조정해 보세요.
          </div>
        ) : (
          <>
            <BreakdownGrid breakdown={breakdown} />
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Key</th>
                    <th className="px-2 py-1.5 text-left">소스</th>
                    <th className="px-2 py-1.5 text-left">요약</th>
                    <th className="px-2 py-1.5 text-left">상태</th>
                    <th className="px-2 py-1.5 text-left">우선순위</th>
                    <th className="px-2 py-1.5 text-left">담당자</th>
                    <th className="px-2 py-1.5 text-left">라벨</th>
                    <th className="px-2 py-1.5 text-right">해결 시간</th>
                    <th className="px-2 py-1.5 text-right">느림 배율</th>
                    <th className="px-2 py-1.5 text-left">최근 코멘트</th>
                    <th className="px-2 py-1.5 text-left">해결일</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedIssues.map((i) => {
                    const factor = slowFactor(
                      i.resolutionHours,
                      populationMedian,
                    );
                    const cKey = commentKey(i);
                    const comment = i.latestComment ?? lazyComments[cKey];
                    const commentLoading = comment === undefined;
                    return (
                      <tr
                        key={`${i.serverId}::${i.key}`}
                        className="border-t hover:bg-muted/20"
                      >
                        <td className="px-2 py-1.5 align-top">
                          <a
                            href={i.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
                          >
                            {i.key}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </a>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <span className="inline-flex items-center gap-1.5 text-[11px]">
                            <span
                              className="inline-block h-2 w-2 rounded-sm"
                              style={{ background: i.sourceColor }}
                            />
                            {i.sourceLabel}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="text-xs leading-snug">
                            {i.summary}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {i.issueType ?? "—"}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <span
                            className="inline-block rounded px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: `${i.effectiveStatus.color}20`,
                              color: i.effectiveStatus.color,
                            }}
                          >
                            {i.effectiveStatus.label}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 align-top text-xs">
                          {i.priority ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 align-top text-xs">
                          {i.assignee?.name ?? "미할당"}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="flex flex-wrap gap-1">
                            {i.labels.slice(0, 3).map((l) => (
                              <span
                                key={l}
                                className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                              >
                                {l}
                              </span>
                            ))}
                            {i.labels.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{i.labels.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right align-top font-mono text-xs">
                          {formatHours(i.resolutionHours)}
                        </td>
                        <td className="px-2 py-1.5 text-right align-top font-mono text-xs">
                          <span
                            className={
                              factor >= 5
                                ? "text-destructive"
                                : factor >= 3
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                            }
                          >
                            {factor.toFixed(1)}x
                          </span>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {comment ? (
                            <div className="max-w-[280px]">
                              <div className="text-[11px] leading-snug">
                                {truncate(stripHtml(comment.body), 120)}
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {comment.author ?? "익명"}
                              </div>
                            </div>
                          ) : commentLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top text-[11px] text-muted-foreground">
                          {formatDate(i.resolved)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <div>
                총 {slowIssues.length}개 중 {pageStart + 1}–{pageEnd}개 표시
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  aria-label="이전 페이지"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  이전
                </Button>
                <span className="px-2 tabular-nums">
                  {safePage + 1} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setPage(Math.min(totalPages - 1, safePage + 1))
                  }
                  disabled={safePage >= totalPages - 1}
                  aria-label="다음 페이지"
                >
                  다음
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function sortIssues(
  arr: LabeledResolvedIssue[],
  key: SortKey,
  median: number,
): LabeledResolvedIssue[] {
  const out = [...arr];
  if (key === "slowFactor" || key === "resolution") {
    out.sort((a, b) => b.resolutionHours - a.resolutionHours);
  } else if (key === "resolved") {
    out.sort((a, b) => {
      const av = a.resolved ? Date.parse(a.resolved) : 0;
      const bv = b.resolved ? Date.parse(b.resolved) : 0;
      return bv - av;
    });
  } else if (key === "priority") {
    out.sort((a, b) => {
      const ar = PRIORITY_RANK[a.priority ?? ""] ?? 0;
      const br = PRIORITY_RANK[b.priority ?? ""] ?? 0;
      if (br !== ar) return br - ar;
      return b.resolutionHours - a.resolutionHours;
    });
  }
  // touch `median` so the parameter is used; the actual ordering by slow
  // factor is identical to ordering by resolution hours given a constant
  // median, but we keep the parameter for clarity / future extension.
  void median;
  return out;
}

function stripHtml(s: string): string {
  if (!s) return "";
  if (typeof document !== "undefined") {
    const tmp = document.createElement("div");
    tmp.innerHTML = s;
    return tmp.textContent ?? "";
  }
  return s.replace(/<[^>]*>/g, "");
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function BreakdownGrid({
  breakdown,
}: {
  breakdown: ReturnType<typeof dimensionBreakdown>;
}) {
  const sections: Array<{
    title: string;
    entries: typeof breakdown.status;
  }> = [
    { title: "라벨", entries: breakdown.labels },
    { title: "담당자", entries: breakdown.assignee },
    { title: "타입", entries: breakdown.issueType },
    { title: "우선순위", entries: breakdown.priority },
    { title: "상태", entries: breakdown.status },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {sections.map((s) => (
        <div
          key={s.title}
          className="rounded-md border bg-card/30 p-2 text-xs"
        >
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {s.title} 상위
          </div>
          {s.entries.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">—</div>
          ) : (
            <ul className="space-y-0.5">
              {s.entries.map((e) => (
                <li key={e.value} className="flex justify-between gap-2">
                  <span className="truncate" title={e.value}>
                    {e.value}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {e.count} ({(e.share * 100).toFixed(0)}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
