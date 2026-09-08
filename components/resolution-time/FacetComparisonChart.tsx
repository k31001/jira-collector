"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpHint, HelpRow } from "@/components/help-hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FACET_FIELDS,
  buildFacetComparison,
  countFacetValues,
  customFacetValuesOf,
  facetComparisonMetric,
  facetValuesOf,
  formatHours,
  type CustomFacetForFilter,
  type FacetCompareMetric,
  type FacetField,
  type FacetValuesOf,
} from "@/lib/resolution-time";
import type { NormalizedIssue } from "@/lib/jira/types";
import { FACET_LABELS, FacetPopover } from "./SmartFilters";
import type { IssueListItem, IssueListSelection } from "./IssueListDialog";

export type FacetComparisonSource = {
  sourceId: string;
  label: string;
  color: string;
  /** The source's issue population after its smart filters. */
  issues: NormalizedIssue[];
};

const CUSTOM_PREFIX = "custom:";
/** With nothing selected, show this many top values so the card isn't blank. */
const MAX_DEFAULT_VALUES = 8;

const METRIC_OPTIONS: { value: FacetCompareMetric; label: string }[] = [
  { value: "count", label: "이슈 수" },
  { value: "avg", label: "평균 해결 시간" },
  { value: "median", label: "중앙값 해결 시간" },
  { value: "p90", label: "P90 해결 시간" },
];
const METRIC_SET = new Set<string>(METRIC_OPTIONS.map((m) => m.value));

// Per-value palette (same as the general dashboard's distribution charts) so
// a value keeps its hue across metrics. A single selected value uses each
// JQL's own color instead.
const PALETTE = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#84CC16",
  "#06B6D4",
  "#A855F7",
];

type Prefs = { field: string; values: string[]; metric: FacetCompareMetric };
const DEFAULT_PREFS: Prefs = { field: "priority", values: [], metric: "count" };
const STORAGE_KEY = (id: string) => `resolution-time:facet-compare:${id}`;

function loadPrefs(id: string): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(id));
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      field: typeof p.field === "string" ? p.field : DEFAULT_PREFS.field,
      values: Array.isArray(p.values)
        ? p.values.filter((v): v is string => typeof v === "string")
        : [],
      metric:
        typeof p.metric === "string" && METRIC_SET.has(p.metric)
          ? (p.metric as FacetCompareMetric)
          : "count",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Bar label: counts as-is, hours via formatHours; blank for empty cells. */
function barLabel(
  metric: FacetCompareMetric,
): (value: string | number | boolean | null | undefined) => string {
  return (value) => {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return "";
    return metric === "count" ? String(n) : formatHours(n);
  };
}

/**
 * Cross-JQL comparison driven by a smart-filter facet. Pick a field (built-in
 * or custom) and one or more of its values; every JQL gets a bar whose
 * segments are the selected values. Count → stacked (segments add up to the
 * matching total); resolution-time metrics → grouped side by side, since
 * durations don't stack.
 */
export function FacetComparisonChart({
  dashboardId,
  perSource,
  customFacets,
  onSelect,
}: {
  dashboardId: string;
  perSource: FacetComparisonSource[];
  customFacets: CustomFacetForFilter[];
  onSelect: (selection: IssueListSelection) => void;
}) {
  const [prefs, setPrefs] = React.useState<Prefs>(() => loadPrefs(dashboardId));
  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY(dashboardId), JSON.stringify(prefs));
    } catch {}
  }, [dashboardId, prefs]);

  const fieldOptions = React.useMemo(
    () => [
      ...FACET_FIELDS.map((f) => ({ value: f as string, label: FACET_LABELS[f] })),
      ...customFacets
        .filter((f) => f.values.length > 0)
        .map((f) => ({ value: CUSTOM_PREFIX + f.id, label: f.name })),
    ],
    [customFacets],
  );

  // A stored custom facet may have been deleted since — fall back to the
  // default field rather than rendering an empty chart.
  const field = fieldOptions.some((o) => o.value === prefs.field)
    ? prefs.field
    : DEFAULT_PREFS.field;
  const fieldLabel = fieldOptions.find((o) => o.value === field)?.label ?? field;
  const customFacet = field.startsWith(CUSTOM_PREFIX)
    ? customFacets.find((f) => CUSTOM_PREFIX + f.id === field)
    : undefined;

  const valuesOf = React.useMemo<FacetValuesOf>(
    () =>
      customFacet
        ? customFacetValuesOf(customFacet)
        : (issue) => facetValuesOf(issue, field as FacetField),
    [customFacet, field],
  );
  const displayName = React.useCallback(
    (value: string) =>
      customFacet
        ? (customFacet.values.find((v) => v.id === value)?.name ?? value)
        : value,
    [customFacet],
  );

  // Value options with counts across every (visible, filtered) source. Custom
  // facets list all their defined values even when nothing matches yet.
  const options = React.useMemo(() => {
    const all = perSource.flatMap((s) => s.issues);
    const counted = countFacetValues(all, valuesOf);
    if (!customFacet) return counted.map((c) => ({ ...c, label: c.value }));
    const byId = new Map(counted.map((c) => [c.value, c.count]));
    return customFacet.values
      .map((v) => ({ value: v.id, count: byId.get(v.id) ?? 0, label: v.name }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [perSource, valuesOf, customFacet]);

  const selected = prefs.values;
  const effectiveValues = React.useMemo(
    () =>
      selected.length > 0
        ? selected
        : options.slice(0, MAX_DEFAULT_VALUES).map((o) => o.value),
    [selected, options],
  );

  const metric = prefs.metric;
  const stacked = metric === "count";
  const single = effectiveValues.length === 1;

  const rows = React.useMemo(
    () => buildFacetComparison(perSource, valuesOf, effectiveValues),
    [perSource, valuesOf, effectiveValues],
  );

  // One row per JQL; cell values live under index keys (`v0`, `v1`, …) so
  // arbitrary facet values can't collide with the row's own fields.
  const data = React.useMemo(
    () =>
      rows.map((r) => {
        const row: Record<string, string | number | null> = {
          name: r.label,
          sourceId: r.sourceId,
          color: r.color,
          total: r.cells.reduce((sum, c) => sum + c.count, 0),
        };
        r.cells.forEach((c, i) => {
          row[`v${i}`] = facetComparisonMetric(c, metric);
        });
        return row;
      }),
    [rows, metric],
  );

  function handleBarClick(sourceId: string, valueIndex: number) {
    const row = rows.find((r) => r.sourceId === sourceId);
    const cell = row?.cells[valueIndex];
    if (!row || !cell || cell.count === 0) return;
    // Count mode lists every issue in the cell; resolved ones carry their
    // resolution hours so the dialog can sort and show them, unresolved ones
    // stay as-is. Time modes list only the resolved subset the bar measured.
    let issues: IssueListItem[] = cell.resolved;
    if (stacked) {
      const resolvedByKey = new Map(
        cell.resolved.map((r) => [`${r.serverId}::${r.key}`, r] as const),
      );
      issues = cell.issues.map(
        (i) => resolvedByKey.get(`${i.serverId}::${i.key}`) ?? i,
      );
    }
    onSelect({
      sourceLabel: row.label,
      binLabel: `${fieldLabel}: ${displayName(cell.value)}`,
      issues,
    });
  }

  const metricLabel =
    METRIC_OPTIONS.find((m) => m.value === metric)?.label ?? "";
  const hasData = data.some((d) =>
    effectiveValues.some((_, i) => {
      const v = d[`v${i}`];
      return typeof v === "number" && v > 0;
    }),
  );

  return (
    <Card>
      <CardHeader className="pb-2 flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <BarChart3 className="h-3.5 w-3.5" />
          스마트 필터 비교
          <HelpHint title="스마트 필터 비교">
            <HelpRow label="무엇:">
              스마트 필터의 한 필드(우선순위·상태·라벨·커스텀 facet 등)에서 값을
              고르면, 모든 JQL에 대해 그 값에 해당하는 이슈를 막대로 비교합니다.
            </HelpRow>
            <HelpRow label="여러 값:">
              두 개 이상 고르면 값마다 색이 다른 세그먼트로 쌓인 누적 막대가
              됩니다. 아무 값도 고르지 않으면 많은 순으로 상위 {MAX_DEFAULT_VALUES}
              개 값을 자동으로 보여줍니다.
            </HelpRow>
            <HelpRow label="지표:">
              이슈 수는 해결/미해결 모두 세고 누적으로 쌓입니다. 평균·중앙값·P90
              해결 시간은 해결된 이슈만 계산하며, 시간은 더할 수 없으므로 값별
              막대를 나란히 놓습니다.
            </HelpRow>
            <HelpRow label="기준 모집단:">
              각 JQL의 스마트 필터가 적용된 뒤의 이슈입니다. 막대를 클릭하면 그
              JQL·값의 이슈 목록이 열립니다.
            </HelpRow>
          </HelpHint>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={field}
            onValueChange={(v) => setPrefs((p) => ({ ...p, field: v, values: [] }))}
          >
            <SelectTrigger className="h-7 w-[130px] text-xs" aria-label="비교 필드">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FacetPopover
            label={`${fieldLabel} 값`}
            options={options}
            selected={selected}
            onChange={(next) => setPrefs((p) => ({ ...p, values: next }))}
          />
          <Select
            value={metric}
            onValueChange={(v) =>
              setPrefs((p) => ({ ...p, metric: v as FacetCompareMetric }))
            }
          >
            <SelectTrigger className="h-7 w-[150px] text-xs" aria-label="지표">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRIC_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-[11px] text-muted-foreground">
          {fieldLabel}별 {metricLabel} ·{" "}
          {selected.length > 0
            ? `${selected.length}개 값 선택`
            : `값 미선택 → 상위 ${Math.min(MAX_DEFAULT_VALUES, options.length)}개 자동 표시`}{" "}
          · {stacked ? "누적 막대" : "값별 막대 (해결된 이슈만)"} · 각 JQL의 스마트
          필터 적용 후 기준
        </p>
        {perSource.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            표시할 소스가 없습니다.
          </div>
        ) : effectiveValues.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            데이터가 없습니다.
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 16, right: 16, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={52}
                  tickFormatter={(v) =>
                    stacked ? String(v) : formatHours(Number(v))
                  }
                />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{
                    color: "var(--muted-foreground)",
                    fontSize: 11,
                  }}
                  // Same order as the bars/legend (value index), not by name.
                  itemSorter={(item) => Number(String(item.dataKey ?? "v0").slice(1))}
                  formatter={(value, name, item) => {
                    const key = String(item?.dataKey ?? "");
                    const idx = Number(key.slice(1));
                    const sourceId = (item?.payload as { sourceId?: string })
                      ?.sourceId;
                    const row = rows.find((r) => r.sourceId === sourceId);
                    const cell = row?.cells[idx];
                    const n = Number(value);
                    if (stacked) {
                      const pct =
                        row && row.total > 0
                          ? Math.round((n / row.total) * 1000) / 10
                          : 0;
                      return [`${n}개 · ${pct}%`, name];
                    }
                    return [
                      `${formatHours(n)} · 해결 ${cell?.resolved.length ?? 0}건`,
                      name,
                    ];
                  }}
                />
                {!single && (
                  <Legend
                    verticalAlign="top"
                    height={24}
                    wrapperStyle={{ fontSize: 11, top: -8 }}
                    // Keep bar order (bottom of the stack first) rather than
                    // recharts' default alphabetical sort.
                    itemSorter={null}
                  />
                )}
                {effectiveValues.map((value, i) => {
                  const last = i === effectiveValues.length - 1;
                  return (
                    <Bar
                      key={value}
                      dataKey={`v${i}`}
                      name={displayName(value)}
                      stackId={stacked ? "stack" : undefined}
                      fill={PALETTE[i % PALETTE.length]}
                      isAnimationActive={false}
                      cursor="pointer"
                      radius={stacked && !last ? undefined : [3, 3, 0, 0]}
                      onClick={(payload) => {
                        const sid = (payload as { sourceId?: string }).sourceId;
                        if (typeof sid === "string") handleBarClick(sid, i);
                      }}
                    >
                      {single &&
                        data.map((d) => (
                          <Cell key={String(d.sourceId)} fill={String(d.color)} />
                        ))}
                      {/* Stack: one total label on the topmost segment.
                          Grouped / single: each bar labels its own value. */}
                      {stacked && !single ? (
                        last && (
                          <LabelList
                            dataKey="total"
                            position="top"
                            formatter={barLabel("count")}
                            fontSize={9}
                            fill="currentColor"
                            fillOpacity={0.55}
                          />
                        )
                      ) : (
                        <LabelList
                          dataKey={`v${i}`}
                          position="top"
                          formatter={barLabel(metric)}
                          fontSize={9}
                          fill="currentColor"
                          fillOpacity={0.55}
                        />
                      )}
                    </Bar>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {perSource.length > 0 && effectiveValues.length > 0 && !hasData && (
          <div className="py-2 text-center text-xs text-muted-foreground">
            {stacked
              ? "선택한 값에 해당하는 이슈가 없습니다."
              : "선택한 값에 해당하는 해결된 이슈가 없습니다."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
