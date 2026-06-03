"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

export type LoadProgressState = {
  /** Cumulative issues fetched so far across all sources. */
  fetched: number;
  /** Estimated total to fetch; null until the counts arrive (indeterminate). */
  planned: number | null;
  /** Epoch ms when this load started, for elapsed / ETA. */
  startedAt: number;
};

/**
 * Determinate load bar fed by the NDJSON progress stream. Shows
 * fetched / planned (%), elapsed, and a rough live ETA derived from throughput.
 * Stays indeterminate (pulsing) until the `plan` event sets `planned`.
 */
export function LoadProgress({ fetched, planned, startedAt }: LoadProgressState) {
  // Tick so elapsed / ETA advance smoothly between stream events.
  const [now, setNow] = React.useState(() => startedAt);
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const determinate = planned !== null && planned > 0;
  const frac = determinate ? Math.min(1, fetched / planned) : null;
  const pct = frac !== null ? Math.round(frac * 100) : null;

  // Rough ETA from progress so far — jittery early, settles as it advances.
  let eta: number | null = null;
  if (frac !== null && frac > 0.03 && frac < 1 && elapsed > 0.5) {
    eta = (elapsed * (1 - frac)) / frac;
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          이슈 불러오는 중…
        </span>
        <span className="tabular-nums text-muted-foreground">
          {determinate
            ? `${fetched.toLocaleString()} / ${planned.toLocaleString()}개${
                pct !== null ? ` · ${pct}%` : ""
              }`
            : `${fetched.toLocaleString()}개`}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={determinate ? 100 : undefined}
        aria-valuenow={pct ?? undefined}
      >
        {determinate ? (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(3, pct ?? 0)}%` }}
          />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-primary/40" />
        )}
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{elapsed.toFixed(0)}초 경과</span>
        <span>
          {eta !== null
            ? `약 ${Math.max(1, Math.ceil(eta))}초 남음`
            : determinate
              ? ""
              : "예상 건수 계산 중…"}
        </span>
      </div>
    </div>
  );
}
