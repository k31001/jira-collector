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
import { HelpHint, HelpRow } from "@/components/help-hint";
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
            sourceLabel: s.label,
            color: s.color,
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
        <CardTitle className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          처리량 vs 해결 시간 ({bucketLabel})
          <HelpHint title="처리량 vs 해결 시간">
            <HelpRow label="점 1개:">
              한 기간을 나타냅니다. X축 = 그 기간에 완료한 이슈 수(처리량), Y축
              = 그 이슈들의 평균 해결 시간.
            </HelpRow>
            <HelpRow label="오른쪽 아래:">
              많이 + 빨리 = 이상적입니다. 위로 갈수록 느리고, 왼쪽일수록
              처리량이 적습니다.
            </HelpRow>
            <HelpRow label="우상단으로 몰리면:">
              많이 했지만 오래 걸린 상태 — 큰 작업 위주이거나 과부하 신호일 수
              있습니다.
            </HelpRow>
          </HelpHint>
          <span className="text-xs font-normal text-muted-foreground">
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
                content={
                  ScatterTooltip as unknown as React.ComponentProps<
                    typeof Tooltip
                  >["content"]
                }
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

type ScatterPoint = {
  x: number;
  y: number;
  bucketLabel: string;
  sourceLabel: string;
  color: string;
};

/**
 * Custom tooltip so each point shows WHICH period it is (the week/month
 * label) alongside the throughput and cycle time — a bare scatter tooltip
 * otherwise can't tell you when the point happened.
 */
function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ScatterPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
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
      <div className="flex items-center gap-1.5 font-medium">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: p.color }}
        />
        {p.sourceLabel} · {p.bucketLabel}
      </div>
      <div style={{ color: "var(--muted-foreground)" }}>
        완료 수 {p.x}개 · 평균 해결 시간 {formatHours(p.y)}
      </div>
    </div>
  );
}
