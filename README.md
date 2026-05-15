# jira-collector

[![version](https://img.shields.io/badge/version-1.0.0-3B82F6)](CHANGELOG.md)
[![license](https://img.shields.io/badge/license-MIT-10B981)](#라이센스)


여러 Jira 서버(Server/DC + Cloud)에 흩어진 이슈를 **하나의 테이블**에서 통합 조회·관리하고, 이슈별 메모를 인라인으로 편집하면서 트렌드 그래프로 현황을 보는 로컬 단일 사용자 대시보드.

> 보고용 단일 뷰를 빠르고 즐겁게 유지·업데이트하는 게 목표. 외부 의존성 없이 Node + SQLite 파일 하나로 동작합니다.

## 주요 기능

- **멀티 Jira 서버 통합** — Server/DC PAT 와 Cloud (email + API token, Atlassian의 새 `/search/jql` 엔드포인트) 모두 지원
- **JQL + URL 혼합 소스** — 한 대시보드에 여러 서버, JQL 쿼리·이슈 URL 목록을 자유롭게 조합
- **이슈 테이블** — TanStack Table 기반, 가시성/정렬/검색
- **컬럼 드래그앤드롭** — 헤더를 끌어 순서 변경, 자동 저장
- **상태 컬러 코딩 + 커스텀 상태 그룹** — "In Progress + Resolved" → "이슈 분석 중" 같은 묶기
- **상태 통계 바 + 필터** — 클릭으로 다중 상태 필터링
- **누적 트렌드 차트 (burn-up)** — 생성 vs 해결 누적, 14/30/60/90일, 1x/1.2x/1.5x/2x 높이, 숨기기 토글
- **클릭으로 이슈 메모 편집** — 인라인 자동저장, Cmd+Enter / Esc 단축키, 대시보드별 노트
- **Markdown · CSV 내보내기** — 보고서 만들기 좋게
- **대시보드 즐겨찾기 / 복제 / 삭제**
- **다크모드 + `Cmd/Ctrl+K` 커맨드 팔레트**
- **로컬 SQLite** — `data/app.db` 파일 하나, Jira 토큰은 AES-256-GCM 암호화 저장

## 빠른 시작

```bash
npm install
npm run setup     # .env.local 생성 + DB 마이그레이션
npm run dev
```

브라우저에서 [localhost:3000](http://localhost:3000).

진짜 Jira 서버가 없으면 두 개의 가짜 인스턴스를 띄울 수 있어요:

```bash
npm run mock-jira    # localhost:4567 (Team A), localhost:4568 (Team B)
```

## 다음에 무엇을 읽으면 좋은가

- **[대시보드 가이드](docs/dashboard-guide.md)** — 첫 사용자 흐름, 소스 추가, 컬럼/필터/노트/내보내기 등 전부
- **[자체 서버 설치 & 운영 튜토리얼](docs/self-hosting.md)** — Bare Node + systemd / Docker / 리버스 프록시 / 백업 / 업데이트 / 보안
- **[컨트리뷰션 가이드](CONTRIBUTING.md)** — 개발 셋업, 코드 스타일, **버저닝 정책**, PR 프로세스
- **[변경 이력 (CHANGELOG)](CHANGELOG.md)**

## 기술 스택

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle ORM · better-sqlite3 · TanStack Table & Query · Recharts · @dnd-kit · Radix UI · cmdk · sonner

## 테스트

```bash
npm test     # 20+ 회귀 테스트 (in-memory SQLite + 단위 테스트)
```

## 라이센스

MIT (개인 프로젝트).
