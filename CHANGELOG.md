# Changelog

이 프로젝트의 모든 주요 변경은 이 문서에 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/) 를 따르고, 버저닝은 [Semantic Versioning](https://semver.org/) — 자세한 정책은 [CONTRIBUTING.md](CONTRIBUTING.md#버저닝-정책) 참조.

---

## [Unreleased]

(다음 릴리스에 포함될 변경 사항)

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

[Unreleased]: https://github.com/k31001/jira-collector/compare/v1.1.0...HEAD
[1.0.0]: https://github.com/k31001/jira-collector/releases/tag/v1.0.0
