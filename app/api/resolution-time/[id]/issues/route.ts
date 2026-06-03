import { fetchResolutionDashboardIssues } from "@/lib/jira/fetch-resolution";
import { ttlCache } from "@/lib/server-cache";
import type { ResolutionDashboardIssuesResult } from "@/lib/jira/fetch-resolution";

export const dynamic = "force-dynamic";

const cache = ttlCache<ResolutionDashboardIssuesResult>(15_000);

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
 * (heavy) issue arrays are sent once rather than again in a final payload. On a
 * warm cache hit (within the 15s TTL) the loader isn't invoked, so we replay
 * the cached sources as `source` events before `done`.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  if (url.searchParams.get("bypass") === "1") cache.invalidate(id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Swallow enqueue-after-close (client disconnected) so progress
      // callbacks can't throw into the fetch logic.
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // controller already closed — ignore
        }
      };
      let emittedAnySource = false;
      try {
        const result = await cache.get(id, () =>
          fetchResolutionDashboardIssues(id, {
            onPlan: (planned, perSource) =>
              send({ type: "plan", planned, perSource }),
            onProgress: (fetched) => send({ type: "progress", fetched }),
            onSource: (source, index) => {
              emittedAnySource = true;
              send({ type: "source", index, data: source });
            },
          }),
        );
        // Warm cache hit → the loader (and onSource) didn't run; replay the
        // cached sources so the client always reconstructs from `source`
        // events. Each issue is therefore sent exactly once.
        if (!emittedAnySource) {
          result.sources.forEach((source, index) =>
            send({ type: "source", index, data: source }),
          );
        }
        send({ type: "done", fetchedAt: result.fetchedAt });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
