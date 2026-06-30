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

type ChangelogHistory = {
  id: string;
  created: string;
  items: Array<{
    field: string;
    fieldtype: string;
    fromString: string | null;
    toString: string | null;
  }>;
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
    // Synthetic custom fields so cf[NNNNN] JQL can be exercised locally.
    customfield_10016?: number | null; // Story Points
    customfield_10050?: { value: string } | null; // 운영체제 (single select)
  };
  changelog?: { startAt: number; maxResults: number; total: number; histories: ChangelogHistory[] };
};

// Canonical status flow used to synthesize a plausible transition history.
const STATUS_FLOW = ["To Do", "In Progress", "In Review"];

/**
 * Build a synthetic status changelog: the issue starts in "To Do" at
 * creation and walks the canonical flow up to its final status, with
 * transition timestamps spread evenly between created and the end time
 * (resolved date when resolved, otherwise last-updated). Issues that never
 * left "To Do" get an empty history.
 */
function buildChangelog(
  createdIso: string,
  endIso: string,
  finalStatus: string,
): ChangelogHistory[] {
  const path: string[] = [];
  for (const s of STATUS_FLOW) {
    path.push(s);
    if (s === finalStatus) break;
  }
  // If the final status isn't a mid-flow one (Done/Closed/Resolved), append it
  // after walking the full flow.
  if (path[path.length - 1] !== finalStatus) {
    if (!STATUS_FLOW.includes(finalStatus)) path.push(finalStatus);
  }
  if (path.length <= 1) return [];

  const createdMs = Date.parse(createdIso);
  const endMs = Date.parse(endIso);
  const span = Math.max(0, endMs - createdMs);
  const steps = path.length - 1;
  const histories: ChangelogHistory[] = [];
  for (let i = 1; i < path.length; i++) {
    const at = new Date(createdMs + (span * i) / steps).toISOString();
    histories.push({
      id: String(30000 + i),
      created: at,
      items: [
        {
          field: "status",
          fieldtype: "jira",
          fromString: path[i - 1],
          toString: path[i],
        },
      ],
    });
  }
  return histories;
}

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
  "Hyunwoo Choi",
  "Yejin Han",
  "Daniel Garcia",
];

let idCounter = 10001;

function nextId(): string {
  return String(idCounter++);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
}

/* ------------------------------------------------------------------------
 * Deterministic randomization helpers — keeps the generated dataset stable
 * across mock-jira restarts so screenshots / regression checks are useful.
 * ---------------------------------------------------------------------- */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted<T>(
  rng: () => number,
  items: ReadonlyArray<{ value: T; weight: number }>,
): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    if (r < it.weight) return it.value;
    r -= it.weight;
  }
  return items[items.length - 1].value;
}

/* ------------------------------------------------------------------------
 * Distribution tables — tuned so the resolution-time dashboard is visually
 * interesting: a long tail of slow issues, most resolved within a week, a
 * meaningful sprinkle of quick-fix bugs.
 * ---------------------------------------------------------------------- */

type Range = readonly [number, number];

const RESOLUTION_HOURS_BUCKETS: ReadonlyArray<{ value: Range; weight: number }> = [
  { value: [1, 8], weight: 20 }, // quick fix (< 1d)
  { value: [8, 24], weight: 25 }, // same day
  { value: [24, 72], weight: 25 }, // 1–3d
  { value: [72, 168], weight: 15 }, // 3–7d
  { value: [168, 336], weight: 10 }, // 1–2w
  { value: [336, 720], weight: 4 }, // 2w–1mo
  { value: [720, 2880], weight: 1 }, // 1–4mo long tail
];

const RESOLVED_AGE_DAYS: ReadonlyArray<{ value: Range; weight: number }> = [
  { value: [0, 30], weight: 40 },
  { value: [30, 60], weight: 30 },
  { value: [60, 120], weight: 20 },
  { value: [120, 180], weight: 10 },
];

const ISSUE_TYPE_WEIGHTS = [
  { value: "Bug", weight: 40 },
  { value: "Story", weight: 30 },
  { value: "Task", weight: 20 },
  { value: "Epic", weight: 10 },
];

const PRIORITY_WEIGHTS = [
  { value: "Highest", weight: 10 },
  { value: "High", weight: 25 },
  { value: "Medium", weight: 40 },
  { value: "Low", weight: 20 },
  { value: "Lowest", weight: 5 },
];

const STATUS_RESOLVED = ["Done", "Closed", "Resolved"] as const;
const STATUS_UNRESOLVED = ["To Do", "In Progress", "In Review"] as const;

const LABELS_POOL = [
  "frontend",
  "backend",
  "infra",
  "design",
  "ux",
  "payment",
  "auth",
  "i18n",
  "perf",
  "security",
  "mobile",
  "ios",
  "android",
  "admin",
  "growth",
  "reporting",
  "compliance",
  "urgent",
  "tech-debt",
  "refactor",
  "windows",
  "linux",
  "macos",
];

const COMPONENTS = [
  "결제 모듈",
  "로그인",
  "검색",
  "관리자 페이지",
  "리포트",
  "대시보드",
  "알림 시스템",
  "사용자 프로필",
  "온보딩",
  "권한 관리",
  "API",
  "이메일 발송",
  "통계",
  "차트",
  "캘린더",
  "댓글",
  "파일 업로드",
  "푸시 알림",
  "결제 환불",
];

const SUMMARY_TEMPLATES: Array<(c: string) => string> = [
  (c) => `${c} 성능 개선`,
  (c) => `${c} 버그 수정`,
  (c) => `${c} 리팩토링`,
  (c) => `${c} 신규 기능 추가`,
  (c) => `${c} 디자인 업데이트`,
  (c) => `${c} 에러 핸들링 보강`,
  (c) => `${c} 접근성 개선`,
  (c) => `${c} 로그 추가`,
  (c) => `${c} 테스트 커버리지 향상`,
  (c) => `${c} 응답 시간 단축`,
];

function generateBulkIssues(opts: {
  projectKey: string;
  baseUrl: string;
  startKey: number;
  count: number;
  seed: number;
}): Issue[] {
  const rng = mulberry32(opts.seed);
  const out: Issue[] = [];
  for (let i = 0; i < opts.count; i++) {
    const key = `${opts.projectKey}-${opts.startKey + i}`;
    const isResolved = rng() < 0.7;
    const summary = pick(rng, SUMMARY_TEMPLATES)(pick(rng, COMPONENTS));
    const issuetype = pickWeighted(rng, ISSUE_TYPE_WEIGHTS);
    const priority = pickWeighted(rng, PRIORITY_WEIGHTS);

    const labelCount = Math.floor(rng() * 3); // 0–2 labels
    const labels: string[] = [];
    for (let j = 0; j < labelCount; j++) {
      const lbl = pick(rng, LABELS_POOL);
      if (!labels.includes(lbl)) labels.push(lbl);
    }

    const assignee = rng() < 0.88 ? pick(rng, USERS) : null;
    const reporter = pick(rng, USERS);

    let createdDaysAgo: number;
    let updatedDaysAgo: number;
    let status: keyof typeof STATUS_CATEGORIES;

    if (isResolved) {
      const [hMin, hMax] = pickWeighted(rng, RESOLUTION_HOURS_BUCKETS);
      const resolutionHours = hMin + rng() * (hMax - hMin);
      const [aMin, aMax] = pickWeighted(rng, RESOLVED_AGE_DAYS);
      const resolvedDaysAgo = aMin + rng() * (aMax - aMin);
      updatedDaysAgo = resolvedDaysAgo;
      createdDaysAgo = resolvedDaysAgo + resolutionHours / 24;
      status = pick(rng, STATUS_RESOLVED);
    } else {
      createdDaysAgo = rng() * 90;
      updatedDaysAgo = Math.max(
        0,
        createdDaysAgo * (0.2 + rng() * 0.6),
      );
      status = pick(rng, STATUS_UNRESOLVED);
    }

    const issue = makeIssue({
      baseUrl: opts.baseUrl,
      key,
      summary,
      status,
      assignee,
      reporter,
      priority,
      issuetype,
      labels,
      createdDaysAgo,
      updatedDaysAgo,
      resolved: isResolved,
    });
    // Synthetic custom fields: Story Points (Fibonacci) and OS (single select).
    issue.fields.customfield_10016 = pick(rng, [1, 2, 3, 5, 8, 13]);
    issue.fields.customfield_10050 =
      rng() < 0.6 ? { value: pick(rng, ["Windows", "Linux", "macOS"]) } : null;
    out.push(issue);
  }
  return out;
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
  const createdIso = daysAgo(input.createdDaysAgo);
  const updatedIso = daysAgo(input.updatedDaysAgo);
  const resolutiondate = input.resolved ? updatedIso : null;
  const histories = buildChangelog(
    createdIso,
    resolutiondate ?? updatedIso,
    input.status,
  );
  return {
    id: nextId(),
    key: input.key,
    self: `${input.baseUrl}/rest/api/2/issue/${input.key}`,
    fields: {
      summary: input.summary,
      status: { name: input.status, statusCategory: cat },
      assignee: input.assignee === null ? null : { displayName: input.assignee ?? "Demo User" },
      reporter: { displayName: input.reporter ?? "Demo User" },
      created: createdIso,
      updated: updatedIso,
      resolutiondate,
      priority: input.priority ? { name: input.priority } : { name: "Medium" },
      issuetype: { name: input.issuetype ?? "Task" },
      labels: input.labels ?? [],
      comment: { comments, total: comments.length, maxResults: comments.length, startAt: 0 },
    },
    changelog: {
      startAt: 0,
      maxResults: histories.length,
      total: histories.length,
      histories,
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
    ...generateBulkIssues({
      baseUrl,
      projectKey: "PROJ",
      startKey: 1001,
      count: 250,
      seed: 0xa5a5a5,
    }),
    ...generateBulkIssues({
      baseUrl,
      projectKey: "BUG",
      startKey: 1001,
      count: 100,
      seed: 0x424242,
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
    ...generateBulkIssues({
      baseUrl,
      projectKey: "FEAT",
      startKey: 1001,
      count: 150,
      seed: 0xfeed42,
    }),
  ];
}

/**
 * Mimic Jira's `fields` projection on the search/issue responses. Caller
 * passes a list like `["summary", "status", ...]`; we drop fields not in
 * the list. When `fields` is undefined we return the issue unchanged.
 */
function projectFields(issue: Issue, fields: string[] | undefined): Issue {
  // changelog is never part of a `fields` projection — it rides on the
  // top-level `expand`, so drop it from field-limited responses.
  const { changelog: _drop, ...rest } = issue;
  void _drop;
  if (!fields || fields.length === 0) return rest;
  // `*all` / `*navigable` → return every field (including custom fields).
  if (fields.includes("*all") || fields.includes("*navigable")) return rest;
  const include = new Set(fields);
  const f = issue.fields;
  const filtered = {} as Issue["fields"];
  if (include.has("summary")) filtered.summary = f.summary;
  if (include.has("status")) filtered.status = f.status;
  if (include.has("assignee")) filtered.assignee = f.assignee;
  if (include.has("reporter")) filtered.reporter = f.reporter;
  if (include.has("created")) filtered.created = f.created;
  if (include.has("updated")) filtered.updated = f.updated;
  if (include.has("resolutiondate")) filtered.resolutiondate = f.resolutiondate;
  if (include.has("priority")) filtered.priority = f.priority;
  if (include.has("issuetype")) filtered.issuetype = f.issuetype;
  if (include.has("labels")) filtered.labels = f.labels;
  if (include.has("comment")) filtered.comment = f.comment;
  // Pass through any explicitly-requested custom fields.
  for (const key of fields) {
    if (key.startsWith("customfield_")) {
      (filtered as Record<string, unknown>)[key] = (
        f as Record<string, unknown>
      )[key];
    }
  }
  return { ...rest, fields: filtered };
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

  // resolutiondate IS [NOT] EMPTY  (alias: resolved IS [NOT] EMPTY)
  if (/\b(resolutiondate|resolved)\s+is\s+not\s+empty\b/i.test(q)) {
    result = result.filter((i) => !!i.fields.resolutiondate);
  } else if (/\b(resolutiondate|resolved)\s+is\s+empty\b/i.test(q)) {
    result = result.filter((i) => !i.fields.resolutiondate);
  }

  // Time-bounded filters. We support the two forms most commonly seen in JQL
  // for trending dashboards:
  //   resolved >= -90d      (relative offset)
  //   resolved >= "2026-01-01"   (absolute ISO date)
  // Plus the matching <=, and the field aliases resolved/resolutiondate,
  // created, updated.
  const TIME_FIELDS: Record<string, (i: Issue) => string | null | undefined> = {
    resolved: (i) => i.fields.resolutiondate,
    resolutiondate: (i) => i.fields.resolutiondate,
    created: (i) => i.fields.created,
    updated: (i) => i.fields.updated,
  };
  const timeRegex =
    /\b(resolved|resolutiondate|created|updated)\s*(>=|<=|>|<)\s*(-?\d+d|"[^"]+"|'[^']+'|[0-9-]+T?[0-9:.-]*Z?)/gi;
  let m: RegExpExecArray | null;
  while ((m = timeRegex.exec(q))) {
    const field = m[1].toLowerCase() as keyof typeof TIME_FIELDS;
    const op = m[2];
    const raw = m[3].replace(/^["']|["']$/g, "");
    let boundary: number;
    const rel = raw.match(/^-(\d+)d$/i);
    if (rel) {
      boundary = Date.now() - Number(rel[1]) * 24 * 3600 * 1000;
    } else {
      const t = Date.parse(raw);
      if (Number.isNaN(t)) continue;
      boundary = t;
    }
    const getter = TIME_FIELDS[field];
    result = result.filter((i) => {
      const v = getter(i);
      if (!v) return false;
      const t = Date.parse(v);
      if (Number.isNaN(t)) return false;
      if (op === ">=") return t >= boundary;
      if (op === ">") return t > boundary;
      if (op === "<=") return t <= boundary;
      if (op === "<") return t < boundary;
      return true;
    });
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

/**
 * Artificial latency (dev/demo only). Set `MOCK_JIRA_DELAY_MS` to slow every
 * `/search` response so the resolution dashboard's load progress bar is
 * actually visible (it's otherwise instant locally). Larger result sets take a
 * little longer (base + per-row), so count calls (0 rows) return first — the
 * plan/denominator lands before the page fetches and the determinate bar
 * climbs visibly instead of snapping straight to 100%. Defaults to 0 (off).
 */
const MOCK_DELAY_MS = Math.max(0, Number(process.env.MOCK_JIRA_DELAY_MS) || 0);
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
function searchLatency(rowCount: number): number {
  if (MOCK_DELAY_MS <= 0) return 0;
  return MOCK_DELAY_MS + rowCount * Math.max(1, Math.round(MOCK_DELAY_MS / 150));
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
        const parsed = body
          ? (JSON.parse(body) as {
              jql?: string;
              startAt?: number;
              maxResults?: number;
              fields?: string[];
            })
          : {};
        const filtered = filterByJql(issues, parsed.jql ?? "");
        const startAt = parsed.startAt ?? 0;
        const maxResults = parsed.maxResults ?? 50;
        const page = filtered
          .slice(startAt, startAt + maxResults)
          .map((iss) => projectFields(iss, parsed.fields));
        await sleep(searchLatency(page.length));
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
      const fieldsParam = url.searchParams.get("fields");
      const fields = fieldsParam ? fieldsParam.split(",") : undefined;
      const expand = (url.searchParams.get("expand") ?? "").split(",");
      const projected = projectFields(issue, fields);
      // Re-attach changelog only when the caller asked for it via expand.
      if (expand.includes("changelog")) {
        projected.changelog = issue.changelog;
      }
      jsonResponse(res, 200, projected);
      return;
    }
    // Edit issue (subset): only the `labels` field, used by inline label
    // editing. Returns 204 No Content like real Jira.
    if (issueMatch && req.method === "PUT") {
      const issue = issueMap.get(issueMatch[1].toUpperCase());
      if (!issue) {
        jsonResponse(res, 404, { errorMessages: [`Issue ${issueMatch[1]} not found`], errors: {} });
        return;
      }
      try {
        const body = await readBody(req);
        const parsed = body
          ? (JSON.parse(body) as { fields?: { labels?: string[] } })
          : {};
        if (Array.isArray(parsed.fields?.labels)) {
          const labels = parsed.fields.labels;
          if (labels.some((l) => /\s/.test(l))) {
            jsonResponse(res, 400, {
              errorMessages: [],
              errors: { labels: "A label cannot contain spaces." },
            });
            return;
          }
          issue.fields.labels = labels;
        }
        res.statusCode = 204;
        res.end();
      } catch (err) {
        jsonResponse(res, 400, {
          errorMessages: [`Edit error: ${(err as Error).message}`],
          errors: {},
        });
      }
      return;
    }
    // Dedicated paginated changelog endpoint (Jira Cloud style).
    const changelogMatch = url.pathname.match(
      /^\/rest\/api\/2\/issue\/([A-Z][A-Z0-9_]*-\d+)\/changelog$/i,
    );
    if (changelogMatch && req.method === "GET") {
      const issue = issueMap.get(changelogMatch[1].toUpperCase());
      if (!issue) {
        jsonResponse(res, 404, {
          errorMessages: [`Issue ${changelogMatch[1]} not found`],
          errors: {},
        });
        return;
      }
      const histories = issue.changelog?.histories ?? [];
      jsonResponse(res, 200, {
        startAt: 0,
        maxResults: histories.length,
        total: histories.length,
        isLast: true,
        values: histories,
      });
      return;
    }
    const commentMatch = url.pathname.match(
      /^\/rest\/api\/2\/issue\/([A-Z][A-Z0-9_]*-\d+)\/comment$/i,
    );
    if (commentMatch && req.method === "GET") {
      const issue = issueMap.get(commentMatch[1].toUpperCase());
      if (!issue) {
        jsonResponse(res, 404, {
          errorMessages: [`Issue ${commentMatch[1]} not found`],
          errors: {},
        });
        return;
      }
      const comments = issue.fields.comment.comments;
      const orderBy = url.searchParams.get("orderBy") ?? "created";
      const maxResults = Number(url.searchParams.get("maxResults") ?? 100);
      const sorted = [...comments].sort((a, b) => {
        const av = Date.parse(a.created);
        const bv = Date.parse(b.created);
        return orderBy === "-created" ? bv - av : av - bv;
      });
      const page = sorted.slice(0, maxResults);
      jsonResponse(res, 200, {
        startAt: 0,
        maxResults,
        total: comments.length,
        comments: page,
      });
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

if (MOCK_DELAY_MS > 0) {
  console.log(
    `\n[mock-jira] artificial latency ON: MOCK_JIRA_DELAY_MS=${MOCK_DELAY_MS}ms ` +
      `(+${Math.max(1, Math.round(MOCK_DELAY_MS / 150))}ms/issue) — /search slowed for progress-bar testing`,
  );
}

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
