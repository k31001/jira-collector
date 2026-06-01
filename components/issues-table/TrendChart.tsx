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

/**
 * Cumulative ("burn-up") series within the selected window.
 *
 * For each event (issue.created / issue.resolved) we add 1 to the bucket
 * of the day it happened. Events that occurred before the window are
 * dropped into the first bucket so day 0 reflects the running total at
 * the start. Buckets are then turned into running sums.
 */
function buildSeries(issues: NormalizedIssue[], days: number): DataPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: DataPoint[] = [];
  const keyToIdx = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    keyToIdx.set(key, out.length);
    out.push({ date: key, label, created: 0, resolved: 0, unresolved: 0 });
  }

  function bucketIndex(iso: string | undefined): number | null {
    if (!iso) return null;
    const k = new Date(iso).toISOString().slice(0, 10);
    const exact = keyToIdx.get(k);
    if (exact !== undefined) return exact;
    // Older than window start → fold into the first bucket so cumulative
    // totals start above zero where applicable.
    if (new Date(iso).getTime() < new Date(out[0].date).getTime()) return 0;
    return null;
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
              <AreaChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
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
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
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
                  type="monotone"
                  dataKey="created"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#grad-created)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="resolved"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#grad-resolved)"
                  isAnimationActive={false}
                />
                <Line
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
          <div className="mt-1 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#3B82F6" }} />
              누적 생성
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#10B981" }} />
              누적 해결
            </span>
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
          </div>
        </div>
      )}
    </section>
  );
}
