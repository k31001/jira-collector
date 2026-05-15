# jira-collector

여러 Jira 서버에 흩어진 이슈를 하나의 테이블에서 모아보고, 이슈별 메모를 클릭으로 편집하며 보고용으로 빠르게 활용하기 위한 로컬 단일 사용자 대시보드.

## 주요 기능

- **멀티 Jira 서버**: 회사/오픈소스/내부 Jira 등을 여러 개 등록
- **JQL 쿼리 + URL 목록**: 한 대시보드에 여러 소스를 자유롭게 조합
- **이슈 테이블**: 필수 컬럼(Key, Status, Summary, 최근 코멘트, 내 메모) + 선택 컬럼(담당자, 보고자, 생성/수정/해결일 등)
- **상태 컬러 코딩 + 커스텀 상태 그룹핑**: "In Progress + Resolved" → "이슈 분석 중"
- **클릭으로 노트 편집**: 인라인 자동저장, Cmd+Enter / Esc 단축키
- **대시보드 CRUD/즐겨찾기/복제**
- **Markdown · CSV 내보내기**
- **Cmd/Ctrl+K 커맨드 팔레트**, 다크모드

## 셋업 (단일 명령)

```bash
npm install
npm run setup        # .env.local 생성 + DB 마이그레이션
npm run dev
```

`localhost:3000` 으로 접속.

`setup` 은 다음을 한 번에 실행합니다:
1. `npm run bootstrap` — `APP_ENCRYPTION_KEY` 생성 후 `.env.local` 기록
2. `npm run db:generate` — 스키마로부터 마이그레이션 SQL 생성 (이미 있다면 skip)
3. `npm run db:migrate` — `data/app.db` 에 마이그레이션 적용

> 첫 실행에서 SQLite 파일이 `data/app.db` 로 생성됩니다. 백업/이동은 이 파일 하나를 옮기면 됩니다.

## Jira 서버가 없어도 데모하기 (Mock Jira)

진짜 Jira 인스턴스가 없어도 전체 흐름을 데모할 수 있도록 두 개의 가짜 Jira 서버를 띄우는 스크립트가 포함되어 있습니다.

```bash
npm run mock-jira          # 별도 터미널에서 실행 (계속 떠 있어야 함)
```

- **Team A Jira** → `http://localhost:4567` (프로젝트 `PROJ`, `BUG`)
- **Team B Jira** → `http://localhost:4568` (프로젝트 `FEAT`)

앱에서 두 서버를 등록할 때:
- Base URL: 위 두 URL
- 인증: **Personal Access Token** 선택, PAT 값은 **아무 문자열이나** 입력 (예: `dev-token`)
- "연결 테스트" → ✓ Demo User

샘플 JQL:
- `project = PROJ AND status != Done ORDER BY updated DESC`
- `assignee = currentUser()`
- `status in ("In Progress", "Resolved")` (커스텀 상태 "이슈 분석 중" 데모용)

지원되는 JQL 절: `project = …`, `status = …`, `status in (…)`, `status != …`, `assignee = currentUser()`, `resolution = Unresolved`, `ORDER BY …`. 그 외는 무시되고 전체가 반환됩니다.

## Jira Cloud 와 연동하기

Cloud는 Personal Access Token 대신 **email + API token**(Basic Auth)을 사용합니다. 앱이 이미 지원하므로 셋업만 따라 하면 됩니다.

1. **(없다면) 무료 Cloud 사이트 만들기** — https://www.atlassian.com/try/cloud/signup?bundle=jira-software → 사이트 이름 정하면 `https://<your-site>.atlassian.net` 로 만들어집니다 (무료 플랜은 10명까지).
2. **API 토큰 발급** — https://id.atlassian.com/manage-profile/security/api-tokens → "Create API token" → 라벨 입력 → 발급된 토큰 복사 (한 번만 보임).
3. **앱에서 서버 추가** — `/settings/servers` → "서버 추가"
   - **Name**: 식별용 (예: "Company Cloud")
   - **Base URL**: `https://<your-site>.atlassian.net` (trailing slash 없이)
   - **인증 방식**: "Email + API Token (Cloud)" 선택
   - **이메일**: Atlassian 계정 이메일
   - **API 토큰**: 위에서 복사한 토큰
   - "연결 테스트" → ✓ {your name}
4. **샘플 JQL 로 대시보드 만들기**
   - `assignee = currentUser() AND statusCategory != Done`
   - `project = "MYPROJ" AND updated >= -7d ORDER BY updated DESC`

> Cloud는 코멘트 body 를 ADF(JSON) 로 반환합니다. 앱이 자동으로 plain text 로 추출하므로 "최근 코멘트" 컬럼이 정상적으로 표시됩니다.

> **Rate limit**: Cloud는 평균 10 req/s 정도가 안전 한계입니다. URL 모드로 너무 많은 이슈를 동시 fetch하면 429가 날 수 있어요 — JQL 한 줄로 묶는 것을 권장.

### 평가용 더미 이슈 만들기

처음 Cloud 와 연동해서 데모하려면 이슈가 몇 개 있어야 합니다. 5개의 Bug 이슈를 한 번에 만들어주는 스크립트가 있습니다:

```bash
# 1) 프로젝트 키 모를 때 — 보유 프로젝트 목록만 출력
ATLASSIAN_EMAIL=you@example.com \
ATLASSIAN_TOKEN=<api-token> \
JIRA_BASE_URL=https://<your-site>.atlassian.net \
npm run seed-jira-issues

# 2) 위에서 본 키로 시드 생성
JIRA_PROJECT_KEY=PROJ \
ATLASSIAN_EMAIL=you@example.com \
ATLASSIAN_TOKEN=<api-token> \
JIRA_BASE_URL=https://<your-site>.atlassian.net \
npm run seed-jira-issues
```

생성되는 이슈는 모두 `labels = evaluation` 이 붙으므로 정리하기 쉽습니다:
- JQL: `project = PROJ AND labels = evaluation`
- Jira UI 에서 위 JQL 로 검색 후 일괄 삭제 가능

## 기본 사용 흐름

1. **Jira 서버 추가** — Sidebar → 설정 → Jira 서버 → "서버 추가"
   - Server/DC: Base URL + Personal Access Token
   - Cloud: Base URL + 이메일 + API Token
   - "연결 테스트" 로 인증 확인 후 저장
2. **(선택) 커스텀 상태 정의** — 설정 → 커스텀 상태
   - 예: "이슈 분석 중" 만들고 매핑에 `In Progress`, `Resolved` 추가
3. **대시보드 생성** — 사이드바 → 새 대시보드
   - 소스 추가 (JQL 또는 이슈 URL 목록), 여러 서버를 섞어도 OK
   - JQL은 "쿼리 테스트" 로 미리 확인 가능
4. **대시보드 뷰**
   - 컬럼 가시성 메뉴로 원하는 컬럼 토글 (변경 시 자동 저장)
   - 노트 셀을 클릭하여 자유롭게 메모 (DB에 저장)
   - 우측 상단 Markdown / CSV 내보내기로 보고서 작성

## 디렉토리

```
app/                 # Next.js App Router 페이지 & API
components/          # UI · 이슈 테이블 · 폼 · 사이드바
actions/             # Server Actions
lib/db/              # Drizzle 스키마/클라이언트/쿼리
lib/jira/            # Jira REST 클라이언트 · URL 파서 · normalize · fetch
lib/{crypto,status}.ts
scripts/             # bootstrap, migrate
drizzle/             # 생성된 SQL 마이그레이션
data/                # SQLite DB 파일 (gitignored)
```

## 데이터 안전성

- Jira 인증 토큰은 `APP_ENCRYPTION_KEY` 로 AES-256-GCM 암호화 후 DB에 저장됩니다.
- `.env.local` 와 `data/app.db` 는 `.gitignore` 처리되어 있습니다.
- 키를 분실하면 저장된 토큰을 복호화할 수 없습니다. 키와 DB 파일을 함께 백업하세요.

## 기술 스택

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle ORM · better-sqlite3 · TanStack Table/Query · Radix UI · cmdk · sonner

## 테스트

회귀 테스트는 in-memory SQLite를 띄워 DB mutation 로직을 직접 검증합니다.

```bash
npm test
```

`tests/dashboard-mutations.test.ts` — 컬럼 가시성 토글이 sources를 지우지 않는지, 부분 업데이트가 다른 필드를 덮지 않는지 등을 보장합니다.

## 단축키

| 키 | 동작 |
|---|---|
| `Cmd/Ctrl + K` | 커맨드 팔레트 열기 |
| `Cmd/Ctrl + Enter` | 노트 저장 후 편집 종료 |
| `Esc` | 노트 편집 취소 |
