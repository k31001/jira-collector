"use client";

import * as React from "react";
import { ArrowUpDown, Copy, ExternalLink, Filter } from "lucide-react";
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

const PRIORITY_RANK: Record<string, number> = {
  Highest: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Lowest: 1,
};

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
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("slowFactor");

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

  function copyMarkdown() {
    if (slowIssues.length === 0) {
      toast.info("복사할 이슈가 없습니다");
      return;
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
      const comment = i.latestComment?.body
        ? truncate(stripHtml(i.latestComment.body), 80)
        : "";
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
        <CardTitle className="text-sm">
          오래 걸린 이슈 분석
          <span className="ml-2 text-xs font-normal text-muted-foreground">
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
                setThresholdDays(Math.max(1, Number(e.target.value)))
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
                onClick={() => setThresholdDays(p.days)}
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
                  {slowIssues.map((i) => {
                    const factor = slowFactor(
                      i.resolutionHours,
                      populationMedian,
                    );
                    const comment = i.latestComment;
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
