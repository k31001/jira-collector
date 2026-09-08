import "server-only";
import { ttlCache } from "@/lib/server-cache";
import type { ResolutionDashboardIssuesResult } from "@/lib/jira/fetch-resolution";

/**
 * Server-side cache for the resolution dashboard's issue payload.
 *
 * A cold load (Jira pagination for up to RESOLUTION_ISSUE_LIMIT issues per
 * JQL) is the slowest thing this app does, so the result is kept for as long
 * as the dashboard itself considers data fresh: its auto-refresh interval.
 * That makes page reloads, new tabs and back-navigation instant without
 * ever showing data older than the dashboard would show anyway — the
 * client's periodic refetch lands after the TTL and always gets a cold load,
 * and the 새로고침 button bypasses the cache explicitly.
 *
 * Keys embed a fingerprint of everything that shapes the payload besides the
 * JQLs (requested custom fields, custom-status mapping) so a settings change
 * naturally misses; editing the dashboard's sources invalidates by prefix.
 */
export const MIN_TTL_MS = 15_000;
export const MAX_TTL_MS = 10 * 60_000;

export const resolutionIssuesCache =
  ttlCache<ResolutionDashboardIssuesResult>(MIN_TTL_MS);

export function resolutionIssuesCacheKey(
  dashboardId: string,
  fingerprint: string,
): string {
  return `${dashboardId}::${fingerprint}`;
}

/** Drop every cached variant of one dashboard (call after editing its JQLs). */
export function invalidateResolutionIssuesCache(dashboardId: string): void {
  resolutionIssuesCache.invalidatePrefix(`${dashboardId}::`);
}

/**
 * TTL for a dashboard: its refresh interval, clamped to [15s, 10min]. A
 * dashboard with auto-refresh off gets the maximum — the user refreshes by
 * hand there, and the button bypasses the cache.
 */
export function resolutionIssuesTtlMs(refreshIntervalSec: number): number {
  if (!Number.isFinite(refreshIntervalSec) || refreshIntervalSec <= 0) {
    return MAX_TTL_MS;
  }
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, refreshIntervalSec * 1000));
}
