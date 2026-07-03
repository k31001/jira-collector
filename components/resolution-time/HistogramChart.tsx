"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpHint, HelpRow } from "@/components/help-hint";
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

/** Per-bar percent label: show `12.5%` for positive shares, blank otherwise. */
function formatPctLabel(
  value: string | number | boolean | null | undefined,
): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? `${n}%` : "";
}

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

  // Build a single dataset where each row (one per bin) has a count column and
  // a `__pct` column per source, so a clustered BarChart can render every
  // source's bar side by side. Percent is the bin's share of that source's
  // resolved total — surfaced as a per-bar label and in the tooltip.
  const data = React.useMemo(() => {
    if (histograms.length === 0) return [];
    const totals = new Map<string, number>(
      histograms.map((h) => [
        h.sourceId,
        h.bins.reduce((sum, b) => sum + b.count, 0),
      ]),
    );
    const binCount = histograms[0].bins.length;
    const rows: Array<Record<string, number | string>> = [];
    for (let bIdx = 0; bIdx < binCount; bIdx++) {
      const row: Record<string, number | string> = {
        idx: bIdx,
        label: histograms[0].bins[bIdx]?.label ?? "",
      };
      for (const h of histograms) {
        const count = h.bins[bIdx]?.count ?? 0;
        const total = totals.get(h.sourceId) ?? 0;
        row[h.sourceId] = count;
        row[`${h.sourceId}__pct`] =
          total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
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
        <CardTitle className="flex items-center gap-1.5 text-sm">
          해결 시간 분포
          <HelpHint title="해결 시간 분포">
            <HelpRow label="값:">
              해결된 이슈의 소요 시간 분포입니다. 막대 높이는 해당 JQL 내에서 그
              구간이 차지하는 비율(%)이라, 건수가 다른 JQL끼리도 분포 모양을 바로
              비교할 수 있습니다.
            </HelpRow>
            <HelpRow label="구간 단위:">
              1주까지는 설정한 버킷 단위로 나누고, 그 이후는 1주–2주 → 2주–1달
              → 1달–3달 → 3달+ 로 구간이 점점 넓어져 긴 꼬리도 뭉개지지 않고
              보입니다.
            </HelpRow>
            <HelpRow label="왼쪽에 몰림:">
              대부분 빨리 끝난다는 뜻으로 건강합니다. 오른쪽 꼬리가 길면 일부가
              매우 오래 걸린다는 신호.
            </HelpRow>
            <HelpRow label="막대 클릭:">
              그 구간에 해당하는 이슈 목록을 바로 확인할 수 있습니다.
            </HelpRow>
          </HelpHint>
        </CardTitle>
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
                    전체 (비교)
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
            ? "Y축은 각 JQL 내 비중(%)으로 정규화해 건수가 달라도 분포를 바로 비교합니다. 막대를 클릭하면 해당 JQL·구간의 이슈 목록이 표시됩니다."
            : "Y축은 해당 JQL 내 비중(%)입니다. 막대를 클릭하면 해당 구간에 속한 이슈 목록이 표시됩니다."}
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
                width={46}
                tickFormatter={(v) => `${v}%`}
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
                formatter={(value, name, item) => {
                  const src = histograms.find((h) => h.sourceId === name);
                  // Bar height is the percent (dataKey `${id}__pct`); the raw
                  // count still rides on the row under the bare source id.
                  const count = item?.payload?.[String(name)];
                  const countStr =
                    typeof count === "number" ? `${count}개` : "—";
                  const pctStr =
                    typeof value === "number" ? ` · ${value}%` : "";
                  return [`${countStr}${pctStr}`, src?.label ?? String(name)];
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
                  dataKey={`${h.sourceId}__pct`}
                  fill={h.color}
                  isAnimationActive={false}
                  onClick={(payload) => {
                    const idx = (payload as { idx?: number }).idx;
                    if (typeof idx === "number") handleBarClick(h.sourceId, idx);
                  }}
                  cursor="pointer"
                  radius={[3, 3, 0, 0]}
                  name={h.sourceId}
                >
                  <LabelList
                    dataKey={`${h.sourceId}__pct`}
                    position="top"
                    formatter={formatPctLabel}
                    fontSize={9}
                    fill="currentColor"
                    fillOpacity={0.55}
                  />
                </Bar>
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
