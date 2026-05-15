# 자체 서버 설치 & 운영 튜토리얼

회사 내부 서버나 홈서버에 jira-collector 를 영구 서비스로 띄우는 방법.

이 앱은 **단일 사용자** 가정으로 만들어졌습니다. 인증/멀티유저 없이 동일 호스트의 누구나 `http://<server>:3000` 으로 접근 가능하므로, **반드시 사내망/VPN/SSO 프록시 뒤에** 두세요.

---

## 0. 시스템 요구사항

- **OS**: Linux (Ubuntu 22.04+ / Debian 12+ / RHEL 9 / Alpine), macOS, Windows (WSL2 권장)
- **Node.js**: 22 LTS 권장 (20 도 동작). `node --version` 으로 확인
- **RAM**: 256 MB 면 충분 (Next.js + SQLite). 동시 fetch 가 많으면 512 MB 권장
- **디스크**: 이미지 ~400 MB + DB 파일 (수MB)
- **포트**: 기본 3000 (변경 가능)
- **네트워크**: 등록할 Jira 서버에 HTTPS outbound 만 있으면 됨

---

## 1. 어떤 방식으로 설치할까

| 방식 | 추천 대상 | 난이도 |
|---|---|---|
| **Docker Compose** | 대부분의 사용자. 의존성 격리·재시작 자동화·이식성. | ★ |
| **Bare Node + systemd** | Docker 가 없는 호스트, 더 가벼움. | ★★ |
| **pm2** | Node 친숙하고 systemd 안 쓰는 환경. | ★★ |

이 문서는 셋 다 다룹니다. 한 가지만 골라서 진행하세요.

---

## 2. Option A — Docker Compose (권장)

### 2.1 사전 준비

```bash
# Docker 와 Compose plugin 설치 확인
docker --version
docker compose version
```

### 2.2 소스 받기

```bash
git clone https://github.com/k31001/jira-collector.git
cd jira-collector
```

### 2.3 암호화 키 생성 + compose 설정

```bash
cp docker-compose.example.yml docker-compose.yml

# 32-byte base64 키 한 번만 생성 → .env 에 저장
echo "APP_ENCRYPTION_KEY=$(openssl rand -base64 32)" > .env
```

> **`.env` 와 `data/` 디렉토리는 반드시 백업하세요.** 키를 잃어버리면 저장된 Jira 토큰을 복호화할 수 없습니다.

### 2.4 빌드 & 시작

```bash
mkdir -p data
docker compose up -d --build
docker compose logs -f jira-collector
```

`Ready in …` 로그가 보이면 [http://<server>:3000](http://<server>:3000) 으로 접속.

### 2.5 업데이트

```bash
git pull
docker compose up -d --build
```

이미지가 재빌드되고 마이그레이션이 컨테이너 시작 시 자동 실행됩니다.

### 2.6 중단·재시작

```bash
docker compose stop      # 일시 정지 (데이터 유지)
docker compose start     # 재개
docker compose down      # 컨테이너 제거 (data/ 와 .env 는 안전)
```

---

## 3. Option B — Bare Node + systemd

Docker 없이 호스트에 직접 띄우는 방식.

### 3.1 Node.js 설치

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# RHEL/Rocky
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
```

### 3.2 전용 사용자·디렉토리 준비

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin jiracollector
sudo mkdir -p /opt/jira-collector
sudo chown jiracollector:jiracollector /opt/jira-collector
```

### 3.3 소스 배치 + 빌드

```bash
sudo -u jiracollector git clone https://github.com/k31001/jira-collector.git /opt/jira-collector
cd /opt/jira-collector
sudo -u jiracollector npm ci
sudo -u jiracollector npm run db:generate
sudo -u jiracollector npm run db:migrate
sudo -u jiracollector bash -c 'echo "APP_ENCRYPTION_KEY=$(openssl rand -base64 32)" > .env.local'
sudo -u jiracollector npm run build
```

### 3.4 systemd 유닛 작성

`/etc/systemd/system/jira-collector.service`:

```ini
[Unit]
Description=jira-collector (multi-Jira dashboard)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=jiracollector
Group=jiracollector
WorkingDirectory=/opt/jira-collector
EnvironmentFile=/opt/jira-collector/.env.local
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
Restart=on-failure
RestartSec=5

# Hardening (선택)
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/jira-collector/data

[Install]
WantedBy=multi-user.target
```

### 3.5 활성화 & 시작

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jira-collector
sudo systemctl status jira-collector
sudo journalctl -u jira-collector -f
```

### 3.6 업데이트

```bash
cd /opt/jira-collector
sudo -u jiracollector git pull
sudo -u jiracollector npm ci
sudo -u jiracollector npm run db:generate
sudo -u jiracollector npm run db:migrate
sudo -u jiracollector npm run build
sudo systemctl restart jira-collector
```

---

## 4. Option C — pm2

```bash
git clone https://github.com/k31001/jira-collector.git /srv/jira-collector
cd /srv/jira-collector
npm ci
npm run setup
npm run build

npm install -g pm2
pm2 start "npm start" --name jira-collector
pm2 save
pm2 startup           # systemd 등록 안내 출력대로 한 줄 실행
```

업데이트:

```bash
cd /srv/jira-collector
git pull
npm ci
npm run db:migrate
npm run build
pm2 restart jira-collector
```

---

## 5. 리버스 프록시 (TLS / 도메인)

`http://localhost:3000` 만으로도 동작하지만, 사내 도메인 + HTTPS 가 일반적입니다.

### 5.1 Caddy (가장 간단, 자동 Let's Encrypt)

`/etc/caddy/Caddyfile`:

```
jira-collector.corp.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

DNS 가 호스트로 향해 있으면 인증서 자동 발급. 사내 망에서는 내부 CA 또는 self-signed 발급으로 바꿔야 할 수도 있어요.

### 5.2 nginx

`/etc/nginx/sites-available/jira-collector`:

```nginx
server {
  listen 443 ssl http2;
  server_name jira-collector.corp.example.com;

  ssl_certificate     /etc/ssl/certs/jira-collector.crt;
  ssl_certificate_key /etc/ssl/private/jira-collector.key;

  client_max_body_size 5m;

  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto https;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";

    proxy_read_timeout 90s;
  }
}

server {
  listen 80;
  server_name jira-collector.corp.example.com;
  return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/jira-collector /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5.3 접근 제어

- **사내망에서만** 접근 가능하도록 방화벽으로 3000 포트는 외부에서 차단, 프록시(443)는 VPN/사무실 IP 만 허용
- 단일 사용자 가정이라 앱 자체 인증은 없습니다. 추가 보안이 필요하면 reverse proxy 단에서 **HTTP basic auth / OAuth2 proxy (예: oauth2-proxy with Google/Okta) / Cloudflare Access** 등을 얹으세요

---

## 6. 백업 & 복구

상태 전부가 다음 **두 가지**에 들어있습니다.

| 항목 | 의미 |
|---|---|
| `data/app.db` (또는 컨테이너의 `/data/app.db`) | 서버 등록, 대시보드, 노트, 커스텀 상태 — 전부 |
| `APP_ENCRYPTION_KEY` (`.env` / `.env.local`) | Jira 토큰을 복호화하는 키 |

### 6.1 일일 백업 (cron 예시)

```bash
# /etc/cron.daily/jira-collector-backup
#!/bin/sh
BACKUP_DIR=/var/backups/jira-collector
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)

# SQLite 는 .backup 명령이 깨지지 않는 스냅샷을 보장
sqlite3 /opt/jira-collector/data/app.db ".backup $BACKUP_DIR/app.$STAMP.db"

# 키도 함께 — 별도 안전한 위치(예: 비밀 관리 시스템)에 복제 권장
cp /opt/jira-collector/.env.local $BACKUP_DIR/env.$STAMP

# 14일 보관
find $BACKUP_DIR -type f -mtime +14 -delete
```

```bash
sudo chmod +x /etc/cron.daily/jira-collector-backup
```

### 6.2 복구

```bash
# 새 호스트에서:
sudo systemctl stop jira-collector            # 또는 docker compose stop
sudo cp app.20260515-030001.db /opt/jira-collector/data/app.db
sudo cp env.20260515-030001 /opt/jira-collector/.env.local
sudo systemctl start jira-collector
```

> **키와 DB 는 반드시 같은 시점의 쌍**으로 복원. 키가 바뀌면 기존 토큰을 못 읽습니다.

---

## 7. 키 회전 (선택)

`APP_ENCRYPTION_KEY` 가 유출됐을 때:

1. 새 키 생성 (`openssl rand -base64 32`)
2. `/settings/servers` 에서 모든 Jira 서버를 **삭제 후 재등록** (또는 새 키로 한 번씩 토큰 다시 입력)
3. 새 키로 `.env(.local)` 교체 → 서비스 재시작

> 자동 키 회전 스크립트는 의도적으로 빼뒀습니다 — 토큰을 직접 다시 붙여넣는 것이 실수 없이 안전.

---

## 8. 업그레이드 정책

- **마이너 버전**: 백업 후 `git pull && npm ci && npm run db:migrate && npm run build` (또는 Docker `up -d --build`)
- **DB 마이그레이션**: Drizzle 마이그레이션은 idempotent — 컨테이너/서비스 시작 시 자동 실행됩니다. 새 컬럼이 추가될 때만 영향
- **롤백 절차**: 백업 DB + 이전 git tag 로 복귀

---

## 9. 로그 / 모니터링

- **systemd**: `journalctl -u jira-collector -f`
- **Docker**: `docker compose logs -f jira-collector`
- **pm2**: `pm2 logs jira-collector`

기본 로그 라인 예시:

```
GET /dashboards 200 in 42ms (next.js: 3ms, application-code: 39ms)
[db] migration applied to /data/app.db
[mock-jira] Team A Jira ready at http://localhost:4567
```

헬스체크가 필요하면 단순히 `GET /dashboards` 가 200 OK 인지 보면 됩니다 (인증 없이 응답).

---

## 10. 트러블슈팅

**컨테이너가 즉시 종료**
- `docker compose logs jira-collector` 로 첫 에러 확인
- 가장 흔한 원인: `APP_ENCRYPTION_KEY` 미설정 → `.env` 에 base64 키 존재 확인

**better-sqlite3 가 native 컴파일 실패 (Bare Node 설치 시)**
- `python3`, `make`, `g++` 가 필요. Ubuntu: `sudo apt-get install -y python3 build-essential`

**Jira 토큰이 갑자기 작동 안 함**
- 키가 바뀐 경우 (예: `.env` 재생성). `/settings/servers` 에서 토큰을 다시 한 번 저장 (입력하면 새 키로 재암호화)

**HTTP 401 / 403 from Jira**
- PAT 만료 / 권한 변경. `/settings/servers` → 해당 서버 → "연결 테스트" 로 진단

**Cloud 에서 410 Gone**
- 이미 새 `/rest/api/3/search/jql` 로 자동 분기되어 처리됩니다. 만약 다시 보인다면 git pull 로 최신 코드 받으세요.

**포트 충돌**
- Docker: compose 파일에서 `"3000:3000"` → `"8080:3000"` 로 변경
- Bare: systemd 유닛의 `-p 3000` 를 다른 포트로

**메모리 누수 의심**
- `docker stats jira-collector` 또는 `systemd-cgtop` 으로 추세 확인
- 정상은 50–200 MB 범위. 그 이상이면 issue 등록

---

## 11. 보안 체크리스트

- [ ] `APP_ENCRYPTION_KEY` 가 `.env`/`.env.local` 에 32-byte base64 로 저장됨, **퍼블릭 git 에는 절대 커밋 X** (`.gitignore` 기본 처리됨)
- [ ] 3000 포트가 외부망에서 접근 불가 (방화벽 또는 bind를 `127.0.0.1` 로)
- [ ] 리버스 프록시에서 **HTTPS 강제** + 사내 OAuth/SSO 적용
- [ ] `data/` 디렉토리에 적절한 권한 (`750`, 소유자만 RW)
- [ ] DB + 키 백업 자동화
- [ ] 정기 업데이트 (`git pull` 월 1회 정도)

---

## 12. 참고 자료

- [대시보드 사용 가이드](dashboard-guide.md)
- 소스코드: https://github.com/k31001/jira-collector
- 이슈/제안: https://github.com/k31001/jira-collector/issues
