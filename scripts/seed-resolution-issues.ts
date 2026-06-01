/**
 * Seed 10 evaluation issues into an Atlassian Cloud project for the
 * resolution-time dashboard. Credentials are pulled from the local app DB
 * (whichever Cloud server you already registered at /settings/servers).
 *
 * Usage:
 *   JIRA_PROJECT_KEY=SCRUM npm run seed-resolution-issues
 *
 * Note on resolution times: Jira Cloud's REST API does NOT allow back-dating
 * `created`. Issues we resolve immediately will have resolution_time ≈ 0,
 * which lands them all in the smallest histogram bin. For a meaningful
 * resolution-time distribution you have two options:
 *   1) Let real time pass and manually resolve issues over days/weeks
 *   2) Use the mock-jira server (`npm run mock-jira`) which already has
 *      100 synthetic issues with a realistic resolution-time distribution
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { decrypt } from "../lib/crypto";

/* -------------------- env loading -------------------- */

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    const value = m[2].replace(/^['"]|['"]$/g, "");
    process.env[m[1]] = value;
  }
}

if (!process.env.APP_ENCRYPTION_KEY) {
  console.error("APP_ENCRYPTION_KEY not set. Cannot decrypt stored credentials.");
  process.exit(1);
}

const PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? "SCRUM";

/* -------------------- read credentials from app DB -------------------- */

type ServerRow = {
  id: string;
  name: string;
  base_url: string;
  auth_type: string;
  encrypted_credentials: string;
};

const dbPath = path.join(process.cwd(), "data", "app.db");
const db = new Database(dbPath, { readonly: true });
const cloudServer = db
  .prepare<unknown[], ServerRow>(
    `SELECT id, name, base_url, auth_type, encrypted_credentials
     FROM jira_servers
     WHERE base_url LIKE '%.atlassian.net%' OR base_url LIKE '%.atlassian.com%'
     LIMIT 1`,
  )
  .get();
db.close();

if (!cloudServer) {
  console.error(
    "No Atlassian Cloud server registered. Add one in /settings/servers first.",
  );
  process.exit(1);
}

const plain = decrypt(cloudServer.encrypted_credentials);
const creds = JSON.parse(plain) as { email?: string; token?: string };
if (!creds.email || !creds.token) {
  console.error(`Invalid credentials for server "${cloudServer.name}".`);
  process.exit(1);
}

const baseUrl = cloudServer.base_url.replace(/\/$/, "");
const auth =
  "Basic " + Buffer.from(`${creds.email}:${creds.token}`).toString("base64");

console.log(
  `\n[seed] target=${baseUrl}  project=${PROJECT_KEY}  user=${creds.email}\n`,
);

/* -------------------- Jira API helpers -------------------- */

async function api<T>(p: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl}${p}`, {
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
    throw new Error(
      `${init.method ?? "GET"} ${p} → ${res.status} ${res.statusText} ${text.slice(0, 400)}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type IssueTypeMeta = { id: string; name: string; subtask: boolean };

async function fetchIssueTypes(): Promise<IssueTypeMeta[]> {
  try {
    const meta = await api<{
      projects?: Array<{ issuetypes?: IssueTypeMeta[] }>;
    }>(`/rest/api/2/issue/createmeta?projectKeys=${PROJECT_KEY}`);
    return meta.projects?.[0]?.issuetypes?.filter((t) => !t.subtask) ?? [];
  } catch {
    return [];
  }
}

async function createIssue(input: {
  summary: string;
  description: string;
  priority?: "High" | "Medium" | "Low";
  labels: string[];
  issueTypeName: string;
}): Promise<{ key: string }> {
  const fields: Record<string, unknown> = {
    project: { key: PROJECT_KEY },
    summary: input.summary,
    description: input.description,
    issuetype: { name: input.issueTypeName },
    labels: input.labels,
  };
  if (input.priority) fields.priority = { name: input.priority };
  return api<{ key: string }>("/rest/api/2/issue", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
}

async function addComment(key: string, body: string): Promise<void> {
  await api(`/rest/api/2/issue/${encodeURIComponent(key)}/comment`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function transitionToDone(key: string): Promise<boolean> {
  const r = await api<{
    transitions: Array<{
      id: string;
      name: string;
      to: { name: string; statusCategory: { key: string } };
    }>;
  }>(`/rest/api/2/issue/${encodeURIComponent(key)}/transitions`);
  // Prefer the first transition that lands in the "done" category.
  const done = r.transitions.find(
    (t) => t.to.statusCategory?.key === "done",
  );
  if (!done) return false;
  await api(`/rest/api/2/issue/${encodeURIComponent(key)}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: done.id } }),
  });
  return true;
}

/* -------------------- 10 evaluation drafts -------------------- */

type Draft = {
  summary: string;
  description: string;
  priority?: "High" | "Medium" | "Low";
  labels: string[];
  preferredTypes: string[]; // ordered preference
  resolve: boolean;
  comment?: string;
};

const DRAFTS: Draft[] = [
  {
    summary: "[평가] 결제 검증 로직 timeout 이슈",
    description:
      "외부 PG 응답이 5초 이상 걸릴 때 결제가 timeout으로 실패. 재시도 로직과 비동기 콜백 처리 필요.",
    priority: "High",
    labels: ["evaluation", "payment", "backend"],
    preferredTypes: ["Bug", "Task"],
    resolve: true,
    comment: "PG 측 응답 분포 측정 후 5초 → 15초로 timeout 상향, 비동기 큐 추가.",
  },
  {
    summary: "[평가] 다크 모드 전환 시 깜빡임",
    description:
      "초기 로드 시 라이트 모드가 잠깐 보였다가 다크로 전환됨. SSR에서 테마 정보가 누락되는 것으로 추정.",
    priority: "Low",
    labels: ["evaluation", "ui", "frontend"],
    preferredTypes: ["Bug", "Task"],
    resolve: true,
  },
  {
    summary: "[평가] API rate limit 보강",
    description:
      "외부 API 호출 빈도 제어 미흡으로 간헐적 429 발생. Token bucket 또는 Leaky bucket 알고리즘 검토.",
    priority: "Medium",
    labels: ["evaluation", "infra", "backend"],
    preferredTypes: ["Task"],
    resolve: true,
  },
  {
    summary: "[평가] 사용자 권한 마이그레이션",
    description:
      "기존 ad-hoc 권한 체크를 RBAC 모델로 통합. 마이그레이션 스크립트 + dry-run 모드 + 롤백 절차 필요.",
    priority: "High",
    labels: ["evaluation", "security", "backend", "tech-debt"],
    preferredTypes: ["Task", "Story"],
    resolve: false,
  },
  {
    summary: "[평가] 검색 자동완성 인덱스 빌드 시간 단축",
    description:
      "야간 인덱스 풀 빌드가 약 3시간 소요. 인크리멘탈 빌드 + 우선순위 큐로 단축 검토.",
    priority: "Medium",
    labels: ["evaluation", "perf", "backend"],
    preferredTypes: ["Task"],
    resolve: false,
  },
  {
    summary: "[평가] 모바일 푸시 알림 deeplink 깨짐",
    description:
      "iOS에서 푸시 클릭 시 외부 브라우저가 열림. Universal Link 설정 누락 의심.",
    priority: "High",
    labels: ["evaluation", "mobile", "ios"],
    preferredTypes: ["Bug", "Task"],
    resolve: true,
    comment: "apple-app-site-association 파일 배포 후 정상 동작 확인.",
  },
  {
    summary: "[평가] 어드민 차트 한글 폰트 깨짐",
    description:
      "관리자 통계 페이지의 일부 차트에서 한글이 □□□로 표시됨. 차트 라이브러리 폰트 임베딩 누락.",
    priority: "Medium",
    labels: ["evaluation", "admin", "reporting"],
    preferredTypes: ["Bug", "Task"],
    resolve: false,
  },
  {
    summary: "[평가] 비밀번호 재설정 메일 한글 인코딩",
    description:
      "비밀번호 재설정 메일 본문의 한글이 깨져서 도착. Content-Transfer-Encoding 헤더 확인 필요.",
    priority: "High",
    labels: ["evaluation", "auth", "email"],
    preferredTypes: ["Bug", "Task"],
    resolve: true,
  },
  {
    summary: "[평가] 신규 가입 온보딩 UX 개선",
    description:
      "온보딩 완료율 30%로 낮음. 단계 축소 + 진행도 표시 + 스킵 옵션 추가에 대한 A/B 테스트 진행.",
    priority: "Low",
    labels: ["evaluation", "growth", "ux"],
    preferredTypes: ["Story", "Task"],
    resolve: false,
  },
  {
    summary: "[평가] 결제 환불 자동화 워크플로",
    description:
      "환불 정책에 부합하는 케이스의 자동 처리. CS 운영 부담 50% 감소 목표.",
    priority: "Medium",
    labels: ["evaluation", "payment", "automation"],
    preferredTypes: ["Story", "Task"],
    resolve: false,
  },
];

/* -------------------- main -------------------- */

async function main(): Promise<void> {
  const types = await fetchIssueTypes();
  if (types.length === 0) {
    console.error(
      `Could not list issue types for project ${PROJECT_KEY}. Check that the project exists and you have access.`,
    );
    process.exit(1);
  }
  const typeByName = new Map(types.map((t) => [t.name, t]));
  console.log(
    `[seed] available issue types: ${types.map((t) => t.name).join(", ")}\n`,
  );

  function pickType(preferred: string[]): string {
    for (const name of preferred) {
      if (typeByName.has(name)) return name;
    }
    return types[0].name;
  }

  let created = 0;
  let resolved = 0;
  const failures: string[] = [];
  for (const draft of DRAFTS) {
    const typeName = pickType(draft.preferredTypes);
    try {
      const result = await createIssue({
        summary: draft.summary,
        description: draft.description,
        priority: draft.priority,
        labels: draft.labels,
        issueTypeName: typeName,
      });
      created++;
      console.log(`✓ ${result.key.padEnd(12)} [${typeName}] ${draft.summary}`);
      if (draft.comment) {
        try {
          await addComment(result.key, draft.comment);
        } catch (e) {
          console.warn(`  ! comment failed: ${(e as Error).message}`);
        }
      }
      if (draft.resolve) {
        try {
          const ok = await transitionToDone(result.key);
          if (ok) {
            resolved++;
            console.log(`  → transitioned to Done`);
          } else {
            console.log(`  ! no Done transition available`);
          }
        } catch (e) {
          console.warn(`  ! transition failed: ${(e as Error).message}`);
        }
      }
    } catch (err) {
      failures.push(`${draft.summary}: ${(err as Error).message}`);
      console.error(`✗ ${draft.summary}\n     ${(err as Error).message}`);
    }
  }

  console.log(
    `\n[seed] done. created=${created}/${DRAFTS.length}  resolved=${resolved}  failed=${failures.length}\n`,
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\n[seed] fatal:", err);
  process.exit(1);
});
