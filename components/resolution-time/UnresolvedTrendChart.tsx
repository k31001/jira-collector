"use client";

import * as React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimeBucket } from "@/lib/resolution-time";
import type { Series } from "./TimeSeriesChart";

/**
 * Snapshot count of unresolved issues per bucket, per JQL source. Mirrors the
 * TimeSeriesChart layout but plots `unresolved` counts instead of `avgHours`.
 * Visibility is controlled externally via the same `visible` map so toggling a
 * source applies to both charts.
 */
export function UnresolvedTrendChart({
  series,
  bucket,
  visible,
}: {
  series: Series[];
  bucket: TimeBucket;
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
      for (const p of s.unresolved) allDates.add(p.date);
    }
    const sortedDates = [...allDates].sort();
    return sortedDates.map((date) => {
      const labelOf = series
        .map((s) => s.unresolved.find((p) => p.date === date)?.label)
        .find((x) => x);
      const row: Record<string, string | number | null> = {
        date,
        label: labelOf ?? date,
      };
      for (const s of series) {
        const pt = s.unresolved.find((p) => p.date === date);
        row[s.sourceId] = pt?.unresolved ?? null;
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          미해결 이슈 추이 ({bucketLabel})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 36, right: 16, left: -10, bottom: 0 }}
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
                allowDecimals={false}
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
                  return [`${value}개`, label];
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
            표시할 데이터가 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
