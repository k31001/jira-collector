import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compileJql,
  parseJql,
  tryCompileJql,
  JqlParseError,
} from "@/lib/jql-eval";
import type { NormalizedIssue } from "@/lib/jira/types";

function issue(overrides: Partial<NormalizedIssue> = {}): NormalizedIssue {
  return {
    serverId: "s1",
    serverName: "Team A",
    key: "PROJ-1",
    url: "https://example.com/browse/PROJ-1",
    summary: "Test issue",
    rawStatus: "To Do",
    statusCategoryKey: "new",
    effectiveStatus: { label: "To Do", color: "#888" },
    assignee: { name: "Demo User" },
    reporter: { name: "Jane Park" },
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-02T00:00:00Z",
    resolved: undefined,
    priority: "High",
    issueType: "Bug",
    labels: ["windows", "regression"],
    ...overrides,
  };
}

test("eq matches a string field", () => {
  const fn = compileJql("priority = High");
  assert.equal(fn(issue()), true);
  assert.equal(fn(issue({ priority: "Low" })), false);
});

test("neq inverts equality", () => {
  const fn = compileJql("priority != High");
  assert.equal(fn(issue()), false);
  assert.equal(fn(issue({ priority: "Low" })), true);
});

test("labels in (windows) matches when any label is in the list", () => {
  const fn = compileJql("labels in (windows, win10)");
  assert.equal(fn(issue()), true);
  assert.equal(fn(issue({ labels: ["linux"] })), false);
});

test("labels not in (...) excludes any match", () => {
  const fn = compileJql("labels not in (windows)");
  assert.equal(fn(issue()), false);
  assert.equal(fn(issue({ labels: ["linux"] })), true);
});

test("AND requires every clause", () => {
  const fn = compileJql("priority = High AND labels in (windows)");
  assert.equal(fn(issue()), true);
  assert.equal(fn(issue({ priority: "Low" })), false);
  assert.equal(fn(issue({ labels: ["linux"] })), false);
});

test("status compares against effectiveStatus.label", () => {
  const fn = compileJql('status = "In Progress"');
  assert.equal(
    fn(
      issue({
        effectiveStatus: { label: "In Progress", color: "#fff" },
      }),
    ),
    true,
  );
  assert.equal(fn(issue()), false);
});

test("is empty / is not empty on assignee", () => {
  const empty = compileJql("assignee is empty");
  const notEmpty = compileJql("assignee is not empty");
  assert.equal(empty(issue({ assignee: undefined })), true);
  assert.equal(empty(issue()), false);
  assert.equal(notEmpty(issue({ assignee: undefined })), false);
  assert.equal(notEmpty(issue()), true);
});

test("resolution = Done maps to status category", () => {
  const done = compileJql("resolution = Done");
  const unresolved = compileJql("resolution = Unresolved");
  const open = issue({ statusCategoryKey: "indeterminate" });
  const closed = issue({ statusCategoryKey: "done" });
  assert.equal(done(closed), true);
  assert.equal(done(open), false);
  assert.equal(unresolved(open), true);
  assert.equal(unresolved(closed), false);
});

test("quoted values keep spaces", () => {
  const fn = compileJql('assignee = "Demo User"');
  assert.equal(fn(issue()), true);
  assert.equal(fn(issue({ assignee: { name: "Other" } })), false);
});

test("unknown field throws JqlParseError", () => {
  assert.throws(() => parseJql("madeup = x"), JqlParseError);
});

test("tryCompileJql returns null on invalid input", () => {
  assert.equal(tryCompileJql("labels in"), null);
  assert.equal(tryCompileJql(""), null);
  assert.notEqual(tryCompileJql("priority = High"), null);
});
