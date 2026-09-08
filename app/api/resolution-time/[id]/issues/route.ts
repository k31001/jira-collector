import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resolutionDashboards } from "@/lib/db/schema";
import {
  fetchResolutionDashboardIssues,
  resolutionFetchFingerprint,
} from "@/lib/jira/fetch-resolution";
import { acceptsGzip, ndjsonStream } from "@/lib/ndjson-stream";
import {
  invalidateResolutionIssuesCache,
  resolutionIssuesCache,
  resolutionIssuesCacheKey,
  resolutionIssuesTtlMs,
} from "@/lib/resolution-issues-cache";

export const dynamic = "force-dynamic";

/**
 * Streams newline-delimited JSON (NDJSON) so the client can show a real
 * progress bar while a cold load runs:
 *   {"type":"plan","planned":N,"perSource":[...]}   // once counts are known
 *   {"type":"progress","fetched":M}                 // after each fetched page
 *   {"type":"source","index":i,"data":{...}}        // a single source finished
 *   {"type":"done","fetchedAt":T}                   // all sources sent
 *   {"type":"error","message":"…"}                  // on failure
 *
 * The client reconstructs the full result from the `source` events, so the
 * (heavy) issue arrays are sent once rather than again in a final payload.
 *
 * Caching: the result is kept server-side for the dashboard's own refresh
 * interval (see lib/resolution-issues-cache.ts) so reloads and new tabs are
 * instant; `?bypass=1` (the 새로고침 button) forces a cold load. On a cache hit
 * the loader isn't invoked, so we replay the cached sources as `source`
 * events before `done`.
 *
 * Compression: gzip'd in-route with a flush per event (Next's own compression
 * never applies to Route Handlers — see lib/ndjson-stream.ts), so a 4,000-issue
 * source line travels several times smaller while progress lines stay live.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  if (url.searchParams.get("bypass") === "1") invalidateResolutionIssuesCache(id);

  const dash = db
    .select({ refreshIntervalSec: resolutionDashboards.refreshIntervalSec })
    .from(resolutionDashboards)
    .where(eq(resolutionDashboards.id, id))
    .get();
  const ttlMs = resolutionIssuesTtlMs(dash?.refreshIntervalSec ?? 0);
  const cacheKey = resolutionIssuesCacheKey(id, await resolutionFetchFingerprint());

  const stream = ndjsonStream({
    gzip: acceptsGzip(req.headers.get("accept-encoding")),
  });

  // Runs while the response streams; `send` is a no-op once the client is
  // gone, so progress callbacks can't throw into the fetch logic.
  void (async () => {
    let emittedAnySource = false;
    try {
      const result = await resolutionIssuesCache.get(
        cacheKey,
        () =>
          fetchResolutionDashboardIssues(id, {
            onPlan: (planned, perSource) =>
              stream.send({ type: "plan", planned, perSource }),
            onProgress: (fetched) => stream.send({ type: "progress", fetched }),
            onSource: (source, index) => {
              emittedAnySource = true;
              stream.send({ type: "source", index, data: source });
            },
          }),
        ttlMs,
      );
      // Warm cache hit → the loader (and onSource) didn't run; replay the
      // cached sources so the client always reconstructs from `source`
      // events. Each issue is therefore sent exactly once.
      if (!emittedAnySource) {
        result.sources.forEach((source, index) =>
          stream.send({ type: "source", index, data: source }),
        );
      }
      stream.send({ type: "done", fetchedAt: result.fetchedAt });
    } catch (err) {
      stream.send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      stream.end();
    }
  })();

  return new Response(stream.body, {
    headers: {
      ...stream.headers,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // nginx buffers proxied responses by default; this header turns that
      // off for this response so the progress stream reaches the browser as
      // it is produced.
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
