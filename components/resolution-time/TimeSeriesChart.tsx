"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  findBucketLabelForDate,
  formatHours,
  type TimeBucket,
} from "@/lib/resolution-time";
import type {
  TimeSeriesPoint,
  UnresolvedTimeSeriesPoint,
} from "@/lib/resolution-time";

export type MilestoneMark = {
  /** ID of the source the milestone belongs to (used for color attribution). */
  sourceId: string;
  sourceLabel: string;
  color: string;
  name: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
};

export type Series = {
  sourceId: string;
  label: string;
  color: string;
  points: TimeSeriesPoint[];
  /** Per-bucket count of unresolved issues at bucket end. */
  unresolved: UnresolvedTimeSeriesPoint[];
};

/**
 * Combined chart showing average resolution time across all series. Each
 * series shares the same X (bucket) axis. We zip them into a single dataset
 * keyed by `date` so recharts can render them as separate lines.
 */
export function TimeSeriesChart({
  series,
  bucket,
  milestones = [],
  visible,
}: {
  series: Series[];
  bucket: TimeBucket;
  milestones?: MilestoneMark[];
  /** sourceId → visible (undefined = visible). */
  visible: Record<string, boolean>;
}) {
  const isVisible = React.useCallback(
    (sourceId: string) => visible[sourceId] !== false,
    [visible],
  );

  const data = React.useMemo(() => {
    if (series.length === 0) return [];
    const allDates = new Set<string>();
    for (const s of series) {
      for (const p of s.points) allDates.add(p.date);
    }
    const sortedDates = [...allDates].sort();
    return sortedDates.map((date) => {
      const labelOf = series
        .map((s) => s.points.find((p) => p.date === date)?.label)
        .find((x) => x);
      const row: Record<string, string | number | null> = {
        date,
        label: labelOf ?? date,
      };
      for (const s of series) {
        const pt = s.points.find((p) => p.date === date);
        row[s.sourceId] = pt?.avgHours ?? null;
      }
      return row;
    });
  }, [series]);

  const bucketLabel =
    bucket === "day"
      ? "일별"
      : bucket === "week"
        ? "주별"
        : bucket === "month"
          ? "월별"
          : "분기별";

  // Map each milestone to its X-axis category and assign a `stackIdx` within
  // its bucket so multiple milestones at the same X (e.g., two JQLs marking
  // the same release date with the same name) can be staggered visually
  // instead of overlapping into a single visible line/label.
  const milestoneMarks = React.useMemo(() => {
    const allPoints = data.map((d) => ({
      date: d.date as string,
      label: d.label as string,
    }));
    const placed = milestones
      // Hide milestones whose owning JQL is currently toggled off — they're
      // colored by sourceId and only make sense alongside that line.
      .filter((m) => isVisible(m.sourceId))
      .map((m) => {
        const date = new Date(m.date);
        if (Number.isNaN(date.getTime())) return null;
        const x = findBucketLabelForDate(date, allPoints);
        if (x === null) return null;
        return { ...m, x };
      })
      .filter((x): x is MilestoneMark & { x: string } => x !== null);

    const bucketCounts = new Map<string, number>();
    return placed.map((m) => {
      const idx = bucketCounts.get(m.x) ?? 0;
      bucketCounts.set(m.x, idx + 1);
      return { ...m, stackIdx: idx };
    });
  }, [data, milestones, isVisible]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          평균 해결 시간 추이 ({bucketLabel})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 44, right: 16, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                strokeOpacity={0.08}
              />
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
                width={40}
                tickFormatter={(v) =>
                  typeof v === "number" ? formatHours(v) : ""
                }
              />
              <Tooltip
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
                formatter={(value, name) => {
                  const s = series.find((x) => x.sourceId === name);
                  const label = s?.label ?? String(name);
                  if (typeof value !== "number") return ["—", label];
                  return [formatHours(value), label];
                }}
              />
              <Legend
                verticalAlign="top"
                height={28}
                wrapperStyle={{ fontSize: 11, top: -6 }}
                formatter={(value) => {
                  const s = series.find((x) => x.sourceId === value);
                  return s?.label ?? String(value);
                }}
              />
              {milestoneMarks.map((m) => (
                <ReferenceLine
                  key={`milestone-${m.x}-${m.sourceId}-${m.name}-${m.stackIdx}`}
                  x={m.x}
                  stroke={m.color}
                  strokeDasharray="4 3"
                  strokeOpacity={0.85}
                  strokeDashoffset={m.stackIdx * 4}
                  ifOverflow="hidden"
                  label={{
                    value: m.name,
                    position: "top",
                    fill: m.color,
                    fontSize: 10,
                    offset: 4 + m.stackIdx * 13,
                  }}
                />
              ))}
              {series.map((s) => (
                <Line
                  key={s.sourceId}
                  type="monotone"
                  dataKey={s.sourceId}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                  name={s.sourceId}
                  hide={!isVisible(s.sourceId)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {data.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            기간 내 해결된 이슈가 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
