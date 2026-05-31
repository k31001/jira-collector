"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HistogramBin, ResolvedIssue } from "@/lib/resolution-time";

export type SourceHistogram = {
  sourceId: string;
  label: string;
  color: string;
  bins: HistogramBin[];
};

const ALL = "__all__";

export function HistogramChart({
  histograms,
  onBinSelected,
}: {
  histograms: SourceHistogram[];
  onBinSelected: (info: {
    sourceLabel: string;
    binLabel: string;
    issues: ResolvedIssue[];
  }) => void;
}) {
  const [selectedSourceId, setSelectedSourceId] = React.useState<string>(ALL);

  // Validate against the current histograms list so a deleted source falls
  // back to "전체". Computed during render to avoid setState-in-effect.
  const effectiveSourceId =
    selectedSourceId === ALL
      ? ALL
      : (histograms.find((h) => h.sourceId === selectedSourceId)?.sourceId ??
        ALL);

  // Build a single dataset where each row has a column per source so a
  // stacked BarChart can render them together. The same shape works for the
  // single-source view — we just render one Bar.
  const data = React.useMemo(() => {
    if (histograms.length === 0) return [];
    const binCount = histograms[0].bins.length;
    const rows: Array<Record<string, number | string>> = [];
    for (let bIdx = 0; bIdx < binCount; bIdx++) {
      const row: Record<string, number | string> = {
        idx: bIdx,
        label: histograms[0].bins[bIdx]?.label ?? "",
      };
      for (const h of histograms) {
        row[h.sourceId] = h.bins[bIdx]?.count ?? 0;
      }
      rows.push(row);
    }
    return rows;
  }, [histograms]);

  // Sources rendered as bars. In stacked mode this is the full set; otherwise
  // just the chosen one.
  const visibleSources =
    effectiveSourceId === ALL
      ? histograms
      : histograms.filter((h) => h.sourceId === effectiveSourceId);

  function handleBarClick(sourceId: string, idx: number) {
    const h = histograms.find((x) => x.sourceId === sourceId);
    if (!h) return;
    const bin = h.bins[idx];
    if (!bin || bin.count === 0) return;
    onBinSelected({
      sourceLabel: h.label,
      binLabel: bin.label,
      issues: bin.issues,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">해결 시간 분포</CardTitle>
        {histograms.length > 1 && (
          <div className="w-[200px]">
            <Select
              value={effectiveSourceId}
              onValueChange={setSelectedSourceId}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-r from-blue-500 to-emerald-500" />
                    전체 (누적)
                  </span>
                </SelectItem>
                {histograms.map((h) => (
                  <SelectItem key={h.sourceId} value={h.sourceId}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ background: h.color }}
                      />
                      {h.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-[11px] text-muted-foreground">
          {effectiveSourceId === ALL
            ? "스택 막대의 색상 구간을 클릭하면 해당 JQL의 이슈 목록이 표시됩니다."
            : "막대를 클릭하면 해당 구간에 속한 이슈 목록이 표시됩니다."}
        </p>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
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
                interval={0}
                angle={-25}
                textAnchor="end"
                height={50}
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
                labelStyle={{
                  color: "var(--muted-foreground)",
                  fontSize: 11,
                }}
                formatter={(value, name) => {
                  const src = histograms.find((h) => h.sourceId === name);
                  return [
                    typeof value === "number" ? `${value}개` : "—",
                    src?.label ?? String(name),
                  ];
                }}
              />
              {effectiveSourceId === ALL && histograms.length > 1 && (
                <Legend
                  verticalAlign="top"
                  height={24}
                  wrapperStyle={{ fontSize: 11, top: -6 }}
                  formatter={(value) => {
                    const src = histograms.find((h) => h.sourceId === value);
                    return src?.label ?? String(value);
                  }}
                />
              )}
              {visibleSources.map((h) => (
                <Bar
                  key={h.sourceId}
                  dataKey={h.sourceId}
                  stackId="histogram"
                  fill={h.color}
                  isAnimationActive={false}
                  onClick={(payload) => {
                    const idx = (payload as { idx?: number }).idx;
                    if (typeof idx === "number") handleBarClick(h.sourceId, idx);
                  }}
                  cursor="pointer"
                  radius={[3, 3, 0, 0]}
                  name={h.sourceId}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {data.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            데이터가 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
