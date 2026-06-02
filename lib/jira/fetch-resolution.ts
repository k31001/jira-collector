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
import { DEFAULT_FIELDS, searchIssues } from "./client";
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

export async function fetchResolutionDashboardIssues(
  dashboardId: string,
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

  // Base fields + only the custom fields referenced by ratio analysis /
  // custom facets, so cf[NNNNN] still resolves client-side without paying for
  // every field (`*all`) on every issue.
  const fields = [...DEFAULT_FIELDS, ...referencedCustomFields()];

  const results: ResolutionSourceResult[] = await Promise.all(
    sources.map(async (s) => {
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
      const serverConfig = getServerConfig(s.serverId);
      if (!serverConfig) {
        return { ...base, error: "Jira 서버 설정을 찾을 수 없습니다" };
      }
      try {
        const raws = await searchIssues(serverConfig, s.jql, {
          fields,
          limit: RESOLUTION_ISSUE_LIMIT,
        });
        const issues = raws.map((r) =>
          normalizeIssue(r, serverConfig, ctx, undefined),
        );
        return {
          ...base,
          issues,
          capped: raws.length >= RESOLUTION_ISSUE_LIMIT,
        };
      } catch (err) {
        return { ...base, error: errorMessage(err) };
      }
    }),
  );

  return { sources: results, fetchedAt: Date.now() };
}

function errorMessage(err: unknown): string {
  if (err instanceof JiraError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
