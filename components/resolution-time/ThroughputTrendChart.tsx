"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpHint, HelpRow } from "@/components/help-hint";
import { formatHours, type TimeBucket } from "@/lib/resolution-time";
import type { Series } from "./TimeSeriesChart";

/**
 * Throughput + resolution-time trend. Per time bucket and JQL source: bars show
 * 완료 수 (issues resolved in that bucket — right axis) and lines show the
 * median (solid) and P90 (dashed) resolution time of those issues (left axis).
 *
 * Replaces the old throughput-vs-cycle-time scatter — same two signals (volume
 * + speed) but read against time, and median/P90 resist the outliers that skew
 * a mean. Both metrics are already computed per bucket by `buildTimeSeries`.
 */
export function ThroughputTrendChart({
  series,
  bucket,
  visible,
}: {
  series: Series[];
  bucket: TimeBucket;
  visible: Record<string, boolean>;
}) {
  const bucketLabel =
    bucket === "day"
      ? "일별"
      : bucket === "week"
        ? "주별"
        : bucket === "month"
          ? "월별"
          : "분기별";

  const visibleSeries = React.useMemo(
    () => series.filter((s) => visible[s.sourceId] !== false),
    [series, visible],
  );

  // Zip every visible source's points into one row per bucket date, keyed by
  // `${sourceId}__count|median|p90` so each metric can target its own axis.
  const data = React.useMemo(() => {
    if (visibleSeries.length === 0) return [];
    const allDates = new Set<string>();
    for (const s of visibleSeries) for (const p of s.points) allDates.add(p.date);
    const sorted = [...allDates].sort();
    return sorted.map((date) => {
      const labelOf = visibleSeries
        .map((s) => s.points.find((p) => p.date === date)?.label)
        .find((x) => x);
      const row: Record<string, string | number | null> = {
        date,
        label: labelOf ?? date,
      };
      for (const s of visibleSeries) {
        const pt = s.points.find((p) => p.date === date);
        row[`${s.sourceId}__count`] = pt?.count ?? 0;
        row[`${s.sourceId}__median`] = pt?.median ?? null;
        row[`${s.sourceId}__p90`] = pt?.p90 ?? null;
      }
      return row;
    });
  }, [visibleSeries]);

  const hasAny = visibleSeries.some((s) => s.points.some((p) => p.count > 0));

  // Custom tooltip: one line per source with data this bucket, showing the
  // throughput and both resolution-time percentiles together. Closes over
  // `visibleSeries` so it can label each suffixed dataKey.
  const TooltipContent = (props: {
    active?: boolean;
    label?: string | number;
    payload?: Array<{ payload?: Record<string, string | number | null> }>;
  }) => {
    if (!props.active || !props.payload || props.payload.length === 0) {
      return null;
    }
    const row = props.payload[0]?.payload;
    if (!row) return null;
    const rows = visibleSeries
      .map((s) => ({
        s,
        count: row[`${s.sourceId}__count`],
        median: row[`${s.sourceId}__median`],
        p90: row[`${s.sourceId}__p90`],
      }))
      .filter((r) => typeof r.count === "number" && r.count > 0);
    if (rows.length === 0) return null;
    return (
      <div
        style={{
          background: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontSize: 12,
          padding: "6px 8px",
          lineHeight: 1.5,
        }}
      >
        <div
          className="mb-0.5 font-medium"
          style={{ color: "var(--muted-foreground)" }}
        >
          {props.label}
        </div>
        {rows.map(({ s, count, median, p90 }) => (
          <div key={s.sourceId} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="font-medium">{s.label}</span>
            <span style={{ color: "var(--muted-foreground)" }}>
              완료 {count}개 · 중앙값{" "}
              {formatHours(typeof median === "number" ? median : null)} · P90{" "}
              {formatHours(typeof p90 === "number" ? p90 : null)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          완료 수 · 해결 시간(중앙값·P90) 추이 ({bucketLabel})
          <HelpHint title="완료 수 · 해결 시간 추이">
            <HelpRow label="막대:">
              그 기간에 완료한 이슈 수(처리량)입니다. 오른쪽 축.
            </HelpRow>
            <HelpRow label="실선 / 점선:">
              완료된 이슈들의 해결 시간 중앙값(실선)과 P90(점선, 상위 10%
              경계)입니다. 왼쪽 축. 평균보다 이상치에 덜 흔들립니다.
            </HelpRow>
            <HelpRow label="해석:">
              막대가 높아지는데 선이 함께 오르면 많이·느리게 처리 중. 선이
              내려가면 빨라지는 중입니다.
            </HelpRow>
          </HelpHint>
          <span className="text-xs font-normal text-muted-foreground">
            막대=완료 수 · 실선=중앙값 · 점선=P90
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 44, right: 8, left: -10, bottom: 0 }}
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
                yAxisId="left"
                tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v) =>
                  typeof v === "number" ? formatHours(v) : ""
                }
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                axisLine={false}
                tickLine={false}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
                content={
                  TooltipContent as unknown as React.ComponentProps<
                    typeof Tooltip
                  >["content"]
                }
              />
              <Legend
                verticalAlign="top"
                height={28}
                wrapperStyle={{ fontSize: 11, top: -6 }}
                formatter={(value) => {
                  const s = visibleSeries.find((x) => x.sourceId === value);
                  return s?.label ?? String(value);
                }}
              />
              {visibleSeries.map((s) => (
                <Bar
                  key={`${s.sourceId}-count`}
                  yAxisId="right"
                  dataKey={`${s.sourceId}__count`}
                  fill={s.color}
                  fillOpacity={0.18}
                  isAnimationActive={false}
                  legendType="none"
                  name={`${s.sourceId}__count`}
                  radius={[2, 2, 0, 0]}
                />
              ))}
              {visibleSeries.map((s) => (
                <Line
                  key={`${s.sourceId}-median`}
                  yAxisId="left"
                  type="monotone"
                  dataKey={`${s.sourceId}__median`}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                  name={s.sourceId}
                />
              ))}
              {visibleSeries.map((s) => (
                <Line
                  key={`${s.sourceId}-p90`}
                  yAxisId="left"
                  type="monotone"
                  dataKey={`${s.sourceId}__p90`}
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeOpacity={0.6}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  legendType="none"
                  name={`${s.sourceId}__p90`}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {!hasAny && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            표시할 데이터가 없습니다. 기간 내 해결된 이슈가 필요합니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
