import { test } from "node:test";
import assert from "node:assert/strict";
import { isCloudHost } from "@/lib/jira/client";

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
