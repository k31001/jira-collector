export type JiraAuth =
  | { type: "pat"; token: string }
  | { type: "basic"; email: string; token: string };

export type JiraServerConfig = {
  id: string;
  name: string;
  baseUrl: string; // no trailing slash
  auth: JiraAuth;
};

export type RawJiraIssue = {
  id: string;
  key: string;
  self: string;
  fields: Record<string, unknown> & {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string; colorName?: string } };
    assignee?: { displayName?: string; emailAddress?: string; avatarUrls?: Record<string, string> } | null;
    reporter?: { displayName?: string; emailAddress?: string } | null;
    created?: string;
    updated?: string;
    resolutiondate?: string | null;
    priority?: { name?: string } | null;
    issuetype?: { name?: string; iconUrl?: string } | null;
    labels?: string[];
    comment?: {
      comments?: Array<{
        id?: string;
        author?: { displayName?: string };
        body?: string;
        renderedBody?: string;
        created?: string;
        updated?: string;
      }>;
      total?: number;
    };
  };
};

export type NormalizedIssue = {
  serverId: string;
  serverName: string;
  key: string;
  url: string;
  summary: string;
  rawStatus: string;
  statusCategoryKey?: string;
  customStatus?: { name: string; color: string };
  effectiveStatus: { label: string; color: string };
  assignee?: { name: string };
  reporter?: { name: string };
  created?: string;
  updated?: string;
  resolved?: string;
  priority?: string;
  issueType?: string;
  labels: string[];
  latestComment?: {
    author?: string;
    body: string;
    created?: string;
  };
  note?: string;
};

export type SourceError = {
  sourceId: string;
  serverName: string;
  sourceType: "jql" | "urls";
  message: string;
};

export type DashboardIssuesResult = {
  issues: NormalizedIssue[];
  errors: SourceError[];
  fetchedAt: number;
};

export class JiraError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "JiraError";
  }
}
