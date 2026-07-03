import "server-only";
import {
  getDashboard,
  getNotesForDashboard,
  getServerConfig,
  getStatusContext,
  listCustomFacetFieldIds,
  listSourcesForDashboard,
} from "@/lib/db/queries";
import type { DashboardIssuesResult, NormalizedIssue, SourceError } from "./types";
import { JiraError } from "./types";
import {
  DEFAULT_FIELDS,
  DEFAULT_FIELDS_NO_COMMENT,
  getIssue,
  searchIssues,
} from "./client";
import { normalizeIssue } from "./normalize";
import { parseIssueList } from "./url-parser";
import { db } from "@/lib/db/client";
import { jiraServers } from "@/lib/db/schema";

const URL_CONCURRENCY = 8;

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i]);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function fetchDashboardIssues(
  dashboardId: string,
  options: { lite?: boolean } = {},
): Promise<DashboardIssuesResult> {
  // When `lite` is set, we skip the heaviest field (`comment`) in the upstream
  // Jira search. Comments are then fetched on demand by the visible-page
  // batch endpoint. Cuts initial fetch payload dramatically on
  // comment-heavy projects.
  const lite = options.lite === true;
  const dashboard = getDashboard(dashboardId);
  if (!dashboard) {
    return { issues: [], errors: [], fetchedAt: Date.now() };
  }

  const sources = listSourcesForDashboard(dashboardId);
  const ctx = await getStatusContext();
  const notes = getNotesForDashboard(dashboardId);
  const serverRows = await db.select().from(jiraServers).all();
  const serverNameMap = new Map(serverRows.map((s) => [s.id, s.name]));

  const noteMap = new Map<string, string>();
  for (const n of notes) {
    noteMap.set(`${n.serverId}::${n.issueKey}`, n.content);
  }

  // Base fields plus the custom fields referenced by custom smart-filter
  // facets — without them the facet JQL (cf[NNNNN] = …) has no values to
  // match against and the filter silently matches nothing.
  const fields = [
    ...(lite ? DEFAULT_FIELDS_NO_COMMENT : DEFAULT_FIELDS),
    ...listCustomFacetFieldIds(),
  ];

  const issues: NormalizedIssue[] = [];
  const errors: SourceError[] = [];
  const seen = new Set<string>();

  await Promise.all(
    sources.map(async (source) => {
      const serverConfig = getServerConfig(source.serverId);
      const serverName =
        serverNameMap.get(source.serverId) ?? source.serverId.slice(0, 8);
      if (!serverConfig) {
        errors.push({
          sourceId: source.id,
          serverName,
          sourceType: source.sourceType as "jql" | "urls",
          message: "서버 설정을 찾을 수 없습니다",
        });
        return;
      }

      try {
        if (source.sourceType === "jql") {
          if (!source.jql || !source.jql.trim()) return;
          const raws = await searchIssues(serverConfig, source.jql, {
            fields,
          });
          for (const r of raws) {
            const key = `${serverConfig.id}::${r.key}`;
            if (seen.has(key)) continue;
            seen.add(key);
            issues.push(
              normalizeIssue(
                r,
                serverConfig,
                ctx,
                noteMap.get(key),
              ),
            );
          }
        } else if (source.sourceType === "urls") {
          if (!source.issueUrls) return;
          let urls: string[] = [];
          try {
            urls = JSON.parse(source.issueUrls);
          } catch {
            errors.push({
              sourceId: source.id,
              serverName,
              sourceType: "urls",
              message: "URL 목록 파싱 실패",
            });
            return;
          }
          const { parsed, errors: parseErrors } = parseIssueList(
            urls.join("\n"),
            [serverConfig],
            serverConfig.id,
          );
          for (const pe of parseErrors) {
            errors.push({
              sourceId: source.id,
              serverName,
              sourceType: "urls",
              message: `${pe.input}: ${pe.reason}`,
            });
          }
          const fetchResults = await runWithConcurrency(
            parsed,
            URL_CONCURRENCY,
            (p) =>
              getIssue(serverConfig, p.issueKey, {
                fields,
              }),
          );
          fetchResults.forEach((r, i) => {
            if (r.status === "fulfilled") {
              const raw = r.value;
              const key = `${serverConfig.id}::${raw.key}`;
              if (seen.has(key)) return;
              seen.add(key);
              issues.push(
                normalizeIssue(raw, serverConfig, ctx, noteMap.get(key)),
              );
            } else {
              const target = parsed[i];
              errors.push({
                sourceId: source.id,
                serverName,
                sourceType: "urls",
                message: `${target.issueKey}: ${errorMessage(r.reason)}`,
              });
            }
          });
        }
      } catch (err) {
        errors.push({
          sourceId: source.id,
          serverName,
          sourceType: source.sourceType as "jql" | "urls",
          message: errorMessage(err),
        });
      }
    }),
  );

  issues.sort((a, b) => {
    const ua = a.updated ? Date.parse(a.updated) : 0;
    const ub = b.updated ? Date.parse(b.updated) : 0;
    return ub - ua;
  });

  return { issues, errors, fetchedAt: Date.now() };
}

function errorMessage(err: unknown): string {
  if (err instanceof JiraError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
