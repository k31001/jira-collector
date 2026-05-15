"use client";

import * as React from "react";
import { getContrastColor } from "@/lib/utils";
import type { NormalizedIssue } from "@/lib/jira/types";

type StatBucket = { label: string; color: string; count: number };

type Props = {
  issues: NormalizedIssue[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
};

export function StatusStatsBar({ issues, selected, onChange }: Props) {
  const buckets = React.useMemo<StatBucket[]>(() => {
    const map = new Map<string, StatBucket>();
    for (const issue of issues) {
      const label = issue.effectiveStatus.label;
      const color = issue.effectiveStatus.color;
      const existing = map.get(label);
      if (existing) existing.count += 1;
      else map.set(label, { label, color, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [issues]);

  function toggle(label: string) {
    const next = new Set(selected);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange(next);
  }

  const allSelected = selected.size === 0;
  const total = issues.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 py-2">
      <button
        type="button"
        onClick={() => onChange(new Set())}
        className={
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors " +
          (allSelected
            ? "border-foreground/40 bg-accent text-accent-foreground"
            : "border-input text-muted-foreground hover:bg-accent/40")
        }
      >
        모두
        <span className="rounded bg-foreground/10 px-1.5 py-0.5 tabular-nums">{total}</span>
      </button>
      {buckets.map((b) => {
        const active = selected.has(b.label);
        const fg = getContrastColor(b.color);
        return (
          <button
            key={b.label}
            type="button"
            onClick={() => toggle(b.label)}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all " +
              (active
                ? "ring-2 ring-offset-1 ring-offset-background"
                : "opacity-80 hover:opacity-100")
            }
            style={{
              backgroundColor: b.color,
              color: fg,
              ...(active ? { boxShadow: `0 0 0 2px ${b.color}` } : {}),
            }}
            aria-pressed={active}
          >
            {b.label}
            <span
              className="rounded bg-black/15 px-1.5 py-0.5 tabular-nums"
              style={{ backgroundColor: fg === "#fff" ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.3)" }}
            >
              {b.count}
            </span>
          </button>
        );
      })}
      {!allSelected && (
        <button
          type="button"
          onClick={() => onChange(new Set())}
          className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          필터 해제
        </button>
      )}
    </div>
  );
}
