"use client";

import * as React from "react";
import { EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatHours, type SourceStats } from "@/lib/resolution-time";

export type SummaryItem = {
  sourceId: string;
  label: string;
  color: string;
  stats: SourceStats;
};

export function SummaryCards({
  items,
  visible,
  onToggle,
}: {
  items: SummaryItem[];
  /** sourceId → visible. Missing/undefined treated as visible. */
  visible: Record<string, boolean>;
  /** Toggle visibility for a JQL source. */
  onToggle: (sourceId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => {
        const isHidden = visible[it.sourceId] === false;
        return (
          <Card
            key={it.sourceId}
            className={
              "cursor-pointer select-none overflow-hidden transition-opacity hover:ring-1 hover:ring-border " +
              (isHidden ? "opacity-50" : "")
            }
            onClick={() => onToggle(it.sourceId)}
            role="button"
            tabIndex={0}
            aria-pressed={!isHidden}
            aria-label={`${it.label} ${isHidden ? "표시" : "숨기기"}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(it.sourceId);
              }
            }}
          >
            <div
              className="h-1"
              style={{
                background: isHidden ? "transparent" : it.color,
                borderTop: isHidden ? `1px dashed ${it.color}` : undefined,
              }}
            />
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: it.color }}
                />
                <span
                  className="truncate text-sm font-medium"
                  style={{
                    textDecoration: isHidden ? "line-through" : undefined,
                  }}
                  title={it.label}
                >
                  {it.label}
                </span>
                {isHidden && (
                  <EyeOff
                    className="ml-auto h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden
                  />
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl tabular-nums">
                  {formatHours(it.stats.avgHours)}
                </span>
                <span className="text-[11px] text-muted-foreground">평균</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                <div>
                  <div className="text-foreground font-medium">
                    {formatHours(it.stats.medianHours)}
                  </div>
                  <div>중앙값</div>
                </div>
                <div>
                  <div className="text-foreground font-medium">
                    {formatHours(it.stats.p90Hours)}
                  </div>
                  <div>P90</div>
                </div>
                <div>
                  <div className="text-foreground font-medium">
                    {it.stats.resolved}/{it.stats.total}
                  </div>
                  <div>해결/전체</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
