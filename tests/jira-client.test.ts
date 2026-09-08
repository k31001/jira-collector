import { test } from "node:test";
import assert from "node:assert/strict";
import { isCloudHost, searchIssues } from "@/lib/jira/client";
import type { JiraServerConfig, RawJiraIssue } from "@/lib/jira/types";

test("isCloudHost detects atlassian.net hostnames", () => {
  assert.equal(isCloudHost("https://euihyeokkwon.atlassian.net"), true);
  assert.equal(isCloudHost("https://acme.atlassian.net/"), true);
  assert.equal(isCloudHost("https://team.atlassian.com"), true);
});

test("isCloudHost returns false for self-hosted Jira hostnames", () => {
  assert.equal(isCloudHost("https://jira.corp.example.com"), false);
  assert.equal(isCloudHost("http://localhost:4567"), false);
  assert.equal(isCloudHost("https://192.168.1.10:8080"), false);
});

test("isCloudHost returns false on malformed URLs without throwing", () => {
  assert.equal(isCloudHost("not-a-url"), false);
  assert.equal(isCloudHost(""), false);
});

/* -------------------------------------------------------------------------- */
/*  Server/DC pagination (searchIssues → searchIssuesServer)                   */
/* -------------------------------------------------------------------------- */

// localhost host → non-cloud → offset (startAt) pagination path.
const DC_SERVER: JiraServerConfig = {
  id: "s1",
  name: "DC",
  baseUrl: "http://localhost:9999",
  auth: { type: "pat", token: "t" },
};

function dataset(n: number): RawJiraIssue[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    key: `T-${i}`,
    self: `http://localhost:9999/rest/api/2/issue/T-${i}`,
    fields: {},
  }));
}

type PageCall = { startAt: number; maxResults: number };

/** Mock `fetch` that serves a `/search` dataset by startAt/maxResults. */
function makeFetch(data: RawJiraIssue[], calls: PageCall[]) {
  return (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      startAt?: number;
      maxResults?: number;
    };
    const startAt = body.startAt ?? 0;
    const maxResults = body.maxResults ?? 50;
    calls.push({ startAt, maxResults });
    const issues = data.slice(startAt, startAt + maxResults);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ issues, total: data.length }),
      text: async () => "",
    } as unknown as Response;
  }) as typeof fetch;
}

test("server pagination returns all issues across pages, in order", async (t) => {
  const calls: PageCall[] = [];
  t.mock.method(globalThis, "fetch", makeFetch(dataset(1300), calls));
  const issues = await searchIssues(DC_SERVER, "project = X", {
    maxResults: 500,
    limit: 2000,
  });
  assert.equal(issues.length, 1300);
  assert.equal(issues[0].key, "T-0");
  assert.equal(issues[1299].key, "T-1299");
  // First page + two more (fetched in parallel after total is known).
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c.startAt).sort((a, b) => a - b),
    [0, 500, 1000],
  );
});

test("server pagination respects the limit cap", async (t) => {
  const calls: PageCall[] = [];
  t.mock.method(globalThis, "fetch", makeFetch(dataset(1300), calls));
  const issues = await searchIssues(DC_SERVER, "x", {
    maxResults: 500,
    limit: 1000,
  });
  assert.equal(issues.length, 1000);
  assert.equal(issues[999].key, "T-999");
  assert.equal(calls.length, 2); // [0,500) then [500,1000)
});

test("server pagination handles a single short page", async (t) => {
  const calls: PageCall[] = [];
  t.mock.method(globalThis, "fetch", makeFetch(dataset(300), calls));
  const issues = await searchIssues(DC_SERVER, "x", {
    maxResults: 500,
    limit: 2000,
  });
  assert.equal(issues.length, 300);
  assert.equal(calls.length, 1);
});

test("server pagination stops at an exact page boundary (no extra request)", async (t) => {
  const calls: PageCall[] = [];
  t.mock.method(globalThis, "fetch", makeFetch(dataset(500), calls));
  const issues = await searchIssues(DC_SERVER, "x", {
    maxResults: 500,
    limit: 2000,
  });
  assert.equal(issues.length, 500);
  assert.equal(calls.length, 1); // first page returned total === pageSize
});

/* -------------------------------------------------------------------------- */
/*  renderedFields expand + Cloud page size                                    */
/* -------------------------------------------------------------------------- */

const CLOUD_SERVER: JiraServerConfig = {
  id: "c1",
  name: "Cloud",
  baseUrl: "https://acme.atlassian.net",
  auth: { type: "basic", email: "a@b.c", token: "t" },
};

type CapturedBody = Record<string, unknown>;

/** Mock `fetch` recording request bodies; serves DC (startAt) or Cloud (token) pages. */
function makeCapturingFetch(data: RawJiraIssue[], bodies: CapturedBody[]) {
  return (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as CapturedBody;
    bodies.push(body);
    const maxResults = Number(body.maxResults ?? 50);
    let payload: unknown;
    if (String(url).includes("/search/jql")) {
      const start = body.nextPageToken ? Number(body.nextPageToken) : 0;
      const page = data.slice(start, start + maxResults);
      const next = start + page.length;
      payload =
        next < data.length
          ? { issues: page, nextPageToken: String(next), isLast: false }
          : { issues: page, isLast: true };
    } else {
      const startAt = Number(body.startAt ?? 0);
      payload = { issues: data.slice(startAt, startAt + maxResults), total: data.length };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => payload,
      text: async () => "",
    } as unknown as Response;
  }) as typeof fetch;
}

test("renderedFields expand is sent by default and omitted when disabled (DC)", async (t) => {
  const bodies: CapturedBody[] = [];
  t.mock.method(globalThis, "fetch", makeCapturingFetch(dataset(10), bodies));
  await searchIssues(DC_SERVER, "x", { limit: 100 });
  assert.deepEqual(bodies[0].expand, ["renderedFields"]);

  bodies.length = 0;
  await searchIssues(DC_SERVER, "x", { limit: 100, renderedFields: false });
  assert.equal("expand" in bodies[0], false);
});

test("Cloud search walks nextPageToken with 1000-issue pages and honors renderedFields:false", async (t) => {
  const bodies: CapturedBody[] = [];
  t.mock.method(globalThis, "fetch", makeCapturingFetch(dataset(2500), bodies));
  const issues = await searchIssues(CLOUD_SERVER, "x", {
    limit: 4000,
    renderedFields: false,
  });
  assert.equal(issues.length, 2500);
  assert.equal(issues[2499].key, "T-2499");
  // 1000 + 1000 + 500 → three sequential pages, each capped at 1000.
  assert.deepEqual(
    bodies.map((b) => b.maxResults),
    [1000, 1000, 1000],
  );
  assert.deepEqual(
    bodies.map((b) => b.nextPageToken),
    [undefined, "1000", "2000"],
  );
  assert.ok(bodies.every((b) => !("expand" in b)));

  // Default keeps the legacy expand and stops at the limit.
  bodies.length = 0;
  const capped = await searchIssues(CLOUD_SERVER, "x", { limit: 1500 });
  assert.equal(capped.length, 1500);
  assert.deepEqual(
    bodies.map((b) => b.maxResults),
    [1000, 500],
  );
  assert.equal(bodies[0].expand, "renderedFields");
});
