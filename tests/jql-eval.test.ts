import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compileJql,
  customFieldFingerprint,
  extractCustomFieldIds,
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

/* ------------------------------ date fields ------------------------------ */

test("relative date: created > -4w", () => {
  const now = Date.parse("2026-06-02T00:00:00Z");
  const fn = compileJql("created > -4w", now);
  // created 2 weeks ago → within last 4 weeks → true
  assert.equal(
    fn(issue({ created: "2026-05-19T00:00:00Z" })),
    true,
  );
  // created 6 weeks ago → older than 4 weeks → false
  assert.equal(
    fn(issue({ created: "2026-04-20T00:00:00Z" })),
    false,
  );
});

test("relative date units d/h/m", () => {
  const now = Date.parse("2026-06-02T12:00:00Z");
  assert.equal(
    compileJql("created > -2d", now)(issue({ created: "2026-06-01T12:00:00Z" })),
    true,
  );
  assert.equal(
    compileJql("created > -3h", now)(issue({ created: "2026-06-02T10:00:00Z" })),
    true,
  );
  assert.equal(
    compileJql("created > -30m", now)(issue({ created: "2026-06-02T10:00:00Z" })),
    false,
  );
});

test("absolute date comparison", () => {
  const fn = compileJql('created >= "2026-05-01"');
  assert.equal(fn(issue({ created: "2026-05-10T00:00:00Z" })), true);
  assert.equal(fn(issue({ created: "2026-04-10T00:00:00Z" })), false);
});

test("date field with AND and other clauses", () => {
  const now = Date.parse("2026-06-02T00:00:00Z");
  const fn = compileJql("issuetype = Bug AND created > -1w", now);
  assert.equal(
    fn(issue({ issueType: "Bug", created: "2026-05-30T00:00:00Z" })),
    true,
  );
  assert.equal(
    fn(issue({ issueType: "Bug", created: "2026-04-30T00:00:00Z" })),
    false,
  );
  assert.equal(
    fn(issue({ issueType: "Story", created: "2026-05-30T00:00:00Z" })),
    false,
  );
});

test("resolved is empty / is not empty", () => {
  const open = compileJql("resolved is empty");
  const done = compileJql("resolved is not empty");
  assert.equal(open(issue({ resolved: undefined })), true);
  assert.equal(open(issue({ resolved: "2026-05-01T00:00:00Z" })), false);
  assert.equal(done(issue({ resolved: "2026-05-01T00:00:00Z" })), true);
});

test("date comparison on a missing date is false", () => {
  const now = Date.parse("2026-06-02T00:00:00Z");
  assert.equal(
    compileJql("resolved > -4w", now)(issue({ resolved: undefined })),
    false,
  );
});

test("relational operators rejected on text fields", () => {
  assert.throws(() => parseJql("priority > High"), JqlParseError);
  assert.equal(tryCompileJql("status < Done"), null);
});

/* ----------------------------- custom fields ----------------------------- */

test("custom field numeric comparison via cf[id]", () => {
  const fn = compileJql("cf[10016] >= 5");
  assert.equal(fn(issue({ customFields: { customfield_10016: 8 } })), true);
  assert.equal(fn(issue({ customFields: { customfield_10016: 3 } })), false);
  // also accepts the customfield_NNNNN form
  assert.equal(
    compileJql("customfield_10016 > 5")(
      issue({ customFields: { customfield_10016: 8 } }),
    ),
    true,
  );
});

test("custom field select value equality", () => {
  const fn = compileJql('cf[10050] = "Windows"');
  assert.equal(
    fn(issue({ customFields: { customfield_10050: { value: "Windows" } } })),
    true,
  );
  assert.equal(
    fn(issue({ customFields: { customfield_10050: { value: "Linux" } } })),
    false,
  );
});

test("custom field multi-value IN matches any element", () => {
  const fn = compileJql("cf[10070] in (a, b)");
  assert.equal(
    fn(issue({ customFields: { customfield_10070: [{ value: "b" }, { value: "z" }] } })),
    true,
  );
  assert.equal(
    fn(issue({ customFields: { customfield_10070: [{ value: "x" }] } })),
    false,
  );
});

test("custom field is empty / is not empty", () => {
  const empty = compileJql("cf[10016] is empty");
  const notEmpty = compileJql("cf[10016] is not empty");
  assert.equal(empty(issue({ customFields: {} })), true);
  assert.equal(empty(issue({ customFields: { customfield_10016: 5 } })), false);
  assert.equal(
    notEmpty(issue({ customFields: { customfield_10016: 5 } })),
    true,
  );
});

test("custom field combines with builtin clauses via AND", () => {
  const fn = compileJql('issuetype = Bug AND cf[10016] >= 5');
  assert.equal(
    fn(issue({ issueType: "Bug", customFields: { customfield_10016: 8 } })),
    true,
  );
  assert.equal(
    fn(issue({ issueType: "Bug", customFields: { customfield_10016: 2 } })),
    false,
  );
  assert.equal(
    fn(issue({ issueType: "Story", customFields: { customfield_10016: 8 } })),
    false,
  );
});

test("missing custom field value fails comparison gracefully", () => {
  assert.equal(
    compileJql("cf[10016] > 5")(issue({ customFields: undefined })),
    false,
  );
  assert.equal(compileJql('cf[10050] = "Windows"')(issue({})), false);
});

test("extractCustomFieldIds normalizes both cf[N] and customfield_N forms", () => {
  assert.deepEqual(extractCustomFieldIds("cf[10016] >= 5"), [
    "customfield_10016",
  ]);
  assert.deepEqual(extractCustomFieldIds("customfield_64512 = X"), [
    "customfield_64512",
  ]);
  assert.deepEqual(extractCustomFieldIds("CF[10016] > 1"), [
    "customfield_10016",
  ]);
});

test("extractCustomFieldIds collects multiple ids and dedupes", () => {
  assert.deepEqual(
    extractCustomFieldIds(
      'issuetype = Bug AND cf[10016] >= 5 AND customfield_10050 = "Win" AND cf[10016] < 20',
    ).sort(),
    ["customfield_10016", "customfield_10050"],
  );
});

test("extractCustomFieldIds returns [] when no custom field is referenced", () => {
  assert.deepEqual(extractCustomFieldIds("priority = High AND created > -4w"), []);
  assert.deepEqual(extractCustomFieldIds(""), []);
});

test("customFieldFingerprint is stable across order and duplicates", () => {
  assert.equal(
    customFieldFingerprint(["cf[10050] = X", "cf[10016] >= 5"]),
    customFieldFingerprint(["customfield_10016 >= 1", "cf[10050] = Y"]),
  );
  assert.equal(
    customFieldFingerprint(["cf[10016] > 1 AND cf[10050] = A"]),
    "customfield_10016,customfield_10050",
  );
  assert.equal(customFieldFingerprint([]), "");
  assert.equal(customFieldFingerprint(["priority = High"]), "");
  // A newly referenced field changes the fingerprint (what busts the cache).
  assert.notEqual(
    customFieldFingerprint(["cf[10016] = A"]),
    customFieldFingerprint(["cf[10016] = A", "cf[99999] = B"]),
  );
});
