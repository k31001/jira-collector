import { test } from "node:test";
import assert from "node:assert/strict";
import { adfToText, commentBodyToText } from "@/lib/jira/adf";

test("adfToText returns plain text from a simple paragraph", () => {
  const adf = {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello world" }],
      },
    ],
  };
  assert.equal(adfToText(adf).trim(), "Hello world");
});

test("adfToText concatenates multiple paragraphs with newlines", () => {
  const adf = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Line 1" }] },
      { type: "paragraph", content: [{ type: "text", text: "Line 2" }] },
    ],
  };
  assert.equal(adfToText(adf).trim(), "Line 1\nLine 2");
});

test("adfToText handles nested lists", () => {
  const adf = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
        ],
      },
    ],
  };
  const out = adfToText(adf);
  assert.match(out, /a/);
  assert.match(out, /b/);
});

test("commentBodyToText prefers renderedBody (HTML from Server/DC)", () => {
  const result = commentBodyToText({
    renderedBody: "<p>Hello <b>world</b></p>",
    body: { type: "doc" },
  });
  assert.equal(result, "<p>Hello <b>world</b></p>");
});

test("commentBodyToText falls back to ADF when renderedBody is missing", () => {
  const result = commentBodyToText({
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Cloud comment" }] },
      ],
    },
  });
  assert.equal(result, "Cloud comment");
});

test("commentBodyToText handles plain string body (Server/DC legacy)", () => {
  const result = commentBodyToText({ body: "legacy text" });
  assert.equal(result, "legacy text");
});

test("commentBodyToText returns empty string on missing body", () => {
  assert.equal(commentBodyToText({}), "");
});
