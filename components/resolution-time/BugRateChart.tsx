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
import { HelpHint, HelpRow } from "@/components/help-hint";
import {
  buildBugRateSeries,
  type TimeBucket,
} from "@/lib/resolution-time";
import type { NormalizedIssue } from "@/lib/jira/types";

type SourceBlock = {
  sourceId: string;
  label: string;
  color: string;
  issues: NormalizedIssue[];
};

/**
 * Incoming bug-rate trend: per time bucket, the share of newly-created issues
 * that are bugs/defects. A rising line means a growing fraction of incoming
 * work is defects — a quality signal that complements raw cycle time.
 */
export function BugRateChart({
  perSource,
  windowDays,
  bucket,
  visible,
}: {
  perSource: SourceBlock[];
  windowDays: number;
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

  const perSourceSeries = React.useMemo(
    () =>
      perSource.map((s) => ({
        sourceId: s.sourceId,
        label: s.label,
        color: s.color,
        points: buildBugRateSeries(s.issues, windowDays, bucket),
      })),
    [perSource, windowDays, bucket],
  );

  const data = React.useMemo(() => {
    if (perSourceSeries.length === 0) return [];
    const allDates = new Set<string>();
    for (const s of perSourceSeries) {
      for (const p of s.points) allDates.add(p.date);
    }
    const sorted = [...allDates].sort();
    return sorted.map((date) => {
      const labelOf = perSourceSeries
        .map((s) => s.points.find((p) => p.date === date)?.label)
        .find((x) => x);
      const row: Record<string, string | number | null> = {
        date,
        label: labelOf ?? date,
      };
      for (const s of perSourceSeries) {
        const pt = s.points.find((p) => p.date === date);
        // Skip buckets with no created issues so the line doesn't dip to a
        // misleading 0%.
        row[s.sourceId] =
          pt && pt.total > 0 ? Math.round(pt.ratio * 1000) / 10 : null;
        row[`${s.sourceId}__meta`] = pt ? `${pt.bugs}/${pt.total}` : "";
      }
      return row;
    });
  }, [perSourceSeries]);

  const isVisible = (id: string) => visible[id] !== false;
  const hasAny = perSourceSeries.some(
    (s) => isVisible(s.sourceId) && s.points.some((p) => p.total > 0),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          버그 유입 비율 ({bucketLabel})
          <HelpHint title="버그 유입 비율">
            <HelpRow label="값:">
              그 기간에 생성된 이슈 중 버그/결함이 차지하는 비중(%)입니다.
              생성일 기준이라 &ldquo;들어오는 일&rdquo;의 품질을 봅니다.
            </HelpRow>
            <HelpRow label="선이 오를수록:">
              유입 작업 중 결함 비율이 커지는 중 = 품질 악화 또는 불 끄기가
              늘고 있다는 신호.
            </HelpRow>
            <HelpRow label="해석 팁:">
              해결 시간이 좋아도 이 비율이 높으면 신규 가치보다 수습에 시간을
              쓰는 중일 수 있습니다.
            </HelpRow>
          </HelpHint>
          <span className="text-xs font-normal text-muted-foreground">
            생성된 이슈 중 버그/결함 비중
          </span>
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
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)", fontSize: 11 }}
                formatter={(value, name, item) => {
                  const s = perSourceSeries.find((x) => x.sourceId === name);
                  const label = s?.label ?? String(name);
                  if (typeof value !== "number") return ["—", label];
                  const meta = item?.payload?.[`${name}__meta`];
                  return [`${value}%${meta ? ` (${meta})` : ""}`, label];
                }}
              />
              <Legend
                verticalAlign="top"
                height={28}
                wrapperStyle={{ fontSize: 11, top: -6 }}
                formatter={(value) => {
                  const s = perSourceSeries.find((x) => x.sourceId === value);
                  return s?.label ?? String(value);
                }}
              />
              {perSourceSeries.map((s) => (
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
        {!hasAny && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            표시할 데이터가 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
