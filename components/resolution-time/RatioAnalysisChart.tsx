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
  buildRatioSeries,
  type RatioBasis,
  type TimeBucket,
} from "@/lib/resolution-time";
import type { NormalizedIssue } from "@/lib/jira/types";

type SourceBlock = {
  sourceId: string;
  label: string;
  color: string;
  issues: NormalizedIssue[];
};

export type CompiledRatioConfig = {
  id: string;
  name: string;
  /** Raw JQL strings for display. */
  numeratorJql: string;
  denominatorJql: string;
  basis: RatioBasis;
  numerator: (issue: NormalizedIssue) => boolean;
  denominator: ((issue: NormalizedIssue) => boolean) | null;
};

/**
 * Configurable ratio trend: per bucket, the share of denominator-matching
 * issues that also match the numerator. The specific ratio (numerator /
 * denominator and the date basis) is user-defined in 설정 → 비율 분석.
 */
export function RatioAnalysisChart({
  config,
  perSource,
  windowDays,
  bucket,
  visible,
}: {
  config: CompiledRatioConfig;
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

  const denomLabel = config.denominatorJql.trim() || "전체";
  const basisLabel = config.basis === "resolved" ? "해결일" : "생성일";

  const perSourceSeries = React.useMemo(
    () =>
      perSource.map((s) => ({
        sourceId: s.sourceId,
        label: s.label,
        color: s.color,
        points: buildRatioSeries(s.issues, windowDays, bucket, {
          numerator: config.numerator,
          denominator: config.denominator,
          basis: config.basis,
        }),
      })),
    [perSource, windowDays, bucket, config],
  );

  const data = React.useMemo(() => {
    if (perSourceSeries.length === 0) return [];
    const allDates = new Set<string>();
    for (const s of perSourceSeries) for (const p of s.points) allDates.add(p.date);
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
        row[s.sourceId] =
          pt && pt.denominator > 0
            ? Math.round(pt.ratio * 1000) / 10
            : null;
        row[`${s.sourceId}__meta`] = pt
          ? `${pt.numerator}/${pt.denominator}`
          : "";
      }
      return row;
    });
  }, [perSourceSeries]);

  const isVisible = (id: string) => visible[id] !== false;
  const hasAny = perSourceSeries.some(
    (s) => isVisible(s.sourceId) && s.points.some((p) => p.denominator > 0),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          비율 분석 ({bucketLabel})
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal">
            {config.name}
          </span>
          <HelpHint title={`비율 분석 · ${config.name}`}>
            <HelpRow label="값:">
              분모에 해당하는 이슈 중 분자 조건도 만족하는 비율(%)입니다.
            </HelpRow>
            <HelpRow label="이 비율:">
              분자 <code className="text-[11px]">{config.numeratorJql}</code> /
              분모 <code className="text-[11px]">{denomLabel}</code> ·{" "}
              {basisLabel} 기준.
            </HelpRow>
            <HelpRow label="해석:">
              선이 오르면 분모 중 분자 조건의 비중이 커지는 중입니다. 어떤 비율을
              볼지는 설정 → 비율 분석에서 바꿀 수 있습니다.
            </HelpRow>
          </HelpHint>
          <span className="text-xs font-normal text-muted-foreground">
            분자 {config.numeratorJql} / 분모 {denomLabel} · {basisLabel} 기준
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
