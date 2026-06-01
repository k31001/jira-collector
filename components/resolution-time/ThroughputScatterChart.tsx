"use client";

import * as React from "react";
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatHours, type TimeBucket } from "@/lib/resolution-time";
import type { Series } from "./TimeSeriesChart";

/**
 * Throughput vs. cycle-time scatter. Each point is one time bucket of one JQL
 * source: X = number of issues resolved in that bucket (throughput), Y = mean
 * resolution time of those issues (cycle time). Reading the cloud of points
 * shows the speed/volume tradeoff — the healthy direction is bottom-right
 * (high throughput, low cycle time); points drifting up mean work is taking
 * longer even as (or because) volume changes.
 */
export function ThroughputScatterChart({
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

  const scatterData = React.useMemo(
    () =>
      series.map((s) => ({
        sourceId: s.sourceId,
        label: s.label,
        color: s.color,
        points: s.points
          .filter((p) => p.count > 0 && p.avgHours !== null)
          .map((p) => ({
            x: p.count,
            y: p.avgHours as number,
            bucketLabel: p.label,
          })),
      })),
    [series],
  );

  const visibleData = scatterData.filter(
    (s) => visible[s.sourceId] !== false && s.points.length > 0,
  );

  const hasAny = visibleData.some((s) => s.points.length > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          처리량 vs 해결 시간 ({bucketLabel})
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            점 1개 = 한 기간 · 오른쪽 아래일수록 건강
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 36, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <XAxis
                type="number"
                dataKey="x"
                name="완료 수"
                tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                label={{
                  value: "완료 수 (처리량)",
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 10,
                  fill: "currentColor",
                  fillOpacity: 0.6,
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="평균 해결 시간"
                tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v) =>
                  typeof v === "number" ? formatHours(v) : ""
                }
              />
              <ZAxis range={[50, 50]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)", fontSize: 11 }}
                formatter={(value, name) => {
                  if (name === "평균 해결 시간") {
                    return [
                      formatHours(typeof value === "number" ? value : null),
                      name,
                    ];
                  }
                  return [`${value}개`, "완료 수"];
                }}
              />
              <Legend
                verticalAlign="top"
                height={28}
                wrapperStyle={{ fontSize: 11, top: -6 }}
              />
              {visibleData.map((s) => (
                <Scatter
                  key={s.sourceId}
                  name={s.label}
                  data={s.points}
                  fill={s.color}
                  fillOpacity={0.7}
                  isAnimationActive={false}
                />
              ))}
            </ScatterChart>
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
