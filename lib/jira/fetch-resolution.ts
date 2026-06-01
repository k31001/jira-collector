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
import { getServerConfig, getStatusContext } from "@/lib/db/queries";
import { JiraError, type NormalizedIssue } from "./types";
import { searchIssues } from "./client";
import { normalizeIssue } from "./normalize";

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
  error: string | null;
};

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
        error: null,
      };
      const serverConfig = getServerConfig(s.serverId);
      if (!serverConfig) {
        return { ...base, error: "Jira 서버 설정을 찾을 수 없습니다" };
      }
      try {
        // Request all fields (including custom fields) so the restricted JQL
        // evaluator can reference cf[NNNNN] in smart filters / ratio analysis.
        const raws = await searchIssues(serverConfig, s.jql, {
          fields: ["*all"],
        });
        const issues = raws.map((r) =>
          normalizeIssue(r, serverConfig, ctx, undefined),
        );
        return { ...base, issues };
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
