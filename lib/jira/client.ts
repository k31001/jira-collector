import "server-only";
import { JiraError, type JiraAuth, type JiraServerConfig, type RawJiraIssue } from "./types";
import { commentBodyToText } from "./adf";

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

/**
 * Same as DEFAULT_FIELDS but without the `comment` field. Used by `lite`
 * search paths where comments are fetched lazily per-row via the
 * `/issue/{key}/comment` endpoint to keep the initial search payload small.
 */
export const DEFAULT_FIELDS_NO_COMMENT = DEFAULT_FIELDS.filter(
  (f) => f !== "comment",
);

export function isCloudHost(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.hostname.endsWith(".atlassian.net") || u.hostname.endsWith(".atlassian.com");
  } catch {
    return false;
  }
}

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

/**
 * Cloud (Aug 2025+) replaced `/rest/api/2/search` and `/rest/api/3/search` with
 * `/rest/api/3/search/jql` which uses token-based pagination (nextPageToken)
 * and no longer returns a total. Server/DC still uses the legacy v2/search.
 *
 * Default page size is 500 to minimize sequential round-trips on large
 * dashboards (the old default of 100 meant 20 round-trips for 2000 issues).
 * Jira clamps to its own per-instance maximum if 500 is too high — Cloud's
 * `/search/jql` typically allows several hundred to a few thousand per
 * request; legacy Cloud `/search` capped at 100; DC honors up to ~1000.
 * The caller can override via options.maxResults.
 */
async function searchIssuesCloud(
  server: JiraServerConfig,
  jql: string,
  options: {
    fields?: string[];
    maxResults?: number;
    limit?: number;
    onPage?: (pageCount: number) => void;
  },
): Promise<RawJiraIssue[]> {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const pageSize = options.maxResults ?? 500;
  const limit = options.limit ?? 1000;
  const issues: RawJiraIssue[] = [];
  let nextPageToken: string | undefined;
  while (issues.length < limit) {
    const remaining = Math.min(pageSize, limit - issues.length);
    const body: Record<string, unknown> = {
      jql,
      fields,
      maxResults: remaining,
      expand: "renderedFields",
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await jiraFetch(server, "/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      issues: RawJiraIssue[];
      nextPageToken?: string;
      isLast?: boolean;
    };
    issues.push(...data.issues);
    options.onPage?.(data.issues.length);
    if (data.isLast || !data.nextPageToken) break;
    nextPageToken = data.nextPageToken;
  }
  return issues;
}

async function searchIssuesServer(
  server: JiraServerConfig,
  jql: string,
  options: {
    fields?: string[];
    maxResults?: number;
    limit?: number;
    onPage?: (pageCount: number) => void;
  },
): Promise<RawJiraIssue[]> {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const pageSize = options.maxResults ?? 500;
  const limit = options.limit ?? 1000;

  const fetchPage = async (
    startAt: number,
    max: number,
  ): Promise<{ issues: RawJiraIssue[]; total: number }> => {
    const res = await jiraFetch(server, "/rest/api/2/search", {
      method: "POST",
      body: JSON.stringify({
        jql,
        startAt,
        maxResults: max,
        fields,
        expand: ["renderedFields"],
      }),
    });
    return (await res.json()) as { issues: RawJiraIssue[]; total: number };
  };

  // Server/DC uses offset (`startAt`) pagination, so once the first page tells
  // us `total` we can fetch the remaining pages in parallel rather than walking
  // them one round-trip at a time. (Cloud's token-based `/search/jql` can't —
  // it stays sequential in `searchIssuesCloud`.)
  const firstMax = Math.min(pageSize, limit);
  const first = await fetchPage(0, firstMax);
  options.onPage?.(first.issues.length);
  const issues = [...first.issues];
  const target = Math.min(first.total, limit);

  // Done if the first page already reached the target, or the server returned a
  // short page (fewer than requested → no further results).
  if (issues.length >= target || first.issues.length < firstMax) {
    return issues.slice(0, limit);
  }

  const restPromises: Array<Promise<{ issues: RawJiraIssue[]; total: number }>> =
    [];
  for (let s = issues.length; s < target; s += pageSize) {
    restPromises.push(
      fetchPage(s, Math.min(pageSize, target - s)).then((p) => {
        options.onPage?.(p.issues.length);
        return p;
      }),
    );
  }
  const rest = await Promise.all(restPromises);
  for (const p of rest) issues.push(...p.issues);
  return issues.slice(0, limit);
}

export async function searchIssues(
  server: JiraServerConfig,
  jql: string,
  options: {
    fields?: string[];
    maxResults?: number;
    limit?: number;
    /** Called after each page with the number of issues in that page. */
    onPage?: (pageCount: number) => void;
  } = {},
): Promise<RawJiraIssue[]> {
  return isCloudHost(server.baseUrl)
    ? searchIssuesCloud(server, jql, options)
    : searchIssuesServer(server, jql, options);
}

export async function getIssue(
  server: JiraServerConfig,
  key: string,
  options: { fields?: string[] } = {},
): Promise<RawJiraIssue> {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const cloud = isCloudHost(server.baseUrl);
  const apiPath = cloud ? "/rest/api/3/issue" : "/rest/api/2/issue";
  const params = new URLSearchParams({
    fields: fields.join(","),
    expand: "renderedFields",
  });
  const res = await jiraFetch(
    server,
    `${apiPath}/${encodeURIComponent(key)}?${params}`,
    { method: "GET" },
  );
  return (await res.json()) as RawJiraIssue;
}

/**
 * Fetch only the most recent comment for a single issue. Used by the lazy
 * comment loader so the issue search can omit the heavy `comment` field.
 *
 * Tries the dedicated `/issue/{key}/comment` endpoint with
 * `orderBy=-created&maxResults=1`. If the server ignores `orderBy` (older
 * DC instances), the response still gives us the first page in creation
 * order — we then fall back to grabbing the last entry.
 */
export type LatestCommentResponse = {
  author?: string;
  body: string;
  created: string;
};

export async function getLatestComment(
  server: JiraServerConfig,
  issueKey: string,
): Promise<LatestCommentResponse | null> {
  const apiPath = isCloudHost(server.baseUrl)
    ? "/rest/api/3/issue"
    : "/rest/api/2/issue";
  const params = new URLSearchParams({
    orderBy: "-created",
    maxResults: "1",
    expand: "renderedBody",
  });
  const res = await jiraFetch(
    server,
    `${apiPath}/${encodeURIComponent(issueKey)}/comment?${params}`,
    { method: "GET" },
  );
  const data = (await res.json()) as {
    comments?: Array<{
      author?: { displayName?: string };
      body?: unknown;
      renderedBody?: unknown;
      created?: string;
    }>;
  };
  const list = data.comments ?? [];
  if (list.length === 0) return null;
  // If the server honored `-created` we get the latest first. If not, the
  // default ASC order means we want the LAST entry. Pick by `created` to
  // be safe.
  let pick = list[0];
  for (const c of list) {
    if (
      c.created &&
      pick.created &&
      Date.parse(c.created) > Date.parse(pick.created)
    ) {
      pick = c;
    }
  }
  return {
    author: pick.author?.displayName,
    body: commentBodyToText(pick),
    created: pick.created ?? "",
  };
}

/**
 * Fetch the status-transition history for a single issue.
 *
 * Cloud exposes a dedicated paginated `/issue/{key}/changelog` endpoint
 * (returns `values`); Server/DC returns the full history inline via
 * `?expand=changelog` (`changelog.histories`). Either way we keep only the
 * `status` field items and return them as `{ at, from, to }` transitions
 * sorted by time.
 */
export type RawChangelogHistory = {
  created?: string;
  items?: Array<{
    field?: string;
    fromString?: string | null;
    toString?: string | null;
  }>;
};

export type StatusChange = {
  at: number;
  from: string | null;
  to: string | null;
};

function historiesToStatusChanges(
  histories: RawChangelogHistory[],
): StatusChange[] {
  const out: StatusChange[] = [];
  for (const h of histories) {
    const at = h.created ? Date.parse(h.created) : NaN;
    if (!Number.isFinite(at)) continue;
    for (const item of h.items ?? []) {
      if (item.field !== "status") continue;
      out.push({
        at,
        from: item.fromString ?? null,
        to: item.toString ?? null,
      });
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

export async function getIssueChangelog(
  server: JiraServerConfig,
  issueKey: string,
): Promise<StatusChange[]> {
  if (isCloudHost(server.baseUrl)) {
    const histories: RawChangelogHistory[] = [];
    let startAt = 0;
    // Cloud paginates; walk until isLast. Cap at 10 pages (1000 entries) to
    // bound a pathological issue.
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({
        startAt: String(startAt),
        maxResults: "100",
      });
      const res = await jiraFetch(
        server,
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?${params}`,
        { method: "GET" },
      );
      const data = (await res.json()) as {
        values?: RawChangelogHistory[];
        isLast?: boolean;
        total?: number;
      };
      const values = data.values ?? [];
      histories.push(...values);
      if (data.isLast || values.length === 0) break;
      startAt += values.length;
    }
    return historiesToStatusChanges(histories);
  }

  // Server/DC: inline expand.
  const params = new URLSearchParams({
    fields: "status",
    expand: "changelog",
  });
  const res = await jiraFetch(
    server,
    `/rest/api/2/issue/${encodeURIComponent(issueKey)}?${params}`,
    { method: "GET" },
  );
  const data = (await res.json()) as {
    changelog?: { histories?: RawChangelogHistory[] };
  };
  return historiesToStatusChanges(data.changelog?.histories ?? []);
}

export async function getMyself(server: JiraServerConfig) {
  const apiPath = isCloudHost(server.baseUrl)
    ? "/rest/api/3/myself"
    : "/rest/api/2/myself";
  const res = await jiraFetch(server, apiPath);
  return (await res.json()) as {
    name?: string;
    displayName?: string;
    emailAddress?: string;
    accountId?: string;
  };
}

export async function countIssues(
  server: JiraServerConfig,
  jql: string,
): Promise<number> {
  if (isCloudHost(server.baseUrl)) {
    const res = await jiraFetch(server, "/rest/api/3/search/approximate-count", {
      method: "POST",
      body: JSON.stringify({ jql }),
    });
    const data = (await res.json()) as { count: number };
    return data.count;
  }
  const res = await jiraFetch(server, "/rest/api/2/search", {
    method: "POST",
    body: JSON.stringify({ jql, maxResults: 0, fields: [] }),
  });
  const data = (await res.json()) as { total: number };
  return data.total;
}
