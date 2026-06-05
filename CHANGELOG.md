# Changelog

이 프로젝트의 모든 주요 변경은 이 문서에 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/) 를 따르고, 버저닝은 [Semantic Versioning](https://semver.org/) — 자세한 정책은 [CONTRIBUTING.md](CONTRIBUTING.md#버저닝-정책) 참조.

---

## [Unreleased]

(다음 릴리스에 포함될 변경 사항)

- 버그 재오픈(reopen) 횟수 추이 — Jira changelog의 status 역방향 전이를 세야 해서 상태별 체류 시간(v1.12.0)의 changelog 경로 위에 lazy로 얹는 게 자연스러움. 후속 작업으로 남김.

---

## [1.22.3] — 2026-06-05

### Fixed
- **트렌드 차트 Y축 라벨 가시성** — v1.22.1 에서 가로 폭을 더 쓰려고 음수 margin(`left: -20, right: -8`)을 둔 것이 라벨 영역을 캔버스 밖으로 밀어내, 좌축 숫자가 안 보이고 우축 3자리 이상 숫자가 잘리는 결과를 낳았습니다.
  - margin 을 `{top: 8, right: 4, left: 0, bottom: 0}` 으로 정상화.
  - 좌축 `<YAxis>` width 28 → 40 (4자리까지 여유), 우축 28 → 36 (`2 × peak` 캡 상한도 안전하게 수용).
  - 결과: 좌측 축에 생성/해결 누적 숫자 tick 이 명확히 표시되고, 우측 미해결 tick 이 끝까지 잘림 없이 보입니다.

[1.22.3]: https://github.com/k31001/jira-collector/releases/tag/v1.22.3

---

## [1.22.2] — 2026-06-05

### Changed
- **트렌드 차트 우축(미해결) 도메인 정책 변경** — v1.22.1의 자동 zoom(`[min−20%pad, max+20%pad]`)은 미해결 값이 안정적이면 라인이 차트 상단까지 차올라 누적 영역과 겹쳐 보이는 케이스가 있었습니다.
  - 새 정책: 우축은 항상 0부터, 상한은 `Math.max(2, ceil(peak × 2))` — 즉 **peak가 차트 중간쯤에 머무르도록 캡**.
  - 좌축은 그대로 생성/해결 데이터 기반 auto-zoom(`[min−12%, max+12%]`)이며, 우축은 좌축의 시각적 dominance를 유지하도록 종속.
  - 결과: 미해결 라인이 항상 누적 영역 fill 아래 절반 영역에서 움직여 시각적 충돌이 없어지고, 좌축의 day-by-day 변동을 가리지 않습니다.

[1.22.2]: https://github.com/k31001/jira-collector/releases/tag/v1.22.2

---

## [1.22.1] — 2026-06-05

### Fixed
- **트렌드 차트: 짧은 윈도에서 Y축 변동이 보이지 않던 문제** — 누적 burn-up 특성상 day-0 에 윈도 이전 이벤트가 모두 folded 되어 시작 값이 높아, 14일 같은 짧은 윈도에서 며칠치 변동이 0~max 스케일에 묻혔습니다.
  - **누적 영역(생성·해결)을 왼쪽 Y축**의 자동 zoom 도메인으로 분리(`[min - 12%pad, max + 12%pad]`, 0 floor). 윈도 길이가 짧아도 day-by-day 변동이 시각적으로 부각됩니다.
  - **미해결(스냅샷) 라인은 오른쪽 Y축**으로 이동해 자기 범위(`[min - 20%pad, max + 20%pad]`) 안에서 그려집니다. 누적치와 잔량의 크기 차이가 더 이상 서로를 squash 하지 않습니다.
  - 범례에 `← 좌축` / `우축 →` 라벨과 우측 축 tick 컬러를 미해결 라인과 동일한 amber 로 맞춰 어느 축이 무엇인지 명시.

[1.22.1]: https://github.com/k31001/jira-collector/releases/tag/v1.22.1

---

## [1.22.0] — 2026-06-05

### Added
- **해결 시간 대시보드별 비율 분석 선택** — 비율 정의는 전역 공유 라이브러리(`/settings/ratio-analysis`)로 유지하되, 새 조인 테이블 `resolution_dashboard_ratios`로 **대시보드마다 표시할 비율을 선택**할 수 있습니다. 종전에는 모든 해결 시간 대시보드가 동일한 비율 카드를 보여줬습니다.
  - 대시보드 편집/생성 화면에 "비율 분석 카드" 선택 섹션 추가(체크 = 해당 대시보드에 노출). 대시보드 뷰는 전역 전체 대신 선택된 비율만 렌더(`listRatioConfigsForDashboard`).
  - 설정 페이지에 "N개 대시보드에서 사용 중" 배지를 더해 2단계(정의 → 연결) 모델을 안내. 비율 정의를 삭제하면 연결은 FK cascade로 정리됩니다.
  - 마이그레이션(`0005`)이 **기존 모든 비율을 기존 모든 대시보드에 백필**해 현재 노출을 그대로 보존. 신규 대시보드는 기본 선택 없음(opt-in)이며, 표시 순서는 라이브러리 전역 순서를 따릅니다(조인 테이블에 `display_order`는 추후 대시보드별 정렬용으로 예약).
  - 비율 연결 생성·교체·해제·cascade 라운드트립 단위 테스트 5개 추가(총 101개).

---

## [1.21.4] — 2026-06-03

### Changed
- **로딩 스트림 중복 전송 제거** — 점진 렌더링(v1.21.2) 이후 각 이슈가 `source` 이벤트와 최종 `result` 이벤트에 **두 번** 실려 콜드 로드 응답이 ~2배였던 것을, `result`를 가벼운 `done`(`fetchedAt`만) 신호로 대체하고 클라이언트가 누적된 `source`들로 최종 결과를 재구성하도록 변경. 이슈를 **한 번만** 전송해 콜드 응답이 절반으로 줄어듭니다(댓글 lazy 로드 v1.21.1의 이득 보존). 웜 캐시 히트는 캐시된 sources를 `source` 이벤트로 replay한 뒤 `done`.

---

## [1.21.3] — 2026-06-03

### Changed
- **Server/DC 이슈 조회 페이지 병렬화** — `searchIssuesServer`가 첫 페이지로 `total`을 파악한 뒤 나머지 페이지(`startAt` 오프셋)를 **순차가 아닌 병렬**로 가져옵니다. 500개를 넘는 소스에서 왕복 수를 N회 순차 → 1회 + 병렬로 줄여 콜드 로드가 빨라집니다. (Cloud의 `/search/jql`은 `nextPageToken` 기반이라 병렬 불가 — 종전대로 순차 유지.)
  - 페이지네이션 정확성(다중 페이지 순서·limit 캡·단일 페이지·정확한 경계) 단위 테스트 4개 추가(총 96개).

---

## [1.21.2] — 2026-06-03

### Changed
- **해결 시간 대시보드 점진 렌더링** — 이슈 조회 스트림에 소스 완료 이벤트(`source`)를 추가해, 모든 JQL을 다 기다리지 않고 **먼저 끝난 JQL부터 차트를 그립니다**. 건수 적은(빠른) 소스의 차트가 느린 소스 로딩 중에 먼저 표시돼 체감 로딩이 빨라집니다.
  - `fetchResolutionDashboardIssues`에 `onSource(result, index)` 추가(완료 순서대로 emit), 라우트가 `{type:"source", index, data}` 스트리밍.
  - 클라이언트가 도착한 소스를 displayOrder(index) 순으로 누적 렌더 — 첫 소스 도착 전엔 진행 바 카드, 이후엔 부분 대시보드 + 상단 진행 스트립. (새로고침은 종전대로 기존 데이터를 유지하다 완료 시 교체.)

---

## [1.21.1] — 2026-06-03

### Changed
- **해결 시간 대시보드 fetch 경량화 — 댓글 lazy 로드** — 이슈 일괄 조회에서 가장 무거운 `comment` 필드를 제외(`DEFAULT_FIELDS_NO_COMMENT` + 참조 커스텀 필드)하고, '오래 걸린 이슈' 표가 **보이는 행의 최신 댓글만** 필요할 때 per-row로 지연 로드합니다(일반 대시보드와 동일 패턴). 검색 페이로드가 줄어 로딩이 빨라집니다 — 댓글이 길고 많은 인스턴스일수록 효과가 큽니다.
  - 배치 댓글 로직을 `lib/jira/comments-batch.ts`(`fetchLatestComments`)로 추출해 이슈/해결시간 대시보드가 공유. 신규 `POST /api/resolution-time/[id]/comments` 라우트 추가.
  - `LongTailTable`이 보이는 페이지의 댓글을 지연 조회(미로딩=스피너, 없음=—), Markdown 복사 시 누락 댓글을 on-demand로 채웁니다.

---

## [1.21.0] — 2026-06-03

### Added
- **해결 시간 대시보드 로딩 진행 바(스트리밍)** — 콜드 로드 시 스피너 대신 실제 진행률을 표시합니다. 이슈 조회 API가 NDJSON 스트림으로 진행 상황을 흘려보내고(`plan` → `progress`* → `result`), 클라이언트가 이를 읽어 **"가져온 건수 / 예상 건수 · %"** 와 진행 속도 기반 **대략적 잔여 시간(ETA)** 을 보여줍니다.
  - 예상 건수는 `countIssues`(approximate-count)를 소스별 병렬 호출로 산출 — 조회와 **동시에** 진행돼 첫 바이트를 지연시키지 않습니다. 도착 전엔 비결정형(가져온 건수만 표시), 도착 후 결정형 바로 전환.
  - `searchIssues`에 페이지 단위 `onPage` 콜백, `fetchResolutionDashboardIssues`에 `{ onPlan, onProgress }` 추가. 이슈 라우트를 `ReadableStream` 기반 NDJSON 응답으로 변경(15초 TTL 캐시 유지 — 웜 히트는 즉시 `result` 한 줄).
  - 새 컴포넌트 `LoadProgress`(결정형 % 바 + 경과/ETA, 비결정형 펄스). 초기 로드는 카드로, 새로고침 중에는 상단 스트립으로 노출. 정확한 "몇 초"는 Jira 지연 특성상 불가해 진행률·추정 ETA로 표현.
  - 로컬 검증용: `mock-jira`에 `MOCK_JIRA_DELAY_MS` 추가 — `/search` 응답을 base + 행당으로 지연(예: `MOCK_JIRA_DELAY_MS=800 npm run mock-jira`)시켜, 로딩이 즉시 끝나 진행 바가 안 보이던 로컬 환경에서도 단계적 진행을 확인할 수 있습니다. 카운트(0행)가 먼저 반환돼 분모(plan)가 페이지 fetch보다 먼저 도착 → 바가 자연스럽게 차오릅니다. 기본 0(꺼짐).

---

## [1.20.1] — 2026-06-02

### Changed
- `.claude/`(로컬 Claude Code 설정·미리보기 구성)를 `.gitignore` 에 추가 — 추적 대상에서 제외해 `git status` 노이즈를 없앴습니다. 앱 동작 변화 없음.

---

## [1.20.0] — 2026-06-02

### Added
- **비율 분석 차트 Y축 자동 스케일 토글** — 차트 헤더에서 `자동 스케일`(기본)과 `0–100%`를 전환. 자동은 보이는 데이터 범위에 맞춰 Y축을 5% 단위로 정돈해 잡으므로, 작은 비율(예: 모두 8% 이하)도 차트를 가득 채워 추세가 또렷하게 보입니다. (높게 몰린 데이터는 0 기준선을 유지, 0–100%로 클램프.)

### Changed
- **처리량 vs 해결 시간 산점도 → "완료 수 · 해결 시간(중앙값·P90) 추이"로 대체** — 산점도(`ThroughputScatterChart`)를 제거하고 시간축 기반 콤보 차트(`ThroughputTrendChart`)로 교체. 막대=기간별 완료 수(오른쪽 축), 실선=중앙값·점선=P90 해결 시간(왼쪽 축). 같은 두 신호(처리량+속도)를 시간 흐름으로 읽고, 평균보다 이상치에 덜 흔들리는 중앙값/P90을 사용합니다. 두 지표 모두 `buildTimeSeries`가 이미 버킷별로 계산하던 값이라 집계 추가는 없습니다.
- **해결 시간 분포 차트: 누적(stacked) → 그룹(clustered) 막대 + Y축 비율(%) 정규화** — JQL별 막대를 한 구간에 나란히 그리고, Y축을 각 JQL 내 비중(%)으로 정규화해 건수가 다른 JQL끼리도 분포 모양을 바로 비교할 수 있습니다. 각 막대에 % 레이블, 툴팁에 `N개 · X%` 병기. (`stackId` 제거, "전체 (누적)" → "전체 (비교)".)
- **해결 시간 대시보드 분석 한도 2,000개로 상향** — 이슈 조회에 `limit: 2000`(`RESOLUTION_ISSUE_LIMIT`) 명시(기존 기본 1,000). 한도에 도달한 JQL이 있으면 대시보드 상단에 안내 배너를 띄워 윈도 축소/JQL 구체화를 권장합니다.
- **이슈 조회 필드 최소화 — `*all` 되돌림** — v1.19.0에서 커스텀 필드 지원을 위해 모든 필드(`*all`)를 가져오던 것을, 기본 필드(`DEFAULT_FIELDS`)에 더해 **비율 분석·커스텀 facet의 제한 JQL이 실제로 참조하는 커스텀 필드만** 동적으로 포함하도록 변경. `cf[NNNNN]`/`customfield_NNNNN` 참조는 그대로 동작하면서 응답에서 description·첨부·worklog·미참조 커스텀 필드 등을 제외해 2,000개 기준 fetch/aggregation 부담을 줄였습니다.
  - `lib/jql-eval.ts`에 `extractCustomFieldIds()` 추가(텍스트 스캔으로 `cf[N]`/`customfield_N` 두 표기를 수집·정규화·중복 제거). 단위 테스트 3개 추가(총 92개).
- **업데이트 스크립트가 서버 기동까지 수행** — `scripts/update.sh`·`update.ps1`이 pm2/systemd(Windows 서비스)를 못 찾으면 안내만 하고 종료하던 것을, 백그라운드로 앱을 직접 기동(`npm start`, 로그 `app.log`)하고 기존 헬스체크로 기동을 확인하도록 변경. 기동 전 해당 포트의 기존 리스너를 정리해 stale 빌드와 충돌하지 않습니다. (pm2/systemd가 있으면 종전처럼 그쪽을 우선 사용.)

---

## [1.19.1] — 2026-06-02

### Changed
- **처리량 vs 해결 시간 산점도 툴팁에 기간 표시** — 각 점에 마우스를 올리면 그 점이 어느 기간(주/월 등)인지 + 어느 JQL인지 표시: `JQL 1 · 05-26` 형태 헤더 + `완료 수 N개 · 평균 해결 시간 X`. 기존엔 값만 보이고 언제였는지 알 수 없었습니다.

---

## [1.19.0] — 2026-06-02

### Added
- **JQL에서 커스텀 필드 사용** — 스마트 필터·비율 분석의 제한 JQL이 Jira 커스텀 필드를 지원합니다.
  - 참조: `cf[10016]` 또는 `customfield_10016`.
  - 텍스트/선택형: `= != in "not in" "is [not] empty"` (필드의 value/displayName/name, 다중값은 원소 단위로 매칭).
  - 숫자형: `> >= < <=` (예: `cf[10016] >= 5` — Story Points 5 이상).
  - 날짜형 커스텀 필드: `> >= < <=` 상대/절대 날짜.
  - 조합 예: `issuetype = Bug AND cf[10016] >= 5`.
  - 커스텀 필드 값을 쓰려면 fetch 시 가져와야 하므로 Resolution Time 대시보드의 이슈 조회를 **모든 필드(`*all`)** 로 변경 — 응답이 다소 커지지만(커스텀 필드 포함) 15초 캐시로 반복 비용은 흡수.
  - `NormalizedIssue.customFields`에 `customfield_*` 값 캐리, `lib/jira/normalize.ts`에서 수집.
  - 설정(스마트 필터·비율 분석) 폼 안내에 커스텀 필드 문법 추가. 단위 테스트 6개 추가(총 89개).
  - mock-jira: 합성 커스텀 필드(`customfield_10016` Story Points, `customfield_10050` 운영체제 select) + `*all`/`*navigable` 프로젝션 지원.

---

## [1.18.0] — 2026-06-02

### Added
- **JQL 평가기에 날짜 필드/비교 지원** — 스마트 필터·비율 분석에서 쓰는 제한 JQL이 이제 날짜 조건을 지원합니다.
  - 날짜 필드: `created`, `updated`, `resolved`(별칭 `resolutiondate`).
  - 연산자: `>` `>=` `<` `<=`, 그리고 `resolved is empty` / `is not empty`(미해결/해결 필터).
  - 값: 상대 날짜 `-4w` `-7d` `-2h` `-30m`(now 기준, w/d/h/m), 또는 절대 날짜 `2026-01-01`.
  - 조합 예: `issuetype = Bug AND created > -4w`(최근 4주 버그), `resolved > -1w AND priority = High`.
  - 관계 연산자는 날짜 필드에만, 텍스트 필드에는 거부(명확한 오류 메시지). 단위 테스트 7개 추가.
- 설정(스마트 필터·비율 분석) 폼의 지원 문법 안내에 날짜 필드/연산자/상대날짜 예시 추가.

---

## [1.17.0] — 2026-06-01

### Added
- **비율 분석 (분자/분모 JQL 설정)** — 기존 "버그 유입 비율" 차트를 일반화. 설정 → **비율 분석**에서 분자·분모를 제한 JQL로 정의해 "전체 중 특정 조건의 비중" 추세를 그립니다. 예: 분자 `issuetype = Bug`, 분모 비움(전체) → 버그 유입 비율. 분모를 `issuetype in (Bug, Story, Task)`처럼 좁히거나, 기준 날짜를 생성일(유입)/해결일(완료)로 선택 가능. 여러 비율을 정의하면 각각 카드로 노출.
  - 새 테이블 `ratio_configs` (마이그레이션 `0004`, 기본 "버그 유입 비율" 시드 포함).
  - `actions/ratio-analysis.ts` CRUD + JQL 파싱 검증, `/settings/ratio-analysis` 페이지(라이브 검증), 사이드바·설정 허브 항목.
  - `lib/resolution-time.ts`에 `buildRatioSeries`(numerator/denominator 술어 + created/resolved 기준) 추가, `buildBugRateSeries`는 이 위의 얇은 래퍼로 유지. 단위 테스트 1개 추가.
- **그래프 제목 변경** — "버그 유입 비율" → **"비율 분석"**, 제목 옆에 어떤 비율인지(설정 이름 칩 + `분자 … / 분모 … · 생성일|해결일 기준`)를 표시. 도움말도 해당 비율 정의를 반영.

---

## [1.16.0] — 2026-06-01

### Added
- **그래프 해석 도움말** — Resolution Time 대시보드의 9개 분석 카드 제목 옆에 클릭형 `?` 도움말 버튼 추가. 클릭하면 각 그래프를 어떻게 읽는지(값의 의미, 건강한/주의해야 할 모양, 취해야 할 행동)를 짧은 가이드로 보여줍니다. 평균 해결 시간 추이·미해결 이슈 추이·처리량 vs 해결 시간·버그 유입 비율·해결 시간 분포·기간 비교·노화 중인 미해결 이슈·오래 걸린 이슈 분석·상태별 체류 시간 모두 포함.
- 재사용 컴포넌트 `components/help-hint.tsx` (`HelpHint` + `HelpRow`, Popover 기반).

---

## [1.15.0] — 2026-06-01

### Added
- **버그 유입 비율 추이** — Resolution Time 대시보드에 기간별로 "생성된 이슈 중 버그/결함 비중"을 그리는 라인 차트 추가(생성일 기준 버킷). 선이 올라가면 들어오는 작업 중 결함 비율이 커진다는 품질 신호로, cycle time과 함께 보면 속도-품질 균형을 판단할 수 있습니다. 버그 타입 판별은 `bug`/`defect`/`버그`/`결함`/`장애`를 포괄. JQL 카드 토글(visibility) 반영, 추가 fetch 없음.
- `lib/resolution-time.ts`에 `buildBugRateSeries`, `isBugType` 추가 (단위 테스트 2개).

---

## [1.14.0] — 2026-06-01

### Added
- **기간 비교 카드** — Resolution Time 대시보드에 "최근 N일 vs 직전 N일" 비교 추가. 소스별로 처리량(완료 수), 평균·중앙값·P90 해결 시간을 현재 기간과 직전 동일 길이 기간으로 나눠 델타를 보여줍니다(개선=초록 ▼, 악화=빨강 ▲). 회고에서 "지난 스프린트보다 빨라졌나/느려졌나"를 바로 확인. 직전 기간에 데이터가 없으면 모든 지표가 일관되게 "직전 데이터 없음"으로 표시. 추가 fetch 없음.
- `lib/resolution-time.ts`에 `partitionResolvedByPeriod` 추가 (단위 테스트 1개).

---

## [1.13.0] — 2026-06-01

### Added
- **처리량 vs 해결 시간 산점도** — Resolution Time 대시보드에 각 기간(주/월 등)을 점 하나로 찍는 scatter 추가. X축 = 그 기간에 완료된 이슈 수(처리량), Y축 = 그 이슈들의 평균 해결 시간(cycle time). 오른쪽 아래(처리량 높고 해결 시간 낮음)가 건강한 방향이며, 점이 위로 흩어지면 속도가 느려지는 신호입니다. 기존 시계열 데이터(`Series.points`의 count/avgHours)를 재사용해 추가 fetch 없음. JQL 카드 토글(visibility) 반영.

---

## [1.12.0] — 2026-06-01

### Added
- **상태별 체류 시간 (Status dwell time) 분석** — Resolution Time 대시보드에 이슈가 각 워크플로 상태(To Do / In Progress / In Review …)에 평균 얼마나 머무는지 보여주는 카드 추가. "리뷰 단계에서 평균 3일" 같은 병목을 짚어 줍니다. Jira 변경 이력(changelog)을 이슈마다 조회해야 해서 cold load를 보호하기 위해 **명시적 실행 버튼(opt-in)** 으로 제공 — 자동 로드되지 않습니다. 집계는 서버에서 수행해 응답이 작고(수백 이슈도 ~2KB), 60초 캐시. 소스당 최대 200개 이슈로 샘플링(초과 시 표시). JQL 카드 토글(visibility) 반영.
  - `lib/dwell.ts` — `computeDwellIntervals` / `aggregateDwell` 순수 함수 (단위 테스트 5개). created → 전이들 → 종료(해결일 또는 now) 타임라인을 재구성, 해결 이슈의 종료 상태는 자연히 ~0으로 수렴.
  - `lib/jira/client.ts`에 `getIssueChangelog` — Cloud는 `/issue/{key}/changelog`(페이지네이션), Server/DC는 `?expand=changelog`. status 전이만 추출.
  - `lib/jira/fetch-dwell.ts` + `GET /api/resolution-time/[id]/dwell` (opt-in, 캐시).
  - mock-jira에 합성 changelog 생성 + `expand=changelog` / `/changelog` 엔드포인트 추가 (로컬 검증용).

---

## [1.11.0] — 2026-06-01

### Added
- **노화 중인 미해결 이슈 (Aging WIP) 분석** — Resolution Time 대시보드에 새 카드 추가. 기존 "오래 걸린 이슈 분석"은 *이미 해결된* 이슈를 보지만, Aging WIP는 *아직 안 풀린* 이슈 중 오래된 것을 짚어 줍니다(보통 더 actionable한 신호). 각 이슈의 **나이**(생성 후 경과)와 **미접촉**(마지막 업데이트 후 경과)을 표시하고, 미접촉이 전체 나이의 절반을 넘으면 경고색으로 강조. 임계값(기본 14일)·소스·정렬(나이/미접촉/우선순위/생성일) 컨트롤, 10개 페이지네이션, 담당자/상태/타입/우선순위/라벨 차원별 분포, Markdown 복사 지원. JQL 카드 토글(visibility)도 반영. 데이터 추가 fetch 없음 — 기존 created/updated만 사용.
- `lib/resolution-time.ts`에 `withAging`, `flattenAgingWithSource` + 타입 `AgingIssue`, `LabeledAgingIssue` 추가 (단위 테스트 3개).

---

## [1.10.1] — 2026-06-01

### Changed
- **`scripts/update.ps1` / `scripts/update.sh`**: Docker 자동 감지 분기 제거. 항상 `npm ci → db:migrate → build`로 호스트에서 빌드한 뒤 PM2 또는 (Windows) `Restart-Service` / (Linux) systemd로 재시작. 서비스 매니저가 없을 때 안내가 NSSM·systemd 유닛 등록 예시까지 포함하도록 보강.

---

## [1.10.0] — 2026-06-01

### Added
- **배포 업데이트 스크립트** — `scripts/update.ps1` (Windows PowerShell), `scripts/update.sh` (Ubuntu/Debian bash). 동작: `git fetch + reset → npm ci → db:migrate → build → 재시작(docker compose / PM2 / systemd 또는 Windows 서비스 자동 감지) → 90초 health check`. `docker-compose.yml`이 있으면 컨테이너 rebuild만 하고 호스트 빌드는 건너뜀. `FORCE_UPDATE=1` 없이는 dirty working tree에서 중단. 환경변수: `JIRA_COLLECTOR_DIR`, `JIRA_COLLECTOR_BRANCH`, `JIRA_COLLECTOR_PORT`, `JIRA_COLLECTOR_SERVICE`.

### Changed
- **SummaryCard 토글이 히스토그램·LongTailTable에도 적용** — JQL 카드를 숨기면 그 JQL의 데이터가 평균 해결 시간/미해결 추이 차트뿐 아니라 해결 시간 분포 히스토그램과 오래 걸린 이슈 분석 표에서도 제외됩니다. 라인 차트는 기존처럼 legend 항목은 유지(`hide={!visible}`)하고, 히스토그램과 LongTailTable은 source 자체를 분석 대상에서 떼어냅니다.

---

## [1.9.1] — 2026-06-01

### Changed
- **Resolution Time 대시보드의 스마트 필터 영역 기본 접힘** — 자주 쓰지 않을 땐 한 줄 헤더만 보이고 클릭으로 펼침. 헤더에는 전체 활성 필터 개수가 배지로 표시되어 어떤 필터가 켜져 있는지 한눈에 확인 가능. 펼침 상태는 `localStorage`(`resolution-time:filters-expanded:{id}`)에 보존.

---

## [1.9.0] — 2026-06-01

### Added
- **커스텀 스마트 필터** — 설정에서 새 항목(예: "운영체제")과 그 안의 값(Windows / Linux / macOS)을 만들고, 각 값에 제한된 JQL 표현(`labels in (windows, win10)` 등)을 붙일 수 있습니다. Resolution Time 대시보드의 기존 스마트 필터 옆에 자동 노출되어 같은 방식으로 OR(같은 facet 안)/AND(다른 facet 간) 필터링됩니다.
  - 새 테이블 `custom_facets` + `custom_facet_values` (drizzle 마이그레이션 `0003_good_frank_castle.sql`).
  - 신규 `lib/jql-eval.ts` — 제한된 JQL 파서·평가기. 지원 필드: `status`, `assignee`, `reporter`, `priority`, `issuetype`, `labels`, `resolution`. 연산자: `=`, `!=`, `in`, `not in`, `is empty`, `is not empty`. 조합: `AND`. (11개 단위 테스트.)
  - 신규 설정 페이지 `/settings/smart-filters` — facet/value CRUD UI, JQL 입력 시 즉시 파싱 검증.
  - 사이드바·설정 허브에 "스마트 필터" 항목 추가.
  - 선택 상태는 `localStorage`(`resolution-time-custom-filters:{id}`)에 source 단위로 보존.
- **마일스톤도 SummaryCard 토글에 연동** — JQL 카드를 숨기면 그 JQL에 속한 milestone(예: DVR, PVR) ReferenceLine도 차트에서 사라집니다.

### Changed
- `mock-jira` 라벨 풀에 `windows`, `linux`, `macos` 추가 (커스텀 facet 로컬 테스트용).

---

## [1.8.0] — 2026-06-01

### Added
- **Lite 모드 + 코멘트 lazy load** — 메인 이슈 대시보드(`IssuesTable`)는 이제 `/api/dashboards/[id]/issues?lite=1`로 호출되어 search 응답에서 `comment` 필드가 제거됨. 페이로드가 크게 줄어 cold load 단축 (코멘트가 많은 프로젝트에서 효과 큼). 보이는 페이지(30개)의 최신 코멘트는 새 batch 엔드포인트로 lazy fetch.
- **`POST /api/dashboards/[id]/comments`** — `{requests: [{serverId, key}, ...]}` 받아 server별 그룹화 후 병렬 fetch. 응답은 `{comments: {"serverId::key": {author, body, created} | null}}`. 서버별 동시 호출은 8개로 제한.
- **`getLatestComment(server, key)`** in `lib/jira/client.ts` — `/issue/{key}/comment?orderBy=-created&maxResults=1` 엔드포인트로 단건 최신 코멘트 조회. `orderBy`가 무시되는 구버전 Jira에서도 안전하도록 응답에서 `created` 최대값으로 fallback pick.
- **`DEFAULT_FIELDS_NO_COMMENT`** export — search 호출에서 `comment` 필드만 제외한 기본 fields 리스트.
- **mock-jira `fields` 프로젝션 지원** — 실제 Jira처럼 search/`/issue/{key}`에서 요청한 fields만 반환. `/issue/{key}/comment` 엔드포인트(orderBy, maxResults 지원)도 구현해 lazy load 테스트가 end-to-end로 가능.

### Changed
- `IssuesTable` "최근 코멘트" 셀: 코멘트 미도착 상태에서 spinner 표시(`Loader2`). null이면 "—" 그대로.
- Markdown/CSV export: lazy 캐시에서 코멘트 body fallback 조회.
- `data` query result memoization 추가 (lint warning 해결).

---

## [1.7.2] — 2026-06-01

### Performance
- **Jira API page size 100 → 500** — `searchIssuesCloud`, `searchIssuesServer` 기본 `maxResults`를 100에서 500으로 상향. 2000 이슈 기준 순차 round-trip 수가 **20회 → 4회**로 감소 (cold load 단축). 실제 페이지 크기는 Jira 인스턴스의 cap에 따라 자동 조정됨 — DC는 보통 ~1000까지 honoring, Cloud는 인스턴스/엔드포인트마다 다름. 호출자가 `options.maxResults`로 override 가능.

---

## [1.7.1] — 2026-06-01

### Performance
- **서버 응답 캐시 (15초 TTL)** — `/api/dashboards/[id]/issues`, `/api/resolution-time/[id]/issues` 에 인-프로세스 TTL 캐시 적용 (`lib/server-cache.ts`). 2000 이슈 기준 페이지 리로드/탭 전환/연속 polling이 평균 **748ms → 9ms (~80x)**. `?bypass=1` 쿼리로 강제 새로고침 가능. 첫 cold 로드(prod의 Jira 페이지네이션)에는 영향 없음.
- **IssuesTable 검색 필터** — 이슈마다 lowercase haystack을 `data` 변경 시 한 번만 빌드. 2000 이슈에서 키 입력당 **3.3ms → 0.24ms (~14x)**.
- **TrendChart `buildSeries`** — issue마다 호출되던 `new Date(iso).toISOString().slice(0,10)` 제거. window 시작 시점에서의 정수 day index로 버킷팅. 2000 이슈에서 **4.6ms → 1.2ms (~4x)**.

### Changed
- **mock-jira 시드 카운트** — 개발/스트레스 테스트용으로 PROJ 30→250, BUG 25→100, FEAT 45→150 으로 상향. 총 ~520 이슈.

---

## [1.7.0] — 2026-06-01

### Added
- **TrendChart에 미해결(unresolved) 추이 라인** — 메인 이슈 대시보드의 누적 트렌드 차트에 created/resolved 외에 미해결 스냅샷 추이를 주황 점선으로 추가. legend에도 항목 추가.
- **Resolution Time 미해결 이슈 추이 차트** — 평균 해결 시간 차트 아래에 별도 카드로 JQL별 미해결 이슈 수 시계열 추가 (`lib/resolution-time.ts`에 `buildUnresolvedTimeSeries` 추가, `components/resolution-time/UnresolvedTrendChart.tsx` 신설). 같은 JQL 색·라인 스타일로 일관.
- **JQL 토글 (SummaryCards 클릭)** — Resolution Time 대시보드 상단 JQL 요약 카드(평균/중앙값/P90/해결·전체)를 클릭하면 해당 JQL 시리즈가 평균 해결 시간 차트와 미해결 이슈 추이 차트 양쪽에서 숨김/표시 토글. 숨김 카드는 dim + 라벨 strikethrough + EyeOff 아이콘. 상태는 `localStorage`(`resolution-time:visible-jqls:{id}`)에 저장. 키보드 접근(Enter/Space)과 `aria-pressed` 지원.

### Changed
- **LongTailTable(오래 걸린 이슈 분석)에 10개 단위 페이지네이션** — 임계값 초과 이슈를 10개씩 분할 표시 (이전/다음 버튼 + `X/N 페이지` 카운터 + `총 N개 중 X–Y개 표시`). 임계값/소스/정렬 변경 시 페이지 자동 리셋. 현재 페이지만 렌더링하여 다수 이슈에서 체감 성능 개선.

[1.19.1]: https://github.com/k31001/jira-collector/releases/tag/v1.19.1
[1.19.0]: https://github.com/k31001/jira-collector/releases/tag/v1.19.0
[1.18.0]: https://github.com/k31001/jira-collector/releases/tag/v1.18.0
[1.17.0]: https://github.com/k31001/jira-collector/releases/tag/v1.17.0
[1.16.0]: https://github.com/k31001/jira-collector/releases/tag/v1.16.0
[1.15.0]: https://github.com/k31001/jira-collector/releases/tag/v1.15.0
[1.14.0]: https://github.com/k31001/jira-collector/releases/tag/v1.14.0
[1.13.0]: https://github.com/k31001/jira-collector/releases/tag/v1.13.0
[1.12.0]: https://github.com/k31001/jira-collector/releases/tag/v1.12.0
[1.11.0]: https://github.com/k31001/jira-collector/releases/tag/v1.11.0
[1.10.1]: https://github.com/k31001/jira-collector/releases/tag/v1.10.1
[1.10.0]: https://github.com/k31001/jira-collector/releases/tag/v1.10.0
[1.9.1]: https://github.com/k31001/jira-collector/releases/tag/v1.9.1
[1.9.0]: https://github.com/k31001/jira-collector/releases/tag/v1.9.0
[1.8.0]: https://github.com/k31001/jira-collector/releases/tag/v1.8.0
[1.7.2]: https://github.com/k31001/jira-collector/releases/tag/v1.7.2
[1.7.1]: https://github.com/k31001/jira-collector/releases/tag/v1.7.1
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

[Unreleased]: https://github.com/k31001/jira-collector/compare/v1.22.3...HEAD
[1.0.0]: https://github.com/k31001/jira-collector/releases/tag/v1.0.0
