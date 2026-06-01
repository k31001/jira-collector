"use client";

import * as React from "react";
import { ArrowDown, ArrowRight, ArrowUp, GitCompare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatHours,
  partitionResolvedByPeriod,
  statsForSource,
  type ResolvedIssue,
} from "@/lib/resolution-time";

type SourceBlock = {
  sourceId: string;
  label: string;
  color: string;
  resolved: ResolvedIssue[];
};

/**
 * "This period vs last period" comparison. For each source we split resolved
 * issues into the current window and the preceding window of equal length and
 * show the delta for throughput and cycle-time percentiles — the core numbers
 * a retro asks about ("did we get faster or slower than last sprint?").
 */
export function PeriodComparisonCard({
  perSource,
  windowDays,
}: {
  perSource: SourceBlock[];
  windowDays: number;
}) {
  const rows = React.useMemo(
    () =>
      perSource.map((s) => {
        const { current, previous } = partitionResolvedByPeriod(
          s.resolved,
          windowDays,
        );
        return {
          ...s,
          cur: statsForSource(current, current.length),
          prev: statsForSource(previous, previous.length),
          curCount: current.length,
          prevCount: previous.length,
        };
      }),
    [perSource, windowDays],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <GitCompare className="mr-1 inline h-3.5 w-3.5" />
          기간 비교
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            최근 {windowDays}일 vs 직전 {windowDays}일
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            표시할 소스가 없습니다.
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.sourceId}
              className="space-y-2 rounded-md border bg-card/30 p-3"
            >
              <div className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: r.color }}
                />
                <span className="font-medium">{r.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric
                  label="처리량"
                  current={`${r.curCount}개`}
                  curNum={r.curCount}
                  // No previous-period issues → no meaningful baseline, so
                  // treat it as "no data" rather than a +N jump from zero.
                  prevNum={r.prevCount === 0 ? null : r.prevCount}
                  higherIsBetter
                  formatDelta={(d) => `${d > 0 ? "+" : ""}${d}개`}
                />
                <Metric
                  label="평균"
                  current={formatHours(r.cur.avgHours)}
                  curNum={r.cur.avgHours}
                  prevNum={r.prev.avgHours}
                  higherIsBetter={false}
                  formatDelta={(d) => `${d > 0 ? "+" : ""}${formatHours(Math.abs(d))}`}
                />
                <Metric
                  label="중앙값"
                  current={formatHours(r.cur.medianHours)}
                  curNum={r.cur.medianHours}
                  prevNum={r.prev.medianHours}
                  higherIsBetter={false}
                  formatDelta={(d) => `${d > 0 ? "+" : ""}${formatHours(Math.abs(d))}`}
                />
                <Metric
                  label="P90"
                  current={formatHours(r.cur.p90Hours)}
                  curNum={r.cur.p90Hours}
                  prevNum={r.prev.p90Hours}
                  higherIsBetter={false}
                  formatDelta={(d) => `${d > 0 ? "+" : ""}${formatHours(Math.abs(d))}`}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  current,
  curNum,
  prevNum,
  higherIsBetter,
  formatDelta,
}: {
  label: string;
  current: string;
  curNum: number | null;
  prevNum: number | null;
  higherIsBetter: boolean;
  formatDelta: (delta: number) => string;
}) {
  const hasBoth = curNum !== null && prevNum !== null;
  const delta = hasBoth ? (curNum as number) - (prevNum as number) : 0;
  const flat = Math.abs(delta) < 1e-9;
  // "good" = improvement → green; "bad" = regression → red.
  const good = higherIsBetter ? delta > 0 : delta < 0;

  let color = "text-muted-foreground";
  let Icon = ArrowRight;
  if (hasBoth && !flat) {
    color = good
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";
    Icon = delta > 0 ? ArrowUp : ArrowDown;
  }

  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm tabular-nums">{current}</div>
      <div className={`flex items-center gap-0.5 text-[11px] ${color}`}>
        {hasBoth ? (
          flat ? (
            <span className="text-muted-foreground">변화 없음</span>
          ) : (
            <>
              <Icon className="h-3 w-3" />
              {formatDelta(delta)}
            </>
          )
        ) : (
          <span className="text-muted-foreground">직전 데이터 없음</span>
        )}
      </div>
    </div>
  );
}
