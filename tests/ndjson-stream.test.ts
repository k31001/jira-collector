import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { acceptsGzip, ndjsonStream } from "@/lib/ndjson-stream";

test("acceptsGzip parses Accept-Encoding including q-values and wildcard", () => {
  assert.equal(acceptsGzip(null), false);
  assert.equal(acceptsGzip(""), false);
  assert.equal(acceptsGzip("identity"), false);
  assert.equal(acceptsGzip("gzip"), true);
  assert.equal(acceptsGzip("gzip, deflate, br"), true);
  assert.equal(acceptsGzip("br;q=1.0, gzip;q=0.8"), true);
  assert.equal(acceptsGzip("gzip;q=0"), false);
  assert.equal(acceptsGzip("GZIP"), true);
  assert.equal(acceptsGzip("*"), true);
});

async function collect(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

test("plain stream emits one JSON line per event", async () => {
  const s = ndjsonStream({ gzip: false });
  assert.deepEqual(s.headers, {});
  s.send({ type: "plan", planned: 3 });
  s.send({ type: "done" });
  s.end();
  const text = (await collect(s.body)).toString("utf8");
  assert.equal(text, '{"type":"plan","planned":3}\n{"type":"done"}\n');
});

test("gzip stream flushes each event and round-trips the exact lines", async () => {
  const s = ndjsonStream({ gzip: true });
  assert.equal(s.headers["Content-Encoding"], "gzip");
  const reader = s.body.getReader();

  // A single tiny event must reach the reader before end() — that is what
  // keeps the progress bar live behind a multi-megabyte source line.
  s.send({ type: "progress", fetched: 1 });
  const first = await reader.read();
  assert.equal(first.done, false);
  assert.ok((first.value?.length ?? 0) > 0);

  const big = { type: "source", data: "x".repeat(200_000) };
  s.send(big);
  s.send({ type: "done" });
  s.end();

  const chunks: Uint8Array[] = [first.value as Uint8Array];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const compressed = Buffer.concat(chunks);
  const text = gunzipSync(compressed).toString("utf8");
  assert.equal(
    text,
    `{"type":"progress","fetched":1}\n${JSON.stringify(big)}\n{"type":"done"}\n`,
  );
  // Sanity: the repetitive payload actually shrank.
  assert.ok(compressed.length < text.length / 10);
});

test("send after end is a no-op", async () => {
  const s = ndjsonStream({ gzip: false });
  s.send({ a: 1 });
  s.end();
  s.send({ b: 2 });
  s.end();
  assert.equal((await collect(s.body)).toString("utf8"), '{"a":1}\n');
});
