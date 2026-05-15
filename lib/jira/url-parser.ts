export type ParsedIssue = {
  serverId: string;
  serverName: string;
  serverBaseUrl: string;
  issueKey: string;
};

export type ParseError = { input: string; reason: string };

export type RegisteredServer = {
  id: string;
  name: string;
  baseUrl: string;
};

const KEY_RE = /\b([A-Z][A-Z0-9_]+-\d+)\b/;

export function parseIssueInput(
  input: string,
  servers: RegisteredServer[],
  fallbackServerId?: string,
): ParsedIssue | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "빈 입력" };

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return { error: "URL 형식이 잘못되었습니다" };
    }
    const match = url.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
    if (!match) return { error: "'/browse/PROJ-N' 형태가 아닙니다" };
    const issueKey = match[1];

    const server = servers.find((s) => {
      try {
        const sUrl = new URL(s.baseUrl);
        return sUrl.hostname === url.hostname;
      } catch {
        return false;
      }
    });
    if (!server) return { error: `등록되지 않은 서버: ${url.hostname}` };
    return {
      serverId: server.id,
      serverName: server.name,
      serverBaseUrl: server.baseUrl,
      issueKey,
    };
  }

  const keyMatch = trimmed.match(KEY_RE);
  if (keyMatch) {
    if (!fallbackServerId) {
      return { error: "이슈 키만 입력했을 때는 서버를 함께 선택하세요" };
    }
    const server = servers.find((s) => s.id === fallbackServerId);
    if (!server) return { error: "선택한 서버를 찾을 수 없습니다" };
    return {
      serverId: server.id,
      serverName: server.name,
      serverBaseUrl: server.baseUrl,
      issueKey: keyMatch[1],
    };
  }
  return { error: "Jira URL이나 이슈 키(PROJ-123)를 입력하세요" };
}

export function parseIssueList(
  raw: string,
  servers: RegisteredServer[],
  fallbackServerId?: string,
): { parsed: ParsedIssue[]; errors: ParseError[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed: ParsedIssue[] = [];
  const errors: ParseError[] = [];
  for (const line of lines) {
    const r = parseIssueInput(line, servers, fallbackServerId);
    if ("error" in r) {
      errors.push({ input: line, reason: r.error });
    } else {
      parsed.push(r);
    }
  }
  return { parsed, errors };
}

export function buildIssueUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/$/, "")}/browse/${key}`;
}
