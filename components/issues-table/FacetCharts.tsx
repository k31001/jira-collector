"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  ChevronUp,
  PieChart as PieIcon,
  BarChart3 as BarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildFacets,
  countCustomFacetValues,
  type CustomFacetForFilter,
  type FacetField,
} from "@/lib/resolution-time";
import type { NormalizedIssue } from "@/lib/jira/types";

const DIMENSION_OPTIONS: { value: FacetField; label: string }[] = [
  { value: "status", label: "상태" },
  { value: "assignee", label: "담당자" },
  { value: "issueType", label: "타입" },
  { value: "priority", label: "우선순위" },
  { value: "labels", label: "라벨" },
  { value: "reporter", label: "보고자" },
];

// Custom smart-filter facets join the dimension picker under a namespaced
// key so a facet id can never collide with a built-in field name.
const CUSTOM_DIM_PREFIX = "custom:";
const customDimKey = (facetId: string) => `${CUSTOM_DIM_PREFIX}${facetId}`;

// A fixed, color-blind-friendly-ish palette reused for both charts so a given
// category keeps the same hue whether shown as a pie slice or a bar.
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

// Cap the number of distinct slices/bars; the long tail is folded into "기타"
// so high-cardinality dimensions (assignee, labels) stay readable.
const MAX_SLICES = 11;

type ChartKind = "pie" | "bar";
// `dimension` is a built-in FacetField or a `custom:<facetId>` key. Whether a
// stored custom key still exists is only known at render time (the facet may
// have been deleted since), so validation of custom keys happens there.
type Persisted = { open: boolean; dimension: string; kind: ChartKind };

const DEFAULT_PREFS: Persisted = {
  open: false,
  dimension: "status",
  kind: "pie",
};

const STORAGE_KEY = (dashboardId: string) => `facet-charts:${dashboardId}`;

const VALID_DIMENSIONS = new Set<string>(DIMENSION_OPTIONS.map((d) => d.value));

function loadPrefs(dashboardId: string): Persisted {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(dashboardId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : false,
      dimension:
        typeof parsed.dimension === "string" &&
        (VALID_DIMENSIONS.has(parsed.dimension) ||
          parsed.dimension.startsWith(CUSTOM_DIM_PREFIX))
          ? parsed.dimension
          : "status",
      kind: parsed.kind === "bar" ? "bar" : "pie",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

type Slice = { name: string; count: number; fill: string };

/**
 * Distribution charts for the (smart-filtered) issue set. The breakdown is
 * computed with the same `buildFacets` used by the smart-filter dropdowns, so
 * the chart totals always match the filtered table.
 */
export function FacetCharts({
  dashboardId,
  issues,
  customFacets = [],
}: {
  dashboardId: string;
  issues: NormalizedIssue[];
  /** Compiled custom smart-filter facets, offered as extra dimensions. */
  customFacets?: CustomFacetForFilter[];
}) {
  // SSR-safe default first; hydrate persisted prefs after mount (see TrendChart
  // for why reading localStorage during render is avoided).
  const [{ open, dimension, kind }, setPrefs] =
    React.useState<Persisted>(DEFAULT_PREFS);
  const [loaded, setLoaded] = React.useState(false);
  // Deliberate post-hydration hand-off from the SSR default to the stored prefs.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    setPrefs(loadPrefs(dashboardId));
    setLoaded(true);
  }, [dashboardId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY(dashboardId),
        JSON.stringify({ open, dimension, kind }),
      );
    } catch {}
  }, [dashboardId, loaded, open, dimension, kind]);

  const customById = React.useMemo(
    () => new Map(customFacets.map((f) => [customDimKey(f.id), f])),
    [customFacets],
  );

  // A stored `custom:<id>` dimension whose facet was deleted since falls back
  // to "status". Computed during render to avoid setState-in-effect.
  const effectiveDimension =
    VALID_DIMENSIONS.has(dimension) || customById.has(dimension)
      ? dimension
      : "status";

  const slices = React.useMemo<Slice[]>(() => {
    const customFacet = customById.get(effectiveDimension);
    const entries = customFacet
      ? countCustomFacetValues(issues, customFacet)
      : buildFacets(issues)[effectiveDimension as FacetField];
    if (entries.length <= MAX_SLICES) {
      return entries.map((e, i) => ({
        name: e.value,
        count: e.count,
        fill: PALETTE[i % PALETTE.length],
      }));
    }
    const head = entries.slice(0, MAX_SLICES).map((e, i) => ({
      name: e.value,
      count: e.count,
      fill: PALETTE[i % PALETTE.length],
    }));
    const restCount = entries
      .slice(MAX_SLICES)
      .reduce((acc, e) => acc + e.count, 0);
    head.push({ name: "기타", count: restCount, fill: "#9CA3AF" });
    return head;
  }, [issues, effectiveDimension, customById]);

  const total = React.useMemo(
    () => slices.reduce((acc, s) => acc + s.count, 0),
    [slices],
  );

  const dimensionLabel =
    customById.get(effectiveDimension)?.name ??
    DIMENSION_OPTIONS.find((d) => d.value === effectiveDimension)?.label ??
    "";

  return (
    <section className="border-b bg-card/30">
      <header className="flex flex-wrap items-center gap-3 px-6 py-2">
        <button
          type="button"
          onClick={() => setPrefs((p) => ({ ...p, open: !p.open }))}
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
          분포 차트
        </button>
        <span className="text-xs text-muted-foreground">
          필터된 {total}개 · {dimensionLabel}별
        </span>
        <div className="flex-1" />
        {open && (
          <>
            <div className="inline-flex rounded-md border p-0.5">
              <Button
                type="button"
                variant={kind === "pie" ? "default" : "ghost"}
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={() => setPrefs((p) => ({ ...p, kind: "pie" }))}
                aria-label="파이 차트"
                aria-pressed={kind === "pie"}
              >
                <PieIcon className="h-3.5 w-3.5" />
                파이
              </Button>
              <Button
                type="button"
                variant={kind === "bar" ? "default" : "ghost"}
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={() => setPrefs((p) => ({ ...p, kind: "bar" }))}
                aria-label="막대 차트"
                aria-pressed={kind === "bar"}
              >
                <BarIcon className="h-3.5 w-3.5" />
                막대
              </Button>
            </div>
            <div className="w-[140px]">
              <Select
                value={effectiveDimension}
                onValueChange={(v) => setPrefs((p) => ({ ...p, dimension: v }))}
              >
                <SelectTrigger className="h-7 text-xs" aria-label="분류 기준">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}별
                    </SelectItem>
                  ))}
                  {customFacets
                    .filter((f) => f.values.length > 0)
                    .map((f) => (
                      <SelectItem key={f.id} value={customDimKey(f.id)}>
                        {f.name}별
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPrefs((p) => ({ ...p, open: !p.open }))}
        >
          {open ? "숨기기" : "보이기"}
        </Button>
      </header>
      {open && (
        <div className="px-6 pb-3">
          {total === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              표시할 데이터가 없습니다.
            </div>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {kind === "pie" ? (
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(value, name) => [
                        `${value}개 (${total ? Math.round((Number(value) / total) * 100) : 0}%)`,
                        name,
                      ]}
                    />
                    <Pie
                      data={slices}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="80%"
                      innerRadius="45%"
                      isAnimationActive={false}
                      label={(entry) =>
                        // Suppress labels for tiny slices to avoid overlap.
                        // `percent` (0–1) and `name` come from recharts directly.
                        entry.percent != null && entry.percent >= 0.06
                          ? `${entry.name} ${Math.round(entry.percent * 100)}%`
                          : ""
                      }
                      labelLine={false}
                    >
                      {slices.map((s) => (
                        <Cell key={s.name} fill={s.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                ) : (
                  <BarChart
                    data={slices}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.8 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(value) => [
                        `${value}개 (${total ? Math.round((Number(value) / total) * 100) : 0}%)`,
                        dimensionLabel,
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {slices.map((s) => (
                        <Cell key={s.name} fill={s.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
