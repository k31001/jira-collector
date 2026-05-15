"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

type DataPoint = { date: string; label: string; created: number; resolved: number };

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
    out.push({ date: key, label, created: 0, resolved: 0 });
  }
  for (const issue of issues) {
    if (issue.created) {
      const k = new Date(issue.created).toISOString().slice(0, 10);
      const idx = keyToIdx.get(k);
      if (idx !== undefined) out[idx].created += 1;
    }
    if (issue.resolved) {
      const k = new Date(issue.resolved).toISOString().slice(0, 10);
      const idx = keyToIdx.get(k);
      if (idx !== undefined) out[idx].resolved += 1;
    }
  }
  return out;
}

const WINDOW_OPTIONS = [
  { value: 14, label: "최근 14일" },
  { value: 30, label: "최근 30일" },
  { value: 60, label: "최근 60일" },
  { value: 90, label: "최근 90일" },
];

const STORAGE_KEY = (dashboardId: string) => `trend-chart:${dashboardId}`;

type Persisted = { open: boolean; days: number };

function loadPrefs(dashboardId: string): Persisted {
  if (typeof window === "undefined") return { open: true, days: 30 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(dashboardId));
    if (!raw) return { open: true, days: 30 };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : true,
      days: typeof parsed.days === "number" ? parsed.days : 30,
    };
  } catch {
    return { open: true, days: 30 };
  }
}

export function TrendChart({
  dashboardId,
  issues,
}: {
  dashboardId: string;
  issues: NormalizedIssue[];
}) {
  const [{ open, days }, setPrefs] = React.useState<Persisted>(() => loadPrefs(dashboardId));

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY(dashboardId), JSON.stringify({ open, days }));
    } catch {}
  }, [dashboardId, open, days]);

  const data = React.useMemo(() => buildSeries(issues, days), [issues, days]);

  const totalCreated = data.reduce((s, d) => s + d.created, 0);
  const totalResolved = data.reduce((s, d) => s + d.resolved, 0);
  const net = totalCreated - totalResolved;

  return (
    <section className="border-b bg-card/30">
      <header className="flex flex-wrap items-center gap-3 px-6 py-2">
        <button
          type="button"
          onClick={() => setPrefs((p) => ({ ...p, open: !p.open }))}
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          트렌드
        </button>
        <span className="text-xs text-muted-foreground">
          생성 <span className="font-semibold text-foreground">{totalCreated}</span>
          {"  ·  "}해결 <span className="font-semibold text-foreground">{totalResolved}</span>
          {"  ·  "}순증{" "}
          <span
            className={
              "font-semibold " +
              (net > 0
                ? "text-amber-600 dark:text-amber-400"
                : net < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground")
            }
          >
            {net > 0 ? `+${net}` : net}
          </span>
        </span>
        <div className="flex-1" />
        {open && (
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
          <div className="h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-created" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-resolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
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
                  formatter={(value, name) => [
                    value as number,
                    name === "created" ? "생성" : "해결",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="created"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#grad-created)"
                />
                <Area
                  type="monotone"
                  dataKey="resolved"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#grad-resolved)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#3B82F6" }} />
              생성
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#10B981" }} />
              해결
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
