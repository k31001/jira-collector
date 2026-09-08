import "server-only";
import { PassThrough, Readable } from "node:stream";
import { createGzip, constants as zlib, type Gzip } from "node:zlib";

/**
 * NDJSON response body with optional gzip, for progress-streaming routes.
 *
 * Why not rely on Next's built-in compression: in `next start` the
 * `compression` middleware only sees Route Handler responses with their
 * Content-Type as an array (Next copies Web `Response` headers over with
 * `appendHeader`), and `compressible()` rejects non-string types — so every
 * Route Handler body goes out uncompressed regardless of its type or
 * Cache-Control. Compressing here also lets us `Z_SYNC_FLUSH` after every
 * event, which keeps tiny progress lines flowing instead of sitting in
 * zlib's buffer behind a multi-megabyte `source` line.
 *
 * `level: 1` — JSON with repeated keys already shrinks several-fold at the
 * fastest setting, and a cold 4,000-issue payload is compressed while the
 * user is waiting, so CPU time matters more than the last few percent.
 */
export type NdjsonStream = {
  /** Serialize one event as a line. No-op once ended or after the client left. */
  send: (event: unknown) => void;
  end: () => void;
  body: ReadableStream<Uint8Array>;
  /** Headers the response must carry for the chosen encoding. */
  headers: Record<string, string>;
};

export function ndjsonStream(options: { gzip: boolean }): NdjsonStream {
  const out = options.gzip ? createGzip({ level: 1 }) : new PassThrough();
  // A client that disconnects mid-stream destroys the readable side; the
  // resulting write error has nobody to report to.
  out.on("error", () => {});
  let ended = false;
  const send = (event: unknown) => {
    if (ended || out.destroyed) return;
    out.write(JSON.stringify(event) + "\n");
    if (options.gzip) (out as Gzip).flush(zlib.Z_SYNC_FLUSH);
  };
  const end = () => {
    if (ended) return;
    ended = true;
    if (!out.destroyed) out.end();
  };
  return {
    send,
    end,
    body: Readable.toWeb(out) as unknown as ReadableStream<Uint8Array>,
    headers: options.gzip
      ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" }
      : {},
  };
}

/** True when an `Accept-Encoding` header admits gzip (honoring `q=0`). */
export function acceptsGzip(acceptEncoding: string | null | undefined): boolean {
  if (!acceptEncoding) return false;
  for (const part of acceptEncoding.split(",")) {
    const [coding, ...params] = part.trim().split(";");
    const name = coding.trim().toLowerCase();
    if (name !== "gzip" && name !== "*") continue;
    const q = params
      .map((p) => p.trim())
      .find((p) => p.toLowerCase().startsWith("q="));
    if (q && !(Number(q.slice(2)) > 0)) continue;
    return true;
  }
  return false;
}
