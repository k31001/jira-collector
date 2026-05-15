import type { RawJiraIssue, NormalizedIssue } from "./types";
import { buildIssueUrl } from "./url-parser";
import { resolveStatusDisplay, type StatusContext } from "@/lib/status";

export function normalizeIssue(
  raw: RawJiraIssue,
  server: { id: string; name: string; baseUrl: string },
  ctx: StatusContext,
  note?: string,
): NormalizedIssue {
  const f = raw.fields;
  const rawStatus = f.status?.name ?? "Unknown";
  const categoryKey = f.status?.statusCategory?.key;
  const resolution = resolveStatusDisplay(rawStatus, categoryKey, ctx);

  const comments = f.comment?.comments ?? [];
  const lastComment = comments.length > 0 ? comments[comments.length - 1] : undefined;

  return {
    serverId: server.id,
    serverName: server.name,
    key: raw.key,
    url: buildIssueUrl(server.baseUrl, raw.key),
    summary: f.summary ?? "",
    rawStatus,
    statusCategoryKey: categoryKey,
    customStatus: resolution.isCustom
      ? { name: resolution.label, color: resolution.color }
      : undefined,
    effectiveStatus: { label: resolution.label, color: resolution.color },
    assignee: f.assignee?.displayName ? { name: f.assignee.displayName } : undefined,
    reporter: f.reporter?.displayName ? { name: f.reporter.displayName } : undefined,
    created: f.created,
    updated: f.updated,
    resolved: f.resolutiondate ?? undefined,
    priority: f.priority?.name,
    issueType: f.issuetype?.name,
    labels: f.labels ?? [],
    latestComment: lastComment
      ? {
          author: lastComment.author?.displayName,
          body: lastComment.renderedBody ?? lastComment.body ?? "",
          created: lastComment.created,
        }
      : undefined,
    note,
  };
}
