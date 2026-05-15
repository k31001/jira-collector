/**
 * Seed a Jira Cloud project with 5 evaluation Bug issues + some comments.
 * For demoing jira-collector against a real Cloud instance.
 *
 * Usage:
 *   ATLASSIAN_EMAIL=you@example.com \
 *   ATLASSIAN_TOKEN=<api-token-from-id.atlassian.com> \
 *   JIRA_BASE_URL=https://<your-site>.atlassian.net \
 *   JIRA_PROJECT_KEY=PROJ \
 *   npm run seed-jira-issues
 *
 * If JIRA_PROJECT_KEY is omitted the script prints all visible projects and
 * exits, so you can pick one. If JIRA_BASE_URL is omitted it defaults to
 * https://euihyeokkwon.atlassian.net.
 */

type IssueDraft = {
  summary: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  labels: string[];
  comments?: Array<{ author?: string; body: string }>;
};

const SEED_ISSUES: IssueDraft[] = [
  {
    summary: "[평가] 결제 모듈에서 JWT 만료 시 401 무한 루프",
    description: [
      "* 재현: 토큰 만료 후 /pay/checkout 진입",
      "* 기대: 자동 재발급 + 1회 재시도",
      "* 실제: 401 → 리프레시 실패 → 무한 리다이렉트",
      "",
      "프론트에서 만료 토큰을 한 번 더 보내기 때문으로 추정.",
    ].join("\n"),
    priority: "High",
    labels: ["evaluation", "payment", "auth"],
    comments: [
      { body: "재현 로그 첨부했습니다. /api/refresh 가 401 을 반환할 때 클라이언트가 같은 요청을 또 보냅니다." },
      { body: "interceptor 에 retry 가드 추가 PR 작업 중." },
    ],
  },
  {
    summary: "[평가] 대시보드 컬럼 너비가 새로고침 시 초기화됨",
    description: "사용자가 드래그로 조정한 컬럼 폭이 페이지 새로고침 후 기본값으로 돌아갑니다. 로컬스토리지에 저장 필요.",
    priority: "Low",
    labels: ["evaluation", "ui", "frontend"],
    comments: [
      { body: "localStorage 키: `dashboard:{id}:column-widths` 제안." },
    ],
  },
  {
    summary: "[평가] PDF 리포트 한글 폰트 깨짐 (□□□ 표시)",
    description: [
      "* 영향: 한국어 사용자 전체",
      "* PDF 생성 라이브러리: pdf-lib",
      "* 원인 가설: 한글 임베디드 폰트 미포함",
      "",
      "Pretendard 또는 NotoSansKR 서브셋 임베드 검토.",
    ].join("\n"),
    priority: "Medium",
    labels: ["evaluation", "reporting", "i18n"],
  },
  {
    summary: "[평가] 관리자 검색 결과 정렬이 무작위로 변함",
    description: "동일한 쿼리에 대해 페이지마다 정렬 순서가 달라집니다. ORDER BY 절 누락으로 추정.",
    priority: "Medium",
    labels: ["evaluation", "admin", "backend"],
    comments: [
      { body: "DB 쿼리에서 ORDER BY updated_at DESC 가 누락된 것을 확인했습니다." },
    ],
  },
  {
    summary: "[평가] 대량 이슈 동기화 시 메모리 누수 (Node heap > 1GB)",
    description: [
      "약 5,000개 이슈 동기화 중 Node 프로세스 메모리가 1GB 를 넘어섭니다.",
      "GC 가 동작하지 않는 영역이 있는 것으로 보입니다.",
      "",
      "* 트리거: 야간 동기화 cron",
      "* 영향: OOM 으로 재시작 → 일부 이슈 누락",
    ].join("\n"),
    priority: "High",
    labels: ["evaluation", "performance", "backend", "urgent"],
  },
];

const email = process.env.ATLASSIAN_EMAIL;
const token = process.env.ATLASSIAN_TOKEN;
const baseUrlEnv = process.env.JIRA_BASE_URL ?? "https://euihyeokkwon.atlassian.net";
const projectKey = process.env.JIRA_PROJECT_KEY;
const baseUrl = baseUrlEnv.replace(/\/$/, "");

function die(msg: string): never {
  console.error(`\n[seed-jira-issues] ${msg}\n`);
  process.exit(1);
}

if (!email) die("ATLASSIAN_EMAIL is required.");
if (!token) {
  die(
    "ATLASSIAN_TOKEN is required. Generate at https://id.atlassian.com/manage-profile/security/api-tokens",
  );
}

const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${res.statusText} ${text.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

async function listProjects() {
  const projects = await api<Array<{ key: string; name: string }>>("/rest/api/2/project");
  console.log("\nAvailable projects on", baseUrl, ":\n");
  for (const p of projects) console.log(`  ${p.key.padEnd(12)} ${p.name}`);
  console.log("\nRe-run with JIRA_PROJECT_KEY=<key> to seed issues.\n");
}

type CreatedIssue = { id: string; key: string; self: string };

async function createIssue(draft: IssueDraft): Promise<CreatedIssue> {
  return api<CreatedIssue>("/rest/api/2/issue", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: draft.summary,
        description: draft.description,
        issuetype: { name: "Bug" },
        priority: { name: draft.priority },
        labels: draft.labels,
      },
    }),
  });
}

async function addComment(key: string, body: string) {
  await api(`/rest/api/2/issue/${encodeURIComponent(key)}/comment`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function main() {
  if (!projectKey) {
    await listProjects();
    return;
  }

  console.log(`\n[seed-jira-issues] Target: ${baseUrl}  project=${projectKey}  count=${SEED_ISSUES.length}\n`);

  for (const draft of SEED_ISSUES) {
    try {
      const created = await createIssue(draft);
      console.log(`✓ ${created.key.padEnd(10)} ${draft.summary}`);
      console.log(`     ${baseUrl}/browse/${created.key}`);
      if (draft.comments?.length) {
        for (const c of draft.comments) {
          await addComment(created.key, c.body);
        }
        console.log(`     + ${draft.comments.length} comment(s)`);
      }
    } catch (err) {
      console.error(`✗ ${draft.summary}\n     ${(err as Error).message}`);
    }
  }

  console.log("\nDone. Add the Cloud server in /settings/servers and try JQL:");
  console.log(`     project = ${projectKey} AND labels = evaluation ORDER BY priority DESC\n`);
}

main().catch((err) => {
  console.error("\n[seed-jira-issues] fatal:", err);
  process.exit(1);
});
