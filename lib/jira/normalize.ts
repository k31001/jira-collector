import type { RawJiraIssue, NormalizedIssue } from "./types";
import { buildIssueUrl } from "./url-parser";
import { commentBodyToText } from "./adf";
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

  // Jira's `resolutiondate` is only populated when the Resolution field is
  // set, which many Cloud Scrum/Kanban workflows skip when an issue is
  // transitioned to a Done-category status via the board. Fall back to
  // `updated` whenever the status category is "done" so the trend chart and
  // table reflect what the user sees on the board.
  const isDoneCategory = categoryKey === "done";
  const resolvedAt = f.resolutiondate ?? (isDoneCategory ? f.updated : undefined);

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
    resolved: resolvedAt,
    priority: f.priority?.name,
    issueType: f.issuetype?.name,
    labels: f.labels ?? [],
    latestComment: lastComment
      ? {
          author: lastComment.author?.displayName,
          body: commentBodyToText(lastComment),
          created: lastComment.created,
        }
      : undefined,
    note,
  };
}
