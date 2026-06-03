/**
 * Fetcher for the Resolution Time dashboard. Unlike `fetchDashboardIssues`,
 * results are kept per-source so the client can compute per-source statistics
 * and compare them side-by-side.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  resolutionDashboards,
  resolutionDashboardSources,
  jiraServers,
} from "@/lib/db/schema";
import {
  getServerConfig,
  getStatusContext,
  listCustomFacetsWithValues,
  listRatioConfigs,
} from "@/lib/db/queries";
import { extractCustomFieldIds } from "@/lib/jql-eval";
import { JiraError, type NormalizedIssue } from "./types";
import {
  DEFAULT_FIELDS_NO_COMMENT,
  countIssues,
  searchIssues,
} from "./client";
import { normalizeIssue } from "./normalize";

/**
 * Max issues analyzed per JQL source. A source that reaches this cap is
 * flagged `capped` so the UI can advise narrowing the window / JQL.
 */
export const RESOLUTION_ISSUE_LIMIT = 2000;

export type Milestone = { name: string; date: string };

export type ResolutionSourceResult = {
  sourceId: string;
  label: string;
  color: string;
  serverId: string;
  serverName: string;
  jql: string;
  milestones: Milestone[];
  issues: NormalizedIssue[];
  /** True when the fetch hit RESOLUTION_ISSUE_LIMIT (results may be partial). */
  capped: boolean;
  error: string | null;
};

/**
 * Custom fields (`customfield_NNNNN`) referenced anywhere the resolution
 * dashboard evaluates restricted JQL client-side: ratio-analysis numerators /
 * denominators and custom smart-filter facet values. These — plus the base
 * `DEFAULT_FIELDS` — are the only fields the dashboard needs, so we request
 * exactly them instead of `*all` to keep the search payload small.
 */
function referencedCustomFields(): string[] {
  const ids = new Set<string>();
  for (const rc of listRatioConfigs()) {
    for (const id of extractCustomFieldIds(rc.numeratorJql)) ids.add(id);
    for (const id of extractCustomFieldIds(rc.denominatorJql)) ids.add(id);
  }
  for (const facet of listCustomFacetsWithValues()) {
    for (const v of facet.values) {
      for (const id of extractCustomFieldIds(v.jql)) ids.add(id);
    }
  }
  return [...ids];
}

export type ResolutionDashboardIssuesResult = {
  sources: ResolutionSourceResult[];
  fetchedAt: number;
};

export type ResolutionPlanItem = {
  sourceId: string;
  label: string;
  /** Estimated issues to fetch for this source (min(count, cap)). */
  planned: number;
};

/**
 * Progress hooks so a streaming caller can report load progress to the client.
 * - `onPlan` fires once the per-source approximate counts are known (lets the
 *   UI switch from indeterminate to a determinate bar).
 * - `onProgress` fires after each fetched page with the cumulative issue count.
 */
export type ResolutionFetchProgress = {
  onPlan?: (plannedTotal: number, perSource: ResolutionPlanItem[]) => void;
  onProgress?: (fetched: number) => void;
  /**
   * Fires as each source finishes (in completion order) with its display
   * index, so the client can render that source's charts without waiting for
   * the slower sources.
   */
  onSource?: (source: ResolutionSourceResult, index: number) => void;
};

export async function fetchResolutionDashboardIssues(
  dashboardId: string,
  progress?: ResolutionFetchProgress,
): Promise<ResolutionDashboardIssuesResult> {
  const dash = db
    .select()
    .from(resolutionDashboards)
    .where(eq(resolutionDashboards.id, dashboardId))
    .get();
  if (!dash) {
    return { sources: [], fetchedAt: Date.now() };
  }

  const sources = db
    .select()
    .from(resolutionDashboardSources)
    .where(eq(resolutionDashboardSources.dashboardId, dashboardId))
    .all()
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const ctx = await getStatusContext();
  const serverRows = await db.select().from(jiraServers).all();
  const serverNameMap = new Map(serverRows.map((s) => [s.id, s.name]));

  // Base fields (minus `comment`) + only the custom fields referenced by ratio
  // analysis / custom facets. Comments are the heaviest field and are only used
  // by the slow-issue table, which loads them lazily per visible row — so we
  // omit them here and keep cf[NNNNN] working without paying for `*all`.
  const fields = [...DEFAULT_FIELDS_NO_COMMENT, ...referencedCustomFields()];

  // Resolve each source's server config once — shared by the count + fetch.
  const cfgById = new Map(sources.map((s) => [s.id, getServerConfig(s.serverId)]));

  // Accumulate issues fetched across all sources. JS is single-threaded so the
  // page callbacks never overlap; `+=` is race-free.
  let fetchedTotal = 0;
  const bumpFetched = (n: number) => {
    fetchedTotal += n;
    progress?.onProgress?.(fetchedTotal);
  };

  // Estimate the work upfront via approximate-count so the client can show a
  // determinate bar. Runs concurrently with the fetches below (doesn't delay
  // first byte) and emits `plan` as soon as the counts land. A failed count
  // falls back to the per-source cap.
  const planPromise: Promise<void> = progress?.onPlan
    ? (async () => {
        const perSource = await Promise.all(
          sources.map(async (s): Promise<ResolutionPlanItem> => {
            const cfg = cfgById.get(s.id);
            if (!cfg) return { sourceId: s.id, label: s.label, planned: 0 };
            try {
              const c = await countIssues(cfg, s.jql);
              return {
                sourceId: s.id,
                label: s.label,
                planned: Math.min(c, RESOLUTION_ISSUE_LIMIT),
              };
            } catch {
              return {
                sourceId: s.id,
                label: s.label,
                planned: RESOLUTION_ISSUE_LIMIT,
              };
            }
          }),
        );
        const total = perSource.reduce((sum, p) => sum + p.planned, 0);
        progress.onPlan?.(total, perSource);
      })()
    : Promise.resolve();

  const results: ResolutionSourceResult[] = await Promise.all(
    sources.map(async (s, index) => {
      const serverName =
        serverNameMap.get(s.serverId) ?? s.serverId.slice(0, 8);
      let milestones: Milestone[] = [];
      try {
        const parsed = JSON.parse(s.milestones) as unknown;
        if (Array.isArray(parsed)) {
          milestones = parsed.filter(
            (m): m is Milestone =>
              !!m &&
              typeof m === "object" &&
              typeof (m as Milestone).name === "string" &&
              typeof (m as Milestone).date === "string",
          );
        }
      } catch {
        // ignore malformed JSON, treat as no milestones
      }
      const base: ResolutionSourceResult = {
        sourceId: s.id,
        label: s.label,
        color: s.color,
        serverId: s.serverId,
        serverName,
        jql: s.jql,
        milestones,
        issues: [],
        capped: false,
        error: null,
      };
      const serverConfig = cfgById.get(s.id);
      let result: ResolutionSourceResult;
      if (!serverConfig) {
        result = { ...base, error: "Jira 서버 설정을 찾을 수 없습니다" };
      } else {
        try {
          const raws = await searchIssues(serverConfig, s.jql, {
            fields,
            limit: RESOLUTION_ISSUE_LIMIT,
            onPage: bumpFetched,
          });
          const issues = raws.map((r) =>
            normalizeIssue(r, serverConfig, ctx, undefined),
          );
          result = {
            ...base,
            issues,
            capped: raws.length >= RESOLUTION_ISSUE_LIMIT,
          };
        } catch (err) {
          result = { ...base, error: errorMessage(err) };
        }
      }
      // Emit as soon as this source finishes so the client can render it
      // without waiting for the slower sources.
      progress?.onSource?.(result, index);
      return result;
    }),
  );

  // Ensure the `plan` event was emitted (counts usually finish well before the
  // fetches; this just guarantees it fired before we return the result).
  await planPromise;

  return { sources: results, fetchedAt: Date.now() };
}

function errorMessage(err: unknown): string {
  if (err instanceof JiraError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
