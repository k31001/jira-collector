import "server-only";
import { JiraError, type JiraAuth, type JiraServerConfig, type RawJiraIssue } from "./types";

export const DEFAULT_FIELDS = [
  "summary",
  "status",
  "assignee",
  "reporter",
  "created",
  "updated",
  "resolutiondate",
  "priority",
  "issuetype",
  "labels",
  "comment",
];

function authHeader(auth: JiraAuth): string {
  if (auth.type === "pat") {
    return `Bearer ${auth.token}`;
  }
  const basic = Buffer.from(`${auth.email}:${auth.token}`).toString("base64");
  return `Basic ${basic}`;
}

async function jiraFetch(
  server: JiraServerConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${server.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(server.auth),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new JiraError(
      res.status,
      `Jira ${res.status} ${res.statusText} at ${path}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }
  return res;
}

export async function searchIssues(
  server: JiraServerConfig,
  jql: string,
  options: { fields?: string[]; maxResults?: number; limit?: number } = {},
): Promise<RawJiraIssue[]> {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const pageSize = options.maxResults ?? 100;
  const limit = options.limit ?? 1000;

  const issues: RawJiraIssue[] = [];
  let startAt = 0;
  while (issues.length < limit) {
    const remaining = Math.min(pageSize, limit - issues.length);
    const res = await jiraFetch(server, "/rest/api/2/search", {
      method: "POST",
      body: JSON.stringify({
        jql,
        startAt,
        maxResults: remaining,
        fields,
        expand: ["renderedFields"],
      }),
    });
    const data = (await res.json()) as { issues: RawJiraIssue[]; total: number };
    issues.push(...data.issues);
    if (data.issues.length < remaining) break;
    if (issues.length >= data.total) break;
    startAt += data.issues.length;
  }
  return issues;
}

export async function getIssue(
  server: JiraServerConfig,
  key: string,
  options: { fields?: string[] } = {},
): Promise<RawJiraIssue> {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const params = new URLSearchParams({
    fields: fields.join(","),
    expand: "renderedFields",
  });
  const res = await jiraFetch(server, `/rest/api/2/issue/${encodeURIComponent(key)}?${params}`, {
    method: "GET",
  });
  return (await res.json()) as RawJiraIssue;
}

export async function getMyself(server: JiraServerConfig) {
  const res = await jiraFetch(server, "/rest/api/2/myself");
  return (await res.json()) as { name?: string; displayName?: string; emailAddress?: string };
}

export async function countIssues(
  server: JiraServerConfig,
  jql: string,
): Promise<number> {
  const res = await jiraFetch(server, "/rest/api/2/search", {
    method: "POST",
    body: JSON.stringify({ jql, maxResults: 0, fields: [] }),
  });
  const data = (await res.json()) as { total: number };
  return data.total;
}
