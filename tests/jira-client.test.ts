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
