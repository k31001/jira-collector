# Changelog

이 프로젝트의 모든 주요 변경은 이 문서에 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/) 를 따르고, 버저닝은 [Semantic Versioning](https://semver.org/) — 자세한 정책은 [CONTRIBUTING.md](CONTRIBUTING.md#버저닝-정책) 참조.

---

## [Unreleased]

(다음 릴리스에 포함될 변경 사항)

---

## [1.7.0] — 2026-06-01

### Added
- **TrendChart에 미해결(unresolved) 추이 라인** — 메인 이슈 대시보드의 누적 트렌드 차트에 created/resolved 외에 미해결 스냅샷 추이를 주황 점선으로 추가. legend에도 항목 추가.
- **Resolution Time 미해결 이슈 추이 차트** — 평균 해결 시간 차트 아래에 별도 카드로 JQL별 미해결 이슈 수 시계열 추가 (`lib/resolution-time.ts`에 `buildUnresolvedTimeSeries` 추가, `components/resolution-time/UnresolvedTrendChart.tsx` 신설). 같은 JQL 색·라인 스타일로 일관.
- **JQL 토글 (SummaryCards 클릭)** — Resolution Time 대시보드 상단 JQL 요약 카드(평균/중앙값/P90/해결·전체)를 클릭하면 해당 JQL 시리즈가 평균 해결 시간 차트와 미해결 이슈 추이 차트 양쪽에서 숨김/표시 토글. 숨김 카드는 dim + 라벨 strikethrough + EyeOff 아이콘. 상태는 `localStorage`(`resolution-time:visible-jqls:{id}`)에 저장. 키보드 접근(Enter/Space)과 `aria-pressed` 지원.

### Changed
- **LongTailTable(오래 걸린 이슈 분석)에 10개 단위 페이지네이션** — 임계값 초과 이슈를 10개씩 분할 표시 (이전/다음 버튼 + `X/N 페이지` 카운터 + `총 N개 중 X–Y개 표시`). 임계값/소스/정렬 변경 시 페이지 자동 리셋. 현재 페이지만 렌더링하여 다수 이슈에서 체감 성능 개선.

[1.7.0]: https://github.com/k31001/jira-collector/releases/tag/v1.7.0

---

## [1.6.2] — 2026-05-31

### Changed
- `/docs/*` 페이지 가독성/디자인 전면 개선:
  - 본문 타이포그래피: 15px / line-height 1.75 / 최적 폭 760px
  - 헤딩 위계 강화: h1 3xl · h2 2xl + 하단 보더 · h3 lg, h2/h3에 자동 `id` slug + hover 시 `#` 앵커
  - 인용문: 좌측 primary 색 강조 + 부드러운 muted 배경
  - 코드: 인라인은 보더+배경으로 강조, 블록은 둥근 모서리+테두리
  - 표: 헤더 muted 배경 + 짝수 행 zebra 스트라이프
  - 링크: 색상+밑줄 데코로 즉시 식별
  - 리스트 마커가 muted-foreground 색으로 차분해짐, 항목 간 간격 확대
- **우측 sticky 목차** (xl 이상 화면) — h2/h3 자동 추출, IntersectionObserver로 현재 섹션 강조
- **문서 간 탭** — 페이지 헤더 아래 사용/설치 매뉴얼 칩 (현재 선택된 탭은 primary 강조)
- 페이지에서 중복 H1 제거: source의 첫 H1을 떼어내고 `PageHeader`의 타이틀만 사용
- `lib/docs.ts`: `slugify`, `extractToc` 추가 (서버·클라이언트 공유)

[1.6.2]: https://github.com/k31001/jira-collector/releases/tag/v1.6.2

---

## [1.6.1] — 2026-05-31

### Changed
- `docs/dashboard-guide.md` 보강 — v1.2~v1.6에서 추가된 기능들을 모두 반영:
  - 새 섹션 6 "해결 시간 대시보드" — 개념, 생성, 뷰 6개 영역(컨트롤/요약카드/스마트필터/시계열/히스토그램/슬로우분석), 마일스톤, 4가지 사용 시나리오
  - 4번 이슈 테이블에 페이지네이션 항목 (10/30/60) 추가
  - 0번 첫 사용자 흐름에 두 종류 대시보드(이슈/해결시간) 안내
  - FAQ에 해결 시간 대시보드 관련 6개 Q&A 추가
- 인앱 매뉴얼에서도 갱신된 내용이 그대로 노출됨.

[1.6.1]: https://github.com/k31001/jira-collector/releases/tag/v1.6.1

---

## [1.6.0] — 2026-05-31

### Added
- **인앱 매뉴얼** — 사이드바에 "도움말" 섹션 추가, 두 개 문서를 인앱에서 직접 렌더링.
  - `/docs/usage` — 사용 매뉴얼 (`docs/dashboard-guide.md` 렌더)
  - `/docs/install` — 설치 매뉴얼 (`docs/self-hosting.md` 렌더)
  - `react-markdown` + `remark-gfm`로 GFM 테이블/체크박스 지원
  - 각 마크다운 엘리먼트는 앱 디자인에 맞춰 Tailwind로 커스터마이즈 (typography 플러그인 없이)
  - 외부 링크는 새 탭, 내부 경로는 Next `Link`로 라우팅
  - 빌드 시 `generateStaticParams`로 두 페이지 모두 정적 생성

[1.6.0]: https://github.com/k31001/jira-collector/releases/tag/v1.6.0

---

## [1.5.1] — 2026-05-31

### Fixed
- 시계열 차트의 마일스톤 라벨이 chart 안쪽에 그려져 어색하던 문제. 라벨을 `position="top"`으로 chart 위로 빼되, `margin.top`을 44px로 늘려 범례와 라벨 사이에 충분한 수직 공간을 확보. 라벨은 chart 영역 위쪽 외부에 표시되고 범례와 겹치지 않음.

[1.5.1]: https://github.com/k31001/jira-collector/releases/tag/v1.5.1

---

## [1.5.0] — 2026-05-31

### Added
- **히스토그램 stacked 모드** — 해결 시간 분포 차트 기본값이 "전체 (누적)"로 변경. 모든 JQL의 카운트가 빈마다 색상별로 stack되어 한눈에 비교 가능. 셀렉트에서 특정 JQL을 선택하면 그 소스의 막대만 표시. stacked 모드에서는 색상 segment를 클릭하면 해당 JQL의 그 빈에 속한 이슈가 모달로 열림.
- **이슈 테이블 페이지네이션** — `/dashboards/[id]`의 기본 이슈 테이블에 페이지당 10/30/60개 옵션 + 첫/이전/다음/마지막 페이지 네비게이션. 페이지 크기는 `localStorage`에 대시보드별로 저장. 검색/필터/데이터가 바뀌면 첫 페이지로 자동 리셋.

[1.5.0]: https://github.com/k31001/jira-collector/releases/tag/v1.5.0

---

## [1.4.2] — 2026-05-31

### Fixed
- 시계열 차트에서 같은 버킷(같은 x 좌표)에 떨어진 마일스톤이 라벨 텍스트까지 동일할 경우 두 개가 정확히 겹쳐 하나만 보이던 문제. 이제 버킷 내 stack-index를 부여해 라벨을 수직 stagger, 라인은 `strokeDashoffset`로 대시 패턴을 어긋나게 그려 두 색이 모두 보이도록 함.
- 마일스톤 라벨이 chart 상단의 JQL 범례 wrapper와 시각적으로 겹치던 문제. 라벨을 `position="insideTop"`으로 chart 안쪽으로 이동, 범례 wrapper는 `top: -6`으로 살짝 위로 띄움.

[1.4.2]: https://github.com/k31001/jira-collector/releases/tag/v1.4.2

---

## [1.4.1] — 2026-05-31

### Fixed
- 해결 시간 대시보드 편집 화면에서 마일스톤을 추가/수정해도 저장되지 않던 두 가지 버그를 모두 수정.
  1. `applyUpdateResolutionDashboard`의 source 재삽입 SQL에서 `milestones` 컬럼이 빠져있었음 → UPDATE 경로에서만 마일스톤이 사라짐
  2. `resolutionDashboardUpdateSchema`가 `.partial()`로 정의돼 child 필드의 `.default([])`가 그대로 살아남아, `sources`를 보내지 않은 partial update에서도 빈 배열로 강제 변환 → 기존 모든 sources(따라서 마일스톤)가 삭제됨. 기존 `dashboardUpdateSchema`와 동일 패턴으로 모든 필드에 `.optional()` 명시.
- 회귀 테스트 3개 추가 (`tests/resolution-mutations.test.ts`).

[1.4.1]: https://github.com/k31001/jira-collector/releases/tag/v1.4.1

---

## [1.4.0] — 2026-05-31

### Added
- **JQL별 마일스톤** — 각 JQL 소스마다 마일스톤(이름 + 날짜) 여러 개를 등록할 수 있고, 시계열 차트에 소스 컬러의 수직선으로 표시됨. 릴리즈/정책 변경 시점과 평균 해결 시간 변화를 함께 볼 수 있어 인과 추론에 유용.
  - DB: `resolution_dashboard_sources.milestones` JSON 컬럼 추가 (`[{name, date}]`)
  - 폼: 각 JQL 카드 내부에 "마일스톤" 섹션 (이름 input + 날짜 input + 삭제 버튼)
  - 차트: recharts `ReferenceLine` 대시 라인, 같은 버킷에 여러 마일스톤이 있으면 라벨이 자동 stagger
  - 윈도 밖의 마일스톤은 자동으로 숨겨짐
- `lib/resolution-time.ts`: `findBucketLabelForDate` 헬퍼 — 임의 날짜를 현재 시간축 버킷 라벨로 매핑. 2개 단위 테스트로 잠금.

[1.4.0]: https://github.com/k31001/jira-collector/releases/tag/v1.4.0

---

## [1.3.0] — 2026-05-31

### Added
- **분기(quarter) 시계열 버킷** — 평균 해결 시간 추이 차트를 일/주/월/분기로 볼 수 있음. 라벨은 `YYYY-QN` 포맷.
- **오래 걸린 이슈 분석 카드** (`LongTailTable`) — 해결 시간이 임계값(일)을 초과한 이슈를 분석하기 위한 전용 섹션. 분석 워크플로 지원:
  - 임계값 입력 + 빠른 프리셋 (7/14/30/90일), `localStorage`에 대시보드별로 저장
  - 소스 필터 (전체 또는 특정 JQL만)
  - 정렬: 느림 배율 / 해결 시간 / 해결일 / 우선순위
  - **차원별 상위 3개 분포** — 라벨/담당자/타입/우선순위/상태 각 패턴을 한눈에 확인 (예: "슬로우 이슈의 60%가 `payment` 라벨")
  - **느림 배율** 컬럼 — `resolutionHours / median` 값을 색상으로 강조 (5x↑ 빨강, 3x↑ 호박)
  - **최근 코멘트** 컬럼 — 왜 오래 걸렸는지 단서 즉시 노출
  - **Markdown 복사** — 분석 doc/노션에 붙여넣을 수 있는 구조화된 요약(요약 통계 + 차원 분포 + 이슈 표)
- `lib/resolution-time.ts`: `flattenResolvedWithSource`, `dimensionBreakdown`, `slowFactor` 헬퍼 추가, 4개 단위 테스트로 잠금.

### Changed
- `mock-jira.ts`: 시드 RNG로 100개 자동 생성 이슈 + JQL 파서가 `resolved >= -90d`, `created >= "2026-01-01"`, `resolutiondate is not empty` 같은 시간 조건을 인식.
- `lib/utils.ts` `formatDate`: `hourCycle: "h23"`로 강제해서 SSR/클라이언트 간 AM/PM 로케일 차이로 인한 hydration mismatch 해소.

[1.3.0]: https://github.com/k31001/jira-collector/releases/tag/v1.3.0

---

## [1.2.0] — 2026-05-31

### Added
- **해결 시간 대시보드** (`/resolution-time`) — 여러 JQL의 평균 해결 시간(Resolution Time)을 한 화면에서 비교하고 추세를 추적하는 새 대시보드 타입.
  - 소스별 요약 카드 (평균 / 중앙값 / P90 / 해결-전체 비율)
  - 시계열 라인 차트 — 일/주/월 단위, 30~365일 윈도 선택, 여러 JQL을 동일 축에서 비교
  - 해결 시간 히스토그램 — 막대 클릭 시 해당 구간의 이슈가 모달로 표시되어 "오래 걸린 이슈" 즉시 진단 가능
  - JQL별 **스마트 필터** (상태 / 담당자 / 타입 / 우선순위 / 라벨 / 보고자) — Rich Filter의 Smart Filter 패턴 차용. 각 facet은 실제 데이터에서 값과 카운트가 자동으로 채워지고, 선택은 `localStorage`에 대시보드별로 저장됨.
  - 각 JQL은 라벨 + 컬러로 구분되고 차트에서 동일 컬러로 표시
  - 대시보드 단위 설정(윈도/버킷)은 DB에 자동 저장
- `lib/resolution-time.ts` — 평균/중앙값/P90, 히스토그램, 시계열, facet 집계의 순수 함수 모음. 24개 단위 테스트로 잠금.
- 사이드바에 "해결 시간" 섹션 추가, 즐겨찾기 토글 지원.

[1.2.0]: https://github.com/k31001/jira-collector/releases/tag/v1.2.0

---

## [1.1.0] — 2026-05-19

### Added
- **기간 보고서** — 대시보드 컨트롤 바의 "기간 보고서" 버튼 → 시작/종료 일자 + 빠른 프리셋(7/14/30/90일) + 노트 포함 토글로 Markdown 보고서 생성. 미리보기 → "Markdown 복사" 또는 ".md 다운로드". 보고서 구성:
  - 요약 (신규 생성 / 해결 / 기타 업데이트 / 종료 시점 미해결 잔량 + 상태별 분포)
  - 해결 완료 / 신규(진행 중) / 기타 진행 변경 — 각각 Markdown 표
  - `resolutiondate` 가 없는 Done 카테고리 이슈도 `updated` 폴백으로 해결로 인정 (트렌드 차트와 동일 규칙)
- `lib/report.ts` — 순수 함수로 분리된 보고서 빌더. 11개 단위 테스트로 잠금.

[1.1.0]: https://github.com/k31001/jira-collector/releases/tag/v1.1.0

---

## [1.0.0] — 2026-05-16

최초 공개 릴리스.

### Added — 핵심 기능
- 멀티 Jira 서버 통합 (Server/DC PAT + Atlassian Cloud email+API token)
- Cloud 신규 엔드포인트 자동 분기 (`/rest/api/3/search/jql`, `/search/approximate-count`)
- JQL + URL 혼합 소스, 여러 서버를 한 대시보드에 결합
- TanStack Table 기반 이슈 테이블 (정렬 / 검색 / 가시성)
- **컬럼 드래그앤드롭 정렬** (`@dnd-kit`), 변경 자동 저장
- 상태 컬러 코딩 + 커스텀 상태 그룹 (예: "In Progress + Resolved" → "이슈 분석 중")
- 원본 상태 컬러 오버라이드
- **상태 통계 바** + 멀티 셀렉트 필터
- **누적 burn-up 트렌드 차트** (Recharts):
  - 생성 vs 해결 누적, 미해결 backlog 시각화
  - 14 / 30 / 60 / 90일 윈도
  - 1x / 1.2x / 1.5x / 2x 높이 옵션
  - 숨기기 토글, 설정은 `localStorage` 에 대시보드별 저장
- **클릭으로 인라인 편집되는 이슈 노트** — 대시보드별 메시지, 자동 저장, `Cmd+Enter`/`Esc` 단축키
- ADF (Atlassian Document Format) 코멘트 본문을 plain text 로 안전하게 추출
- Status가 "Done 카테고리"인데 `resolutiondate`가 비어있는 케이스도 해결로 인정
- 대시보드 즐겨찾기 / 복제 / 삭제
- Markdown · CSV 내보내기
- 다크모드, `Cmd/Ctrl+K` 커맨드 팔레트

### Added — 운영
- 로컬 SQLite (Drizzle ORM) — `data/app.db` 한 파일
- AES-256-GCM 으로 Jira 토큰 암호화 저장
- 셋업 스크립트 (`npm run setup`): 키 생성 → 마이그레이션
- **Mock Jira 서버** (`npm run mock-jira`) — 오프라인 데모용 가짜 인스턴스 2개
- **Jira Cloud 평가용 이슈 시드 스크립트** (`npm run seed-jira-issues`)
- **Dockerfile + docker-compose.example.yml** 자체 호스트 가이드

### Added — 문서
- README 재구성 (간결한 진입점)
- [대시보드 가이드](docs/dashboard-guide.md)
- [자체 서버 설치 & 운영 튜토리얼](docs/self-hosting.md)
- [컨트리뷰션 가이드](CONTRIBUTING.md) + 버저닝 정책

### Added — 테스트
- 20개 회귀 테스트 (in-memory SQLite + 단위 테스트)
  - `tests/dashboard-mutations.test.ts` — 컬럼 토글이 sources 를 지우지 않는지 등
  - `tests/jira-client.test.ts` — Cloud 호스트 감지
  - `tests/adf.test.ts` — ADF → text 변환
  - `tests/normalize.test.ts` — Done 카테고리 fallback

[Unreleased]: https://github.com/k31001/jira-collector/compare/v1.6.2...HEAD
[1.0.0]: https://github.com/k31001/jira-collector/releases/tag/v1.0.0
