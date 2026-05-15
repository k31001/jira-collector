/**
 * Mock Jira Server/DC for local development.
 *
 * Spawns TWO HTTP servers that look like two separate Jira instances:
 *   - "Team A Jira"  on http://localhost:4567   (projects: PROJ, BUG)
 *   - "Team B Jira"  on http://localhost:4568   (projects: FEAT)
 *
 * Endpoints (subset of Jira REST API v2):
 *   GET  /rest/api/2/myself
 *   POST /rest/api/2/search   { jql, startAt, maxResults, fields }
 *   GET  /rest/api/2/issue/:key
 *
 * Auth: any non-empty Authorization header is accepted. Use any token.
 *
 * JQL is crudely parsed — supports:
 *   project = X
 *   status = "X"
 *   status in (X, Y)
 *   status != X
 *   assignee = currentUser()
 *   resolution = Unresolved   (issues without resolutiondate)
 * Unknown clauses are ignored. ORDER BY is honored for `updated`/`created`.
 */
import http from "node:http";
import { URL } from "node:url";

type Comment = {
  id: string;
  author: { displayName: string };
  body: string;
  renderedBody?: string;
  created: string;
  updated: string;
};

type Issue = {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string; colorName: string } };
    assignee: { displayName: string } | null;
    reporter: { displayName: string };
    created: string;
    updated: string;
    resolutiondate: string | null;
    priority: { name: string } | null;
    issuetype: { name: string };
    labels: string[];
    comment: { comments: Comment[]; total: number; maxResults: number; startAt: number };
  };
};

const STATUS_CATEGORIES: Record<string, { key: string; colorName: string }> = {
  "To Do": { key: "new", colorName: "blue-gray" },
  "In Progress": { key: "indeterminate", colorName: "yellow" },
  "In Review": { key: "indeterminate", colorName: "yellow" },
  "Resolved": { key: "indeterminate", colorName: "yellow" },
  "Done": { key: "done", colorName: "green" },
  "Closed": { key: "done", colorName: "green" },
};

const USERS = [
  "Demo User",
  "Jane Park",
  "Minho Kim",
  "Alex Wong",
  "Soyeon Lee",
];

let idCounter = 10001;

function nextId(): string {
  return String(idCounter++);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
}

function makeIssue(input: {
  key: string;
  summary: string;
  status: keyof typeof STATUS_CATEGORIES;
  assignee?: string | null;
  reporter?: string;
  priority?: string;
  issuetype?: string;
  labels?: string[];
  createdDaysAgo: number;
  updatedDaysAgo: number;
  resolved?: boolean;
  comments?: Array<{ author: string; body: string; daysAgo: number }>;
  baseUrl: string;
}): Issue {
  const cat = STATUS_CATEGORIES[input.status];
  const comments: Comment[] = (input.comments ?? []).map((c, i) => ({
    id: String(20000 + i),
    author: { displayName: c.author },
    body: c.body,
    renderedBody: `<p>${c.body.replace(/\n/g, "<br/>")}</p>`,
    created: daysAgo(c.daysAgo),
    updated: daysAgo(c.daysAgo),
  }));
  return {
    id: nextId(),
    key: input.key,
    self: `${input.baseUrl}/rest/api/2/issue/${input.key}`,
    fields: {
      summary: input.summary,
      status: { name: input.status, statusCategory: cat },
      assignee: input.assignee === null ? null : { displayName: input.assignee ?? "Demo User" },
      reporter: { displayName: input.reporter ?? "Demo User" },
      created: daysAgo(input.createdDaysAgo),
      updated: daysAgo(input.updatedDaysAgo),
      resolutiondate: input.resolved ? daysAgo(input.updatedDaysAgo) : null,
      priority: input.priority ? { name: input.priority } : { name: "Medium" },
      issuetype: { name: input.issuetype ?? "Task" },
      labels: input.labels ?? [],
      comment: { comments, total: comments.length, maxResults: comments.length, startAt: 0 },
    },
  };
}

function seedTeamA(baseUrl: string): Issue[] {
  return [
    makeIssue({
      baseUrl,
      key: "PROJ-101",
      summary: "결제 모듈 인증 실패 디버깅",
      status: "In Progress",
      assignee: "Demo User",
      reporter: "Jane Park",
      priority: "High",
      issuetype: "Bug",
      labels: ["payment", "urgent"],
      createdDaysAgo: 6,
      updatedDaysAgo: 0,
      comments: [
        { author: "Jane Park", daysAgo: 5, body: "재현 단계 정리해서 첨부했어요." },
        { author: "Demo User", daysAgo: 0, body: "JWT 만료 로직에서 끊기는 것 확인. 곧 PR 올립니다." },
      ],
    }),
    makeIssue({
      baseUrl,
      key: "PROJ-102",
      summary: "사용자 프로필 페이지 리디자인",
      status: "To Do",
      assignee: "Soyeon Lee",
      reporter: "Demo User",
      priority: "Medium",
      issuetype: "Story",
      labels: ["frontend", "design"],
      createdDaysAgo: 3,
      updatedDaysAgo: 2,
    }),
    makeIssue({
      baseUrl,
      key: "PROJ-103",
      summary: "GraphQL 스키마 v2 마이그레이션 계획",
      status: "In Review",
      assignee: "Minho Kim",
      reporter: "Demo User",
      priority: "Medium",
      issuetype: "Task",
      labels: ["backend"],
      createdDaysAgo: 10,
      updatedDaysAgo: 1,
      comments: [
        { author: "Minho Kim", daysAgo: 1, body: "PoC 브랜치 푸시했습니다. 리뷰 부탁드려요." },
      ],
    }),
    makeIssue({
      baseUrl,
      key: "PROJ-104",
      summary: "회원 가입 플로우 A/B 테스트",
      status: "Resolved",
      assignee: "Demo User",
      reporter: "Alex Wong",
      priority: "Low",
      issuetype: "Story",
      labels: ["growth"],
      createdDaysAgo: 21,
      updatedDaysAgo: 2,
      resolved: true,
      comments: [
        { author: "Demo User", daysAgo: 2, body: "결과 분석 완료. variant B가 12% 개선." },
      ],
    }),
    makeIssue({
      baseUrl,
      key: "BUG-501",
      summary: "iOS Safari에서 컴포넌트가 깜빡거림",
      status: "In Progress",
      assignee: "Demo User",
      reporter: "Jane Park",
      priority: "High",
      issuetype: "Bug",
      labels: ["frontend", "ios"],
      createdDaysAgo: 4,
      updatedDaysAgo: 0,
      comments: [
        { author: "Demo User", daysAgo: 0, body: "transform 적용 시 will-change 누락이 원인 같음." },
      ],
    }),
    makeIssue({
      baseUrl,
      key: "BUG-502",
      summary: "리포트 PDF 한글 폰트 깨짐",
      status: "Done",
      assignee: "Alex Wong",
      reporter: "Soyeon Lee",
      priority: "Medium",
      issuetype: "Bug",
      labels: ["reporting"],
      createdDaysAgo: 30,
      updatedDaysAgo: 14,
      resolved: true,
      comments: [
        { author: "Alex Wong", daysAgo: 14, body: "Pretendard 임베딩으로 해결." },
      ],
    }),
    makeIssue({
      baseUrl,
      key: "BUG-503",
      summary: "관리자 검색 결과 정렬 불일치",
      status: "To Do",
      assignee: null,
      reporter: "Demo User",
      priority: "Low",
      issuetype: "Bug",
      labels: ["admin"],
      createdDaysAgo: 1,
      updatedDaysAgo: 1,
    }),
  ];
}

function seedTeamB(baseUrl: string): Issue[] {
  return [
    makeIssue({
      baseUrl,
      key: "FEAT-12",
      summary: "다국어 지원 (i18n) 도입",
      status: "In Progress",
      assignee: "Demo User",
      reporter: "Jane Park",
      priority: "High",
      issuetype: "Story",
      labels: ["i18n", "platform"],
      createdDaysAgo: 8,
      updatedDaysAgo: 0,
      comments: [
        { author: "Jane Park", daysAgo: 7, body: "라이브러리 후보: react-intl, lingui, i18next" },
        { author: "Demo User", daysAgo: 0, body: "lingui로 결정. PR 분할 진행 중." },
      ],
    }),
    makeIssue({
      baseUrl,
      key: "FEAT-13",
      summary: "다크 모드 토글",
      status: "Done",
      assignee: "Soyeon Lee",
      reporter: "Demo User",
      priority: "Medium",
      issuetype: "Story",
      labels: ["ui"],
      createdDaysAgo: 18,
      updatedDaysAgo: 7,
      resolved: true,
      comments: [{ author: "Soyeon Lee", daysAgo: 7, body: "릴리즈 완료. v1.4.0." }],
    }),
    makeIssue({
      baseUrl,
      key: "FEAT-14",
      summary: "엔터프라이즈 SSO (SAML) 지원",
      status: "To Do",
      assignee: "Minho Kim",
      reporter: "Alex Wong",
      priority: "High",
      issuetype: "Story",
      labels: ["security", "enterprise"],
      createdDaysAgo: 2,
      updatedDaysAgo: 2,
    }),
    makeIssue({
      baseUrl,
      key: "FEAT-15",
      summary: "감사 로그 보존 기간 90일로 연장",
      status: "Resolved",
      assignee: "Demo User",
      reporter: "Soyeon Lee",
      priority: "Medium",
      issuetype: "Task",
      labels: ["compliance"],
      createdDaysAgo: 14,
      updatedDaysAgo: 3,
      resolved: true,
      comments: [
        { author: "Demo User", daysAgo: 3, body: "운영 DB에 인덱스 추가하고 cron 변경 완료." },
      ],
    }),
    makeIssue({
      baseUrl,
      key: "FEAT-16",
      summary: "온보딩 체크리스트 UI",
      status: "In Review",
      assignee: "Soyeon Lee",
      reporter: "Demo User",
      priority: "Low",
      issuetype: "Story",
      labels: ["growth", "ui"],
      createdDaysAgo: 5,
      updatedDaysAgo: 1,
    }),
  ];
}

function filterByJql(issues: Issue[], jql: string): Issue[] {
  if (!jql || !jql.trim()) return issues;
  const q = jql;
  let result = [...issues];

  const projectMatch = q.match(/\bproject\s*=\s*["']?([A-Z][A-Z0-9_]*)["']?/i);
  if (projectMatch) {
    const proj = projectMatch[1].toUpperCase();
    result = result.filter((i) => i.key.startsWith(`${proj}-`));
  }

  const statusIn = q.match(/\bstatus\s+in\s*\(([^)]+)\)/i);
  if (statusIn) {
    const values = statusIn[1]
      .split(",")
      .map((s) => s.trim().replace(/["']/g, "").toLowerCase());
    result = result.filter((i) => values.includes(i.fields.status.name.toLowerCase()));
  }

  const statusEq = q.match(/\bstatus\s*=\s*["']?([^"'\s)]+(?:\s+[^"'\s)]+)*)["']?/i);
  if (statusEq && !statusIn) {
    const v = statusEq[1].trim().toLowerCase();
    result = result.filter((i) => i.fields.status.name.toLowerCase() === v);
  }

  const statusNe = q.match(/\bstatus\s*!=\s*["']?([^"'\s)]+(?:\s+[^"'\s)]+)*)["']?/i);
  if (statusNe) {
    const v = statusNe[1].trim().toLowerCase();
    result = result.filter((i) => i.fields.status.name.toLowerCase() !== v);
  }

  if (/\bassignee\s*=\s*currentUser\(\s*\)/i.test(q)) {
    result = result.filter((i) => i.fields.assignee?.displayName === "Demo User");
  }

  if (/\bresolution\s*=\s*Unresolved/i.test(q)) {
    result = result.filter((i) => !i.fields.resolutiondate);
  }

  const order = q.match(/ORDER\s+BY\s+(\w+)\s+(ASC|DESC)?/i);
  if (order) {
    const field = order[1].toLowerCase();
    const desc = (order[2] ?? "DESC").toUpperCase() === "DESC";
    result.sort((a, b) => {
      const av = (a.fields as Record<string, unknown>)[field] ?? a.fields.updated;
      const bv = (b.fields as Record<string, unknown>)[field] ?? b.fields.updated;
      const cmp = String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
  } else {
    result.sort((a, b) => b.fields.updated.localeCompare(a.fields.updated));
  }
  return result;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function startServer(opts: { port: number; name: string; issues: (baseUrl: string) => Issue[] }) {
  const baseUrl = `http://localhost:${opts.port}`;
  const issues = opts.issues(baseUrl);
  const issueMap = new Map(issues.map((i) => [i.key, i]));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", baseUrl);
    if (!req.headers.authorization) {
      jsonResponse(res, 401, { errorMessages: ["Authentication required"], errors: {} });
      return;
    }
    if (url.pathname === "/rest/api/2/myself" && req.method === "GET") {
      jsonResponse(res, 200, {
        name: "demo.user",
        displayName: "Demo User",
        emailAddress: "demo.user@example.com",
      });
      return;
    }
    if (url.pathname === "/rest/api/2/search" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const parsed = body ? (JSON.parse(body) as { jql?: string; startAt?: number; maxResults?: number }) : {};
        const filtered = filterByJql(issues, parsed.jql ?? "");
        const startAt = parsed.startAt ?? 0;
        const maxResults = parsed.maxResults ?? 50;
        const page = filtered.slice(startAt, startAt + maxResults);
        jsonResponse(res, 200, {
          startAt,
          maxResults,
          total: filtered.length,
          issues: page,
        });
      } catch (err) {
        jsonResponse(res, 400, {
          errorMessages: [`JQL error: ${(err as Error).message}`],
          errors: {},
        });
      }
      return;
    }
    const issueMatch = url.pathname.match(/^\/rest\/api\/2\/issue\/([A-Z][A-Z0-9_]*-\d+)$/i);
    if (issueMatch && req.method === "GET") {
      const issue = issueMap.get(issueMatch[1].toUpperCase());
      if (!issue) {
        jsonResponse(res, 404, { errorMessages: [`Issue ${issueMatch[1]} not found`], errors: {} });
        return;
      }
      jsonResponse(res, 200, issue);
      return;
    }
    if (url.pathname === "/browse" || url.pathname.startsWith("/browse/")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><h1>${opts.name}</h1><p>Mock Jira. Issue: ${url.pathname}</p></body></html>`);
      return;
    }
    jsonResponse(res, 404, { errorMessages: ["Not found"], errors: {} });
  });

  server.listen(opts.port, () => {
    console.log(`[mock-jira] ${opts.name} ready at ${baseUrl} (${issues.length} issues)`);
  });
  return server;
}

const teamA = startServer({ port: 4567, name: "Team A Jira", issues: seedTeamA });
const teamB = startServer({ port: 4568, name: "Team B Jira", issues: seedTeamB });

console.log("\nNext steps:");
console.log("  1) Open http://localhost:3000/settings/servers and add both servers:");
console.log("       Team A Jira  →  http://localhost:4567   (PAT: any-token-works)");
console.log("       Team B Jira  →  http://localhost:4568   (PAT: any-token-works)");
console.log("  2) Create a dashboard with JQL like:");
console.log('       Team A:  project = PROJ AND status != Done ORDER BY updated DESC');
console.log('       Team B:  assignee = currentUser()');
console.log("  3) Or paste a few URLs to test the URL-source mode.\n");

function shutdown() {
  console.log("\n[mock-jira] shutting down…");
  teamA.close();
  teamB.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
