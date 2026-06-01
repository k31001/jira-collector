"use client";

import * as React from "react";
import { Loader2, Timer, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatHours } from "@/lib/resolution-time";
import { formatRelative } from "@/lib/utils";
import type { DashboardDwellResult } from "@/lib/jira/fetch-dwell";

/**
 * Opt-in status dwell-time analysis. This is intentionally NOT auto-loaded:
 * it costs one Jira changelog request per issue, so the user triggers it
 * explicitly. Results are aggregated server-side and cached for 60s.
 */
export function StatusDwellCard({
  dashboardId,
  visibleSourceIds,
}: {
  dashboardId: string;
  visibleSourceIds: string[];
}) {
  const [state, setState] = React.useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [data, setData] = React.useState<DashboardDwellResult | null>(null);
  const [error, setError] = React.useState<string>("");

  const visible = React.useMemo(
    () => new Set(visibleSourceIds),
    [visibleSourceIds],
  );

  const run = React.useCallback(
    async (bypass = false) => {
      setState("loading");
      setError("");
      try {
        const res = await fetch(
          `/api/resolution-time/${dashboardId}/dwell${bypass ? "?bypass=1" : ""}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("체류 시간 분석 요청 실패");
        const json = (await res.json()) as DashboardDwellResult;
        setData(json);
        setState("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "분석 실패");
        setState("error");
      }
    },
    [dashboardId],
  );

  const sources = (data?.sources ?? []).filter((s) => visible.has(s.sourceId));

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">
          <Timer className="mr-1 inline h-3.5 w-3.5" />
          상태별 체류 시간
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            이슈가 각 상태에 머문 평균 시간
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {state === "done" && data?.fetchedAt && (
            <span className="text-[11px] text-muted-foreground">
              {formatRelative(data.fetchedAt)}
            </span>
          )}
          {state === "done" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => run(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {state === "idle" && (
          <div className="space-y-3 rounded-md border bg-card/30 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              각 이슈의 변경 이력(changelog)을 조회해 상태별 평균 체류 시간을
              계산합니다. 이슈마다 요청이 한 번씩 발생하므로 별도 실행 버튼으로
              제공됩니다.
            </p>
            <Button size="sm" onClick={() => run(false)}>
              <Timer className="h-4 w-4" />
              체류 시간 분석 실행
            </Button>
          </div>
        )}
        {state === "loading" && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            변경 이력 분석 중… (이슈가 많으면 다소 걸릴 수 있습니다)
          </div>
        )}
        {state === "error" && (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={() => run(true)}>
              다시 시도
            </Button>
          </div>
        )}
        {state === "done" && (
          <div className="space-y-4">
            {sources.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                표시할 소스가 없습니다.
              </div>
            ) : (
              sources.map((s) => (
                <DwellSourceBlock key={s.sourceId} source={s} />
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DwellSourceBlock({
  source,
}: {
  source: DashboardDwellResult["sources"][number];
}) {
  const maxAvg = Math.max(1, ...source.statuses.map((st) => st.avgHours));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ background: source.color }}
        />
        <span className="font-medium">{source.label}</span>
        <span className="text-muted-foreground">
          {source.error
            ? `오류: ${source.error}`
            : `${source.issueCount}개 이슈 분석${source.truncated ? ` (상위 ${source.issueCount}개로 샘플링)` : ""}`}
        </span>
      </div>
      {source.error ? null : source.statuses.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          전이 이력이 없습니다.
        </div>
      ) : (
        <div className="space-y-1">
          {source.statuses.map((st) => (
            <div key={st.status} className="flex items-center gap-2">
              <span className="w-[100px] shrink-0 truncate text-[11px]" title={st.status}>
                {st.status}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-muted/40">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.max(2, (st.avgHours / maxAvg) * 100)}%`,
                    background: source.color,
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="w-[64px] shrink-0 text-right font-mono text-[11px]">
                {formatHours(st.avgHours)}
              </span>
              <span className="w-[40px] shrink-0 text-right text-[10px] text-muted-foreground">
                ×{st.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
