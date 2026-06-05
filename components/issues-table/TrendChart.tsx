"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NormalizedIssue } from "@/lib/jira/types";

type DataPoint = {
  date: string;
  label: string;
  created: number; // cumulative
  resolved: number; // cumulative
  unresolved: number; // created - resolved at that point (snapshot)
};

const MS_PER_DAY = 86400_000;

/**
 * Cumulative ("burn-up") series within the selected window.
 *
 * For each event (issue.created / issue.resolved) we add 1 to the bucket
 * of the day it happened. Events that occurred before the window are
 * dropped into the first bucket so day 0 reflects the running total at
 * the start. Buckets are then turned into running sums.
 *
 * Hot path is O(issues × 2 events) — the previous implementation called
 * `new Date(iso).toISOString().slice(0,10)` per event, which dominated the
 * runtime at thousands of issues. We now bucket by a numeric day index
 * relative to the window start and skip Date object construction entirely.
 */
function buildSeries(issues: NormalizedIssue[], days: number): DataPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const windowStartMs = todayMs - (days - 1) * MS_PER_DAY;

  const out: DataPoint[] = new Array(days);
  for (let i = 0; i < days; i++) {
    const dMs = windowStartMs + i * MS_PER_DAY;
    const d = new Date(dMs);
    const key =
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out[i] = { date: key, label, created: 0, resolved: 0, unresolved: 0 };
  }

  function bucketIndex(iso: string | undefined): number | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    if (ms < windowStartMs) return 0; // fold older events into day 0
    const idx = Math.floor((ms - windowStartMs) / MS_PER_DAY);
    if (idx >= days) return null; // future events outside window
    return idx;
  }

  for (const issue of issues) {
    const ci = bucketIndex(issue.created);
    if (ci !== null) out[ci].created += 1;
    const ri = bucketIndex(issue.resolved);
    if (ri !== null) out[ri].resolved += 1;
  }

  let cCum = 0;
  let rCum = 0;
  for (const point of out) {
    cCum += point.created;
    rCum += point.resolved;
    point.created = cCum;
    point.resolved = rCum;
    point.unresolved = cCum - rCum;
  }
  return out;
}

const WINDOW_OPTIONS = [
  { value: 14, label: "최근 14일" },
  { value: 30, label: "최근 30일" },
  { value: 60, label: "최근 60일" },
  { value: 90, label: "최근 90일" },
];

const SIZE_OPTIONS = [
  { value: 1, label: "1x" },
  { value: 1.2, label: "1.2x" },
  { value: 1.5, label: "1.5x" },
  { value: 2, label: "2x" },
];

const BASE_HEIGHT_PX = 140;

const STORAGE_KEY = (dashboardId: string) => `trend-chart:${dashboardId}`;

type Persisted = { open: boolean; days: number; size: number };

function loadPrefs(dashboardId: string): Persisted {
  if (typeof window === "undefined") return { open: true, days: 30, size: 1 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(dashboardId));
    if (!raw) return { open: true, days: 30, size: 1 };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const validSizes = SIZE_OPTIONS.map((s) => s.value);
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : true,
      days: typeof parsed.days === "number" ? parsed.days : 30,
      size:
        typeof parsed.size === "number" && validSizes.includes(parsed.size)
          ? parsed.size
          : 1,
    };
  } catch {
    return { open: true, days: 30, size: 1 };
  }
}

export function TrendChart({
  dashboardId,
  issues,
}: {
  dashboardId: string;
  issues: NormalizedIssue[];
}) {
  const [{ open, days, size }, setPrefs] = React.useState<Persisted>(() =>
    loadPrefs(dashboardId),
  );

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY(dashboardId),
        JSON.stringify({ open, days, size }),
      );
    } catch {}
  }, [dashboardId, open, days, size]);

  const data = React.useMemo(() => buildSeries(issues, days), [issues, days]);

  const last = data[data.length - 1];
  const totalCreated = last?.created ?? 0;
  const totalResolved = last?.resolved ?? 0;
  const unresolvedNow = last?.unresolved ?? 0;

  /**
   * Cumulative areas start high (older events folded into day 0) so the day-by-
   * day delta becomes invisible if the Y axis is pinned to 0. Auto-zoom the
   * left axis to just the visible variation of the two area series with a 12%
   * padding band. The unresolved line lives on its own right axis because it
   * sits at a different magnitude — without splitting them, focusing one
   * squashes the other.
   */
  const cumulativeYDomain = React.useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const p of data) {
      if (p.resolved < min) min = p.resolved;
      if (p.created > max) max = p.created;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const span = max - min;
    const pad = Math.max(1, Math.ceil(span * 0.12));
    const lower = Math.max(0, min - pad);
    const upper = max + pad;
    if (upper - lower < 2) return [lower, lower + 2];
    return [lower, upper];
  }, [data]);

  /**
   * Cap the right axis at `2 × peak` so the unresolved line never rises past
   * roughly the midpoint of the chart, even when the absolute value spikes.
   * This keeps the 누적 영역(좌축)이 시각적으로 dominant 하고, 미해결 라인이
   * 영역 fill 위로 올라타 보이는 시각적 충돌을 막습니다. 좌축의 zoom은
   * 생성/해결 데이터로 이미 결정되므로 우축은 거기에 종속되는 형태.
   */
  const unresolvedYDomain = React.useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 2];
    let max = 0;
    for (const p of data) {
      if (p.unresolved > max) max = p.unresolved;
    }
    const upper = Math.max(2, Math.ceil(max * 2));
    return [0, upper];
  }, [data]);

  const heightPx = Math.round(BASE_HEIGHT_PX * size);

  return (
    <section className="border-b bg-card/30">
      <header className="flex flex-wrap items-center gap-3 px-6 py-2">
        <button
          type="button"
          onClick={() => setPrefs((p) => ({ ...p, open: !p.open }))}
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          트렌드 (누적)
        </button>
        <span className="text-xs text-muted-foreground">
          생성 <span className="font-semibold text-foreground">{totalCreated}</span>
          {"  ·  "}해결 <span className="font-semibold text-foreground">{totalResolved}</span>
          {"  ·  "}미해결{" "}
          <span
            className={
              "font-semibold " +
              (unresolvedNow > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400")
            }
          >
            {unresolvedNow}
          </span>
        </span>
        <div className="flex-1" />
        {open && (
          <>
            <div className="w-[96px]">
              <Select
                value={String(size)}
                onValueChange={(v) => setPrefs((p) => ({ ...p, size: Number(v) }))}
              >
                <SelectTrigger className="h-7 text-xs" aria-label="그래프 높이">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      높이 {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[140px]">
              <Select
                value={String(days)}
                onValueChange={(v) => setPrefs((p) => ({ ...p, days: Number(v) }))}
              >
                <SelectTrigger className="h-7 text-xs">
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
          <div style={{ height: heightPx }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-created" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-resolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  yAxisId="left"
                  domain={cumulativeYDomain}
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={unresolvedYDomain}
                  tick={{ fontSize: 10, fill: "#F59E0B", fillOpacity: 0.85 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--muted-foreground)", fontSize: 11 }}
                  formatter={(value, name) => {
                    const label =
                      name === "created"
                        ? "누적 생성"
                        : name === "resolved"
                          ? "누적 해결"
                          : "미해결";
                    return [value as number, label];
                  }}
                  itemSorter={(item) => {
                    const order: Record<string, number> = {
                      created: 0,
                      resolved: 1,
                      unresolved: 2,
                    };
                    return order[item.dataKey as string] ?? 99;
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="created"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#grad-created)"
                  isAnimationActive={false}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="resolved"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#grad-resolved)"
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="unresolved"
                  stroke="#F59E0B"
                  strokeWidth={1.75}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#3B82F6" }} />
              누적 생성
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#10B981" }} />
              누적 해결
            </span>
            <span className="opacity-70">← 좌축</span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-[2px] w-3"
                style={{
                  background:
                    "repeating-linear-gradient(to right, #F59E0B 0, #F59E0B 4px, transparent 4px, transparent 7px)",
                }}
              />
              미해결 (스냅샷)
            </span>
            <span className="opacity-70">우축 →</span>
          </div>
        </div>
      )}
    </section>
  );
}
