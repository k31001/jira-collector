import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIssue } from "@/lib/jira/normalize";
import type { RawJiraIssue } from "@/lib/jira/types";

const SERVER = { id: "s1", name: "Test", baseUrl: "https://example.atlassian.net" };
const EMPTY_CTX = { customStatuses: [], customMappings: [], statusColors: [] };

function makeIssue(fields: Partial<RawJiraIssue["fields"]>): RawJiraIssue {
  return {
    id: "1",
    key: "TEST-1",
    self: "",
    fields: { summary: "x", ...(fields as RawJiraIssue["fields"]) },
  };
}

test("resolved uses resolutiondate when present", () => {
  const raw = makeIssue({
    status: { name: "Done", statusCategory: { key: "done", colorName: "green" } },
    resolutiondate: "2026-05-15T10:00:00.000Z",
    updated: "2026-05-16T12:00:00.000Z",
  });
  const n = normalizeIssue(raw, SERVER, EMPTY_CTX);
  assert.equal(n.resolved, "2026-05-15T10:00:00.000Z");
});

test("resolved falls back to updated when status category is done but resolutiondate is missing", () => {
  const raw = makeIssue({
    status: { name: "Done", statusCategory: { key: "done", colorName: "green" } },
    resolutiondate: null,
    updated: "2026-05-16T12:00:00.000Z",
  });
  const n = normalizeIssue(raw, SERVER, EMPTY_CTX);
  assert.equal(
    n.resolved,
    "2026-05-16T12:00:00.000Z",
    "Done-category issues without resolutiondate should be treated as resolved at `updated`",
  );
});

test("resolved is undefined when status is not in Done category and resolutiondate is missing", () => {
  const raw = makeIssue({
    status: { name: "In Progress", statusCategory: { key: "indeterminate", colorName: "yellow" } },
    resolutiondate: null,
    updated: "2026-05-16T12:00:00.000Z",
  });
  const n = normalizeIssue(raw, SERVER, EMPTY_CTX);
  assert.equal(n.resolved, undefined);
});

test("resolved is undefined for To Do issues", () => {
  const raw = makeIssue({
    status: { name: "To Do", statusCategory: { key: "new", colorName: "blue-gray" } },
    updated: "2026-05-16T12:00:00.000Z",
  });
  const n = normalizeIssue(raw, SERVER, EMPTY_CTX);
  assert.equal(n.resolved, undefined);
});
