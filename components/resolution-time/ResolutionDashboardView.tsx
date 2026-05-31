"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateResolutionDashboard } from "@/actions/resolution-dashboards";
import {
  applyFacets,
  buildFacets,
  buildHistogram,
  buildTimeSeries,
  statsForSource,
  withResolutionHours,
  type FacetSelection,
  type ResolvedIssue,
  type TimeBucket,
} from "@/lib/resolution-time";
import type {
  ResolutionDashboardIssuesResult,
  ResolutionSourceResult,
} from "@/lib/jira/fetch-resolution";
import { formatRelative } from "@/lib/utils";
import { SmartFilters } from "./SmartFilters";
import { SummaryCards, type SummaryItem } from "./SummaryCards";
import {
  TimeSeriesChart,
  type MilestoneMark,
  type Series,
} from "./TimeSeriesChart";
import {
  HistogramChart,
  type SourceHistogram,
} from "./HistogramChart";
import {
  IssueListDialog,
  type IssueListSelection,
} from "./IssueListDialog";
import { LongTailTable } from "./LongTailTable";

type Props = {
  dashboardId: string;
  refreshIntervalSec: number;
  initialWindowDays: number;
  initialTimeBucket: TimeBucket;
  initialHistogramBucketHours: number;
};

const WINDOW_OPTIONS = [
  { value: 30, label: "최근 30일" },
  { value: 60, label: "최근 60일" },
  { value: 90, label: "최근 90일" },
  { value: 180, label: "최근 180일" },
  { value: 365, label: "최근 1년" },
];

const FILTERS_STORAGE_KEY = (id: string) => `resolution-time-filters:${id}`;

function loadFilters(id: string): Record<string, FacetSelection> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY(id));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FacetSelection>;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function ResolutionDashboardView({
  dashboardId,
  refreshIntervalSec,
  initialWindowDays,
  initialTimeBucket,
  initialHistogramBucketHours,
}: Props) {
  const [windowDays, setWindowDays] = React.useState(initialWindowDays);
  const [timeBucket, setTimeBucket] =
    React.useState<TimeBucket>(initialTimeBucket);
  const [histogramBucketHours, setHistogramBucketHours] = React.useState(
    initialHistogramBucketHours,
  );

  const [filters, setFilters] = React.useState<Record<string, FacetSelection>>(
    () => loadFilters(dashboardId),
  );

  const [selection, setSelection] = React.useState<IssueListSelection | null>(
    null,
  );

  // Persist filters to localStorage
  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        FILTERS_STORAGE_KEY(dashboardId),
        JSON.stringify(filters),
      );
    } catch {}
  }, [dashboardId, filters]);

  // Persist dashboard-level config to DB (debounced)
  React.useEffect(() => {
    if (
      windowDays === initialWindowDays &&
      timeBucket === initialTimeBucket &&
      histogramBucketHours === initialHistogramBucketHours
    ) {
      return;
    }
    const t = setTimeout(() => {
      updateResolutionDashboard(dashboardId, {
        windowDays,
        timeBucket,
        histogramBucketHours,
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays, timeBucket, histogramBucketHours, dashboardId]);

  const query = useQuery<ResolutionDashboardIssuesResult>({
    queryKey: ["resolution-issues", dashboardId],
    queryFn: async () => {
      const res = await fetch(`/api/resolution-time/${dashboardId}/issues`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("이슈 fetch 실패");
      return (await res.json()) as ResolutionDashboardIssuesResult;
    },
    refetchInterval: refreshIntervalSec > 0 ? refreshIntervalSec * 1000 : false,
    staleTime: refreshIntervalSec * 1000,
  });

  React.useEffect(() => {
    const errs = query.data?.sources?.filter((s) => s.error) ?? [];
    for (const e of errs.slice(0, 3)) {
      toast.error(`${e.label}: ${e.error}`);
    }
  }, [query.data]);

  const sources = React.useMemo(
    () => query.data?.sources ?? [],
    [query.data?.sources],
  );

  // Apply per-source smart filters, then compute resolution stats
  const perSource = React.useMemo(() => {
    return sources.map((s) => {
      const filtered = applyFacets(s.issues, filters[s.sourceId] ?? {});
      const resolved = withResolutionHours(filtered);
      return {
        source: s,
        filteredIssues: filtered,
        resolved,
      };
    });
  }, [sources, filters]);

  const summary: SummaryItem[] = React.useMemo(
    () =>
      perSource.map((ps) => ({
        sourceId: ps.source.sourceId,
        label: ps.source.label,
        color: ps.source.color,
        stats: statsForSource(ps.resolved, ps.filteredIssues.length),
      })),
    [perSource],
  );

  const series: Series[] = React.useMemo(
    () =>
      perSource.map((ps) => ({
        sourceId: ps.source.sourceId,
        label: ps.source.label,
        color: ps.source.color,
        points: buildTimeSeries(ps.resolved, windowDays, timeBucket),
      })),
    [perSource, windowDays, timeBucket],
  );

  const milestoneMarks: MilestoneMark[] = React.useMemo(
    () =>
      sources.flatMap((s) =>
        (s.milestones ?? []).map((m) => ({
          sourceId: s.sourceId,
          sourceLabel: s.label,
          color: s.color,
          name: m.name,
          date: m.date,
        })),
      ),
    [sources],
  );

  const histograms: SourceHistogram[] = React.useMemo(
    () =>
      perSource.map((ps) => ({
        sourceId: ps.source.sourceId,
        label: ps.source.label,
        color: ps.source.color,
        bins: buildHistogram(ps.resolved, histogramBucketHours, 12),
      })),
    [perSource, histogramBucketHours],
  );

  function onBinSelected(info: {
    sourceLabel: string;
    binLabel: string;
    issues: ResolvedIssue[];
  }) {
    setSelection({
      sourceLabel: info.sourceLabel,
      binLabel: info.binLabel,
      issues: info.issues,
    });
  }

  function patchFilter(sourceId: string, next: FacetSelection) {
    setFilters((prev) => ({ ...prev, [sourceId]: next }));
  }

  return (
    <div className="flex-1 space-y-4 p-6">
      <IssueListDialog
        open={selection !== null}
        onOpenChange={(o) => !o && setSelection(null)}
        selection={selection}
      />

      <ControlsBar
        windowDays={windowDays}
        timeBucket={timeBucket}
        histogramBucketHours={histogramBucketHours}
        onWindowDaysChange={setWindowDays}
        onTimeBucketChange={setTimeBucket}
        onHistogramBucketHoursChange={setHistogramBucketHours}
        isFetching={query.isFetching}
        fetchedAt={query.data?.fetchedAt}
        onRefresh={() => query.refetch()}
      />

      {query.isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {(query.error as Error).message}
          </CardContent>
        </Card>
      ) : query.isLoading ? (
        <Card>
          <CardContent className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 이슈 불러오는 중…
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryCards items={summary} />

          {perSource.some((p) => p.source.error) && (
            <Card className="border-destructive/50">
              <CardContent className="space-y-1 py-3">
                {perSource
                  .filter((p) => p.source.error)
                  .map((p) => (
                    <div
                      key={p.source.sourceId}
                      className="flex items-center gap-2 text-xs text-destructive"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span className="font-medium">{p.source.label}:</span>
                      <span className="truncate">{p.source.error}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {sources.length > 0 && (
            <PerSourceFilters
              sources={sources}
              filters={filters}
              onFilterChange={patchFilter}
            />
          )}

          <TimeSeriesChart
            series={series}
            bucket={timeBucket}
            milestones={milestoneMarks}
          />
          <HistogramChart
            histograms={histograms}
            onBinSelected={onBinSelected}
          />
          <LongTailTable
            dashboardId={dashboardId}
            perSource={perSource.map((ps) => ({
              sourceId: ps.source.sourceId,
              sourceLabel: ps.source.label,
              sourceColor: ps.source.color,
              resolved: ps.resolved,
            }))}
          />
        </>
      )}
    </div>
  );
}

function ControlsBar({
  windowDays,
  timeBucket,
  histogramBucketHours,
  onWindowDaysChange,
  onTimeBucketChange,
  onHistogramBucketHoursChange,
  isFetching,
  fetchedAt,
  onRefresh,
}: {
  windowDays: number;
  timeBucket: TimeBucket;
  histogramBucketHours: number;
  onWindowDaysChange: (v: number) => void;
  onTimeBucketChange: (v: TimeBucket) => void;
  onHistogramBucketHoursChange: (v: number) => void;
  isFetching: boolean;
  fetchedAt: number | undefined;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card/30 p-3">
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">윈도</Label>
        <Select
          value={String(windowDays)}
          onValueChange={(v) => onWindowDaysChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">단위</Label>
        <Select
          value={timeBucket}
          onValueChange={(v) => onTimeBucketChange(v as TimeBucket)}
        >
          <SelectTrigger className="h-7 w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">일</SelectItem>
            <SelectItem value="week">주</SelectItem>
            <SelectItem value="month">월</SelectItem>
            <SelectItem value="quarter">분기</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">
          히스토그램 버킷(시간)
        </Label>
        <Input
          type="number"
          min={1}
          max={720}
          value={histogramBucketHours}
          onChange={(e) =>
            onHistogramBucketHoursChange(Math.max(1, Number(e.target.value)))
          }
          className="h-7 w-[100px] text-xs"
        />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isFetching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : fetchedAt ? (
          <span>마지막 갱신 {formatRelative(fetchedAt)}</span>
        ) : null}
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw className="h-3.5 w-3.5" />
        새로고침
      </Button>
    </div>
  );
}

function PerSourceFilters({
  sources,
  filters,
  onFilterChange,
}: {
  sources: ResolutionSourceResult[];
  filters: Record<string, FacetSelection>;
  onFilterChange: (sourceId: string, next: FacetSelection) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        {sources.map((s) => {
          if (s.issues.length === 0) return null;
          const facets = buildFacets(s.issues);
          const value = filters[s.sourceId] ?? {};
          return (
            <div
              key={s.sourceId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b py-1.5 last:border-b-0 last:pb-0"
            >
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: s.color }}
                />
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground">
                  ({s.issues.length}개)
                </span>
              </span>
              <SmartFilters
                facets={facets}
                value={value}
                onChange={(next) => onFilterChange(s.sourceId, next)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
