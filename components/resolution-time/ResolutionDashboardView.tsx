"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Filter,
  Loader2,
  RefreshCw,
} from "lucide-react";
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
  applyCustomFacets,
  applyFacets,
  buildFacets,
  buildHistogram,
  buildTimeSeries,
  buildUnresolvedTimeSeries,
  statsForSource,
  withAging,
  withResolutionHours,
  type CustomFacetForFilter,
  type CustomFacetSelection,
  type FacetSelection,
  type ResolvedIssue,
  type TimeBucket,
} from "@/lib/resolution-time";
import { tryCompileJql } from "@/lib/jql-eval";
import type { CustomFacetWithValues, RatioConfigDef } from "@/lib/db/queries";
import type {
  ResolutionDashboardIssuesResult,
  ResolutionPlanItem,
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
import { UnresolvedTrendChart } from "./UnresolvedTrendChart";
import { ThroughputTrendChart } from "./ThroughputTrendChart";
import {
  RatioAnalysisChart,
  type CompiledRatioConfig,
} from "./RatioAnalysisChart";
import {
  HistogramChart,
  type SourceHistogram,
} from "./HistogramChart";
import { LoadProgress, type LoadProgressState } from "./LoadProgress";
import {
  IssueListDialog,
  type IssueListSelection,
} from "./IssueListDialog";
import { LongTailTable } from "./LongTailTable";
import { AgingWipTable } from "./AgingWipTable";
import { StatusDwellCard } from "./StatusDwellCard";
import { PeriodComparisonCard } from "./PeriodComparisonCard";

type Props = {
  dashboardId: string;
  refreshIntervalSec: number;
  initialWindowDays: number;
  initialTimeBucket: TimeBucket;
  initialHistogramBucketHours: number;
  customFacets: CustomFacetWithValues[];
  ratioConfigs: RatioConfigDef[];
};

/** NDJSON events streamed by the issues route while a cold load runs. */
type StreamEvent =
  | { type: "plan"; planned: number; perSource: ResolutionPlanItem[] }
  | { type: "progress"; fetched: number }
  | { type: "source"; index: number; data: ResolutionSourceResult }
  | { type: "result"; data: ResolutionDashboardIssuesResult }
  | { type: "error"; message: string };

const WINDOW_OPTIONS = [
  { value: 30, label: "최근 30일" },
  { value: 60, label: "최근 60일" },
  { value: 90, label: "최근 90일" },
  { value: 180, label: "최근 180일" },
  { value: 365, label: "최근 1년" },
];

const FILTERS_STORAGE_KEY = (id: string) => `resolution-time-filters:${id}`;
const CUSTOM_FILTERS_STORAGE_KEY = (id: string) =>
  `resolution-time-custom-filters:${id}`;

function loadCustomFilters(id: string): Record<string, CustomFacetSelection> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_FILTERS_STORAGE_KEY(id));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CustomFacetSelection>;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}
const FILTERS_EXPANDED_KEY = (id: string) =>
  `resolution-time:filters-expanded:${id}`;

function loadFiltersExpanded(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FILTERS_EXPANDED_KEY(id)) === "1";
  } catch {
    return false;
  }
}

const VISIBLE_JQLS_KEY = (id: string) =>
  `resolution-time:visible-jqls:${id}`;

function loadVisibleJqls(id: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(VISIBLE_JQLS_KEY(id));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, boolean>;
    }
    return {};
  } catch {
    return {};
  }
}

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
  customFacets: rawCustomFacets,
  ratioConfigs,
}: Props) {
  // Compile each ratio config's JQL once. A failed numerator matches nothing
  // (ratio 0); an empty denominator means "all issues"; a present-but-invalid
  // denominator falls back to "all" — though the settings form validates JQL
  // on save, so that's a defensive fallback.
  const compiledRatios = React.useMemo<CompiledRatioConfig[]>(
    () =>
      ratioConfigs.map((c) => {
        const num = tryCompileJql(c.numeratorJql);
        const denTrim = c.denominatorJql.trim();
        const den = denTrim ? tryCompileJql(denTrim) : null;
        return {
          id: c.id,
          name: c.name,
          numeratorJql: c.numeratorJql,
          denominatorJql: c.denominatorJql,
          basis: c.basis,
          numerator: num ?? (() => false),
          denominator: denTrim ? den : null,
        };
      }),
    [ratioConfigs],
  );
  // Compile each value's JQL once per facet config so we don't reparse on
  // every render / keystroke. Invalid stored expressions resolve to null and
  // are skipped at filter time.
  const compiledCustomFacets = React.useMemo<CustomFacetForFilter[]>(
    () =>
      rawCustomFacets.map((f) => ({
        id: f.id,
        name: f.name,
        values: f.values.map((v) => ({
          id: v.id,
          name: v.name,
          compiled: tryCompileJql(v.jql),
        })),
      })),
    [rawCustomFacets],
  );
  const [windowDays, setWindowDays] = React.useState(initialWindowDays);
  const [timeBucket, setTimeBucket] =
    React.useState<TimeBucket>(initialTimeBucket);
  const [histogramBucketHours, setHistogramBucketHours] = React.useState(
    initialHistogramBucketHours,
  );

  const [filters, setFilters] = React.useState<Record<string, FacetSelection>>(
    () => loadFilters(dashboardId),
  );
  const [customFilters, setCustomFilters] = React.useState<
    Record<string, CustomFacetSelection>
  >(() => loadCustomFilters(dashboardId));

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        CUSTOM_FILTERS_STORAGE_KEY(dashboardId),
        JSON.stringify(customFilters),
      );
    } catch {}
  }, [dashboardId, customFilters]);

  const [filtersExpanded, setFiltersExpanded] = React.useState<boolean>(() =>
    loadFiltersExpanded(dashboardId),
  );
  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        FILTERS_EXPANDED_KEY(dashboardId),
        filtersExpanded ? "1" : "0",
      );
    } catch {}
  }, [dashboardId, filtersExpanded]);

  const [visibleJqls, setVisibleJqls] = React.useState<Record<string, boolean>>(
    () => loadVisibleJqls(dashboardId),
  );

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        VISIBLE_JQLS_KEY(dashboardId),
        JSON.stringify(visibleJqls),
      );
    } catch {}
  }, [dashboardId, visibleJqls]);

  const toggleJqlVisibility = React.useCallback((sourceId: string) => {
    setVisibleJqls((prev) => {
      const next = { ...prev };
      next[sourceId] = prev[sourceId] === false ? true : false;
      return next;
    });
  }, []);

  const [selection, setSelection] = React.useState<IssueListSelection | null>(
    null,
  );

  const [loadProgress, setLoadProgress] =
    React.useState<LoadProgressState | null>(null);

  // Per-source results as they stream in (by display index), so the dashboard
  // can render the sources that have finished without waiting for the rest.
  const [streamingSources, setStreamingSources] = React.useState<
    (ResolutionSourceResult | undefined)[]
  >([]);

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
      setLoadProgress({ fetched: 0, planned: null, startedAt: Date.now() });
      setStreamingSources([]);
      const res = await fetch(`/api/resolution-time/${dashboardId}/issues`, {
        cache: "no-store",
      });
      if (!res.ok || !res.body) throw new Error("이슈 fetch 실패");

      // The route streams NDJSON: plan → progress* → result (or error).
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let result: ResolutionDashboardIssuesResult | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: StreamEvent;
          try {
            ev = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (ev.type === "plan") {
            setLoadProgress((p) => (p ? { ...p, planned: ev.planned } : p));
          } else if (ev.type === "progress") {
            setLoadProgress((p) => (p ? { ...p, fetched: ev.fetched } : p));
          } else if (ev.type === "source") {
            const { index, data } = ev;
            setStreamingSources((prev) => {
              const next = prev.slice();
              next[index] = data;
              return next;
            });
          } else if (ev.type === "result") {
            result = ev.data;
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
      if (!result) throw new Error("이슈 데이터를 받지 못했습니다");
      return result;
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

  // Prefer the final (full) result; while it's still streaming, render from the
  // sources that have arrived so far (progressive — charts appear per JQL).
  const sources = React.useMemo(() => {
    if (query.data?.sources) return query.data.sources;
    return streamingSources.filter(
      (s): s is ResolutionSourceResult => s !== undefined,
    );
  }, [query.data?.sources, streamingSources]);

  // Apply per-source smart filters (both built-in and custom), then compute
  // resolution stats. Custom facets run after the built-in ones so users see
  // a count that reflects every active filter.
  const perSource = React.useMemo(() => {
    return sources.map((s) => {
      const builtInFiltered = applyFacets(s.issues, filters[s.sourceId] ?? {});
      const filtered = applyCustomFacets(
        builtInFiltered,
        compiledCustomFacets,
        customFilters[s.sourceId] ?? {},
      );
      const resolved = withResolutionHours(filtered);
      const aging = withAging(filtered);
      return {
        source: s,
        filteredIssues: filtered,
        resolved,
        aging,
      };
    });
  }, [sources, filters, customFilters, compiledCustomFacets]);

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

  // Sources the user kept visible — surfaced to downstream views that
  // shouldn't keep aggregating data the user already hid. Line charts use
  // the full `perSource` and rely on `hide={!isVisible}` per Line for the
  // animation to look natural; histogram bars and the long-tail table just
  // drop the source entirely.
  const visiblePerSource = React.useMemo(
    () => perSource.filter((ps) => visibleJqls[ps.source.sourceId] !== false),
    [perSource, visibleJqls],
  );

  const series: Series[] = React.useMemo(
    () =>
      perSource.map((ps) => ({
        sourceId: ps.source.sourceId,
        label: ps.source.label,
        color: ps.source.color,
        points: buildTimeSeries(ps.resolved, windowDays, timeBucket),
        unresolved: buildUnresolvedTimeSeries(
          ps.filteredIssues,
          windowDays,
          timeBucket,
        ),
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
      visiblePerSource.map((ps) => ({
        sourceId: ps.source.sourceId,
        label: ps.source.label,
        color: ps.source.color,
        bins: buildHistogram(ps.resolved, histogramBucketHours, 12),
      })),
    [visiblePerSource, histogramBucketHours],
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

  function patchCustomFilter(sourceId: string, next: CustomFacetSelection) {
    setCustomFilters((prev) => ({ ...prev, [sourceId]: next }));
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

      {query.isFetching &&
        sources.length > 0 &&
        loadProgress &&
        (loadProgress.planned !== null || loadProgress.fetched > 0) && (
          <Card>
            <CardContent className="py-3">
              <LoadProgress {...loadProgress} />
            </CardContent>
          </Card>
        )}

      {query.isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {(query.error as Error).message}
          </CardContent>
        </Card>
      ) : query.isLoading && sources.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            {loadProgress ? (
              <LoadProgress {...loadProgress} />
            ) : (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> 이슈 불러오는 중…
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryCards
            items={summary}
            visible={visibleJqls}
            onToggle={toggleJqlVisibility}
          />

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

          {sources.some((s) => s.capped) && (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="flex items-start gap-2 py-3 text-xs">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <div className="space-y-0.5">
                  <p className="font-medium text-amber-700 dark:text-amber-500">
                    분석 한도(2,000개)에 도달했습니다
                  </p>
                  <p className="text-muted-foreground">
                    다음 JQL은 최신 2,000개 이슈만 분석됩니다:{" "}
                    <span className="font-medium">
                      {sources
                        .filter((s) => s.capped)
                        .map((s) => s.label)
                        .join(", ")}
                    </span>
                    . 윈도를 좁히거나 JQL을 더 구체화하면 전체가 반영됩니다.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {sources.length > 0 && (
            <PerSourceFilters
              sources={sources}
              filters={filters}
              customFilters={customFilters}
              customFacets={compiledCustomFacets}
              onFilterChange={patchFilter}
              onCustomFilterChange={patchCustomFilter}
              expanded={filtersExpanded}
              onExpandedChange={setFiltersExpanded}
            />
          )}

          <PeriodComparisonCard
            windowDays={windowDays}
            perSource={visiblePerSource.map((ps) => ({
              sourceId: ps.source.sourceId,
              label: ps.source.label,
              color: ps.source.color,
              resolved: ps.resolved,
            }))}
          />

          <TimeSeriesChart
            series={series}
            bucket={timeBucket}
            milestones={milestoneMarks}
            visible={visibleJqls}
          />
          <UnresolvedTrendChart
            series={series}
            bucket={timeBucket}
            visible={visibleJqls}
          />
          <ThroughputTrendChart
            series={series}
            bucket={timeBucket}
            visible={visibleJqls}
          />
          {compiledRatios.map((rc) => (
            <RatioAnalysisChart
              key={rc.id}
              config={rc}
              perSource={visiblePerSource.map((ps) => ({
                sourceId: ps.source.sourceId,
                label: ps.source.label,
                color: ps.source.color,
                issues: ps.filteredIssues,
              }))}
              windowDays={windowDays}
              bucket={timeBucket}
              visible={visibleJqls}
            />
          ))}
          <HistogramChart
            histograms={histograms}
            onBinSelected={onBinSelected}
          />
          <AgingWipTable
            dashboardId={dashboardId}
            perSource={visiblePerSource.map((ps) => ({
              sourceId: ps.source.sourceId,
              sourceLabel: ps.source.label,
              sourceColor: ps.source.color,
              aging: ps.aging,
            }))}
          />
          <StatusDwellCard
            dashboardId={dashboardId}
            visibleSourceIds={visiblePerSource.map((ps) => ps.source.sourceId)}
          />
          <LongTailTable
            dashboardId={dashboardId}
            perSource={visiblePerSource.map((ps) => ({
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
  customFilters,
  customFacets,
  onFilterChange,
  onCustomFilterChange,
  expanded,
  onExpandedChange,
}: {
  sources: ResolutionSourceResult[];
  filters: Record<string, FacetSelection>;
  customFilters: Record<string, CustomFacetSelection>;
  customFacets: CustomFacetForFilter[];
  onFilterChange: (sourceId: string, next: FacetSelection) => void;
  onCustomFilterChange: (sourceId: string, next: CustomFacetSelection) => void;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}) {
  // Total active filter selections across every source — surfaces in the
  // collapsed header so the user knows "something is filtering" without
  // having to expand.
  const activeCount = React.useMemo(() => {
    let n = 0;
    for (const sel of Object.values(filters)) {
      for (const v of Object.values(sel)) n += v?.length ?? 0;
    }
    for (const sel of Object.values(customFilters)) {
      for (const v of Object.values(sel)) n += v?.length ?? 0;
    }
    return n;
  }, [filters, customFilters]);

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent/30"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Filter className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">스마트 필터</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {activeCount}
            </span>
          )}
          <span className="flex-1" />
          <span className="text-muted-foreground">
            {expanded ? "접기" : `${sources.length}개 JQL · 펼치기`}
          </span>
        </button>
        {expanded && (
          <div className="space-y-2 border-t p-3">
            {sources.map((s) => {
              if (s.issues.length === 0) return null;
              const facets = buildFacets(s.issues);
              const value = filters[s.sourceId] ?? {};
              const customValue = customFilters[s.sourceId] ?? {};
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
                    customFacets={customFacets}
                    customValue={customValue}
                    onCustomChange={(next) =>
                      onCustomFilterChange(s.sourceId, next)
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
