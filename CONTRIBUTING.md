# 컨트리뷰션 가이드

기여 환영합니다. 이슈, PR, 문서 개선, 어떤 형태든 좋아요.

---

## 1. 환영합니다 / 시작 방법

처음 와 보셨다면 이 순서대로 읽으면 빠릅니다.

1. [README](README.md) — 프로젝트가 무엇인지
2. [docs/dashboard-guide.md](docs/dashboard-guide.md) — 사용자가 어떻게 쓰는지
3. [docs/self-hosting.md](docs/self-hosting.md) — 실제로 배포되는 환경 이해
4. 이 문서 — 어떻게 코드에 손을 대는지

문의나 토론은 GitHub [Issues](https://github.com/k31001/jira-collector/issues) 에 남겨주세요.

---

## 2. 개발 환경 셋업

요구: Node.js 22 LTS, npm.

```bash
git clone https://github.com/k31001/jira-collector.git
cd jira-collector
npm install
npm run setup    # APP_ENCRYPTION_KEY 생성 + DB 마이그레이션
npm run dev      # http://localhost:3000
```

진짜 Jira 가 없으면 가짜 서버 두 개:

```bash
npm run mock-jira   # 4567 / 4568 포트
```

다른 터미널에서 앱이 실행 중일 때, `/settings/servers` 에서 등록 (PAT 는 아무 문자열이나).

---

## 3. 프로젝트 구조

```
app/                      Next.js App Router 페이지 + API
  dashboards/             대시보드 CRUD + 메인 뷰
  settings/               Jira 서버 / 커스텀 상태 / 컬러 설정
  api/dashboards/[id]/    이슈 집계 GET 엔드포인트

actions/                  Server Actions (얇은 wrapper)
lib/
  db/                     Drizzle 스키마 + 클라이언트 + mutation 함수
  jira/                   REST 클라이언트 / URL 파서 / normalize / fetch / ADF
  crypto.ts, status.ts, utils.ts, version.ts

components/
  ui/                     shadcn-style 프리미티브 (Button, Dialog, ...)
  issues-table/           메인 테이블, 상태 통계, 트렌드 차트, 노트 셀
  source-editor/          JQL / URL 입력 카드
  dashboard/, jira-server-form/, custom-status/, sidebar.tsx, ...

drizzle/                  생성된 SQL 마이그레이션
scripts/                  bootstrap, migrate, mock-jira, seed-jira-issues
tests/                    node:test 회귀 테스트
docs/                     사용자/운영 가이드
```

자세한 개요는 README 의 "기술 스택" 섹션도 참조.

---

## 4. 변경을 만들 때

### 워크플로우
1. **이슈 먼저** (큰 변경의 경우) — 디자인 이견을 코드 쓰기 전에 잡습니다
2. 브랜치: `feat/<짧은-설명>`, `fix/<짧은-설명>`, `docs/<...>`
3. 변경 + 테스트
4. `npm test && npm run build && npm run lint` 통과 확인
5. PR 생성

### 어떤 변경이든 동반해야 할 것
- 영향 받는 사용자 흐름에 대한 **수동 확인** 메모를 PR 설명에 한 줄
- 외부 동작이 바뀌었으면 **CHANGELOG.md** `[Unreleased]` 섹션에 한 줄
- 새 코드 경로에 가능한 **테스트** (특히 `lib/db/*`, `lib/jira/*`, server actions)

---

## 5. 코드 스타일

- **TypeScript strict** 모드. `any` 사용은 명확한 이유가 있을 때만.
- 클라이언트 컴포넌트는 `"use client"` 명시. 가능하면 서버 컴포넌트로 시작하고 인터랙션이 필요한 leaf 만 client.
- **server action 파일 (`"use server"`)** 은 비동기 함수만 export. type 재익스포트 금지 — `lib/db/...` 에서 직접 import.
- 새 컴포넌트는 `components/<영역>/<PascalCase>.tsx`.
- 한국어 UI 텍스트는 그대로 한국어로. (다국어는 향후 작업)
- 주석은 "왜" 만. "무엇" 은 코드로.

### Lint / Format

```bash
npm run lint
```

ESLint 가 React 19 의 `react-hooks/set-state-in-effect` 같은 규칙을 강하게 적용합니다. 의도된 패턴이면 좁은 범위 `eslint-disable` 로 핀포인트 (예: `next-themes` mounted 패턴).

---

## 6. 커밋 메시지

Conventional Commits 는 강제하지 않지만, 결을 비슷하게 유지해 주세요.

**형식:**
```
<imperative summary, sentence case, under 72 chars>

<body — what changed and why; wrap at ~80 cols>

[Optional: Co-Authored-By: ...]
```

**예시 (실제 커밋):**
```
Fix raw Zod error leaking to UI when JQL is empty in source editor

testJql was throwing a ZodError when serverId/jql failed validation,
which surfaced the JSON-stringified issues array on the client. Switch
to safeParse and return { ok:false, error } so the existing error-toast
branch displays a clean message.
```

**금지:**
- 이모지로 시작
- `wip`, `update stuff` 같은 의미 없는 한 줄
- 두 가지 무관한 변경 한 커밋에

---

## 7. PR 가이드

- **PR 제목**: 커밋 메시지 룰과 동일
- **PR 본문**: `## 무엇이 바뀜` + `## 왜` + `## 테스트` 세 섹션 권장
- 작은 PR을 선호 (리뷰 부담 적음). 큰 리팩토링은 사전 이슈로 의도 공유.
- 자체 호스트 운영자가 영향 받을 변경은 [self-hosting.md](docs/self-hosting.md) 업데이트도 함께.

---

## 8. 버저닝 정책

이 프로젝트는 [Semantic Versioning 2.0](https://semver.org/) 을 따릅니다. **모든 main 브랜치 푸시는 버전 bump 와 CHANGELOG 업데이트를 동반**합니다.

### 버전 번호: `MAJOR.MINOR.PATCH`

| 종류 | 언제 올리나 | 예시 |
|---|---|---|
| **MAJOR** | 호환성 깨는 변경 | DB 스키마 비호환 변경, 환경변수 rename, 외부 API/URL 시그니처 변경, 핵심 동작 제거 |
| **MINOR** | 새 기능 추가 (호환 유지) | 새 페이지, 새 컬럼, 새 차트, 새 설정 옵션, 새 npm 스크립트 |
| **PATCH** | 버그 fix · 리팩토링 · 문서 · 성능 · 의존성 bump | UI 잔버그 수정, 내부 함수 분리, 오타, 테스트 추가 |

### 결정 트리

```
변경이 사용자/운영자에게 무엇을 하게 만드나?

  → 마이그레이션 / 재설정 / 코드 수정이 필요하다  ─→ MAJOR
  → 새로 할 수 있는 일이 생긴다 (기존은 그대로 동작) ─→ MINOR
  → 동작에는 차이가 없거나 동일 동작 유지         ─→ PATCH
```

### 푸시할 때마다 해야 할 것

1. 변경 규모 판단 (위 결정 트리)
2. `package.json` 의 `"version"` 필드 업데이트
3. **`CHANGELOG.md`** 의 `[Unreleased]` 항목들을 새 버전 섹션으로 이동, 날짜 기입
4. `git tag v<version>` (release 가 의미 있을 때) 또는 일반 커밋
5. `git push --follow-tags`

### 푸시 단위와 릴리스 단위

- **푸시마다 자동 bump**: 이 저장소는 푸시 = 릴리스 형태로 운영합니다 (단일 사용자 도구 특성).
- **0.x → 1.0**: 1.0.0 부터 안정. 1.x 시리즈에서는 데이터/설정 호환을 가능한 한 유지하고, 깨야 하면 마이그레이션 가이드를 같이 제공.

### 예시 시나리오

| 변경 | bump |
|---|---|
| 트렌드 차트에 새 옵션 추가 | MINOR |
| Zod 검증 메시지 한 줄 추가 | PATCH |
| 테이블 컬럼 정의 추가 (선택 컬럼) | MINOR |
| DB 컬럼 추가 + 마이그레이션 자동 적용 | MINOR |
| **`APP_ENCRYPTION_KEY` 의미 변경, 재설정 필요** | MAJOR |
| 영구히 응답 포맷이 깨지는 API 변경 | MAJOR |
| `lib/jira/client.ts` 내부 리팩토링, 외부 동작 동일 | PATCH |
| 문서 오타 수정 | PATCH |

---

## 9. 테스트

```bash
npm test
```

`node:test` 기반. `tests/*.test.ts` 파일이 자동 발견됩니다.

### 무엇을 테스트하나
- **DB mutation 로직** (`lib/db/dashboard-mutations.ts`): in-memory SQLite + 마이그레이션 적용 후 직접 호출
- **순수 함수** (`lib/jira/adf.ts`, `lib/jira/url-parser.ts`, `lib/jira/normalize.ts`, `lib/jira/client.ts` 의 `isCloudHost` 등)
- 회귀: 한 번 발견된 버그는 테스트로 잠가두기

### 무엇을 테스트 안 하나
- React 컴포넌트의 시각적 동작 (수동 dev 서버 확인으로 대체)
- 실제 Jira API (mock-jira 로 시뮬레이트 + 수동 Cloud 검증)

---

## 10. 보안 이슈 보고

- **공개 이슈 트래커에 올리지 마세요.**
- 메일로 비공개 보고: 저장소 소유자에게 직접 연락 (GitHub 프로필 참조).
- 영향 받는 항목 우선 분류:
  - Jira 토큰 노출 가능성
  - 임의 코드 실행
  - SQLite 파일 손상/덮어쓰기
  - XSS / CSRF

---

## 11. 라이센스

기여하시는 코드는 프로젝트의 라이센스(MIT) 하에 배포됨에 동의하는 것으로 간주합니다.

감사합니다!
