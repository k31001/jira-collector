import "server-only";
import { getLatestComment, type LatestCommentResponse } from "./client";
import { runWithConcurrency } from "./fetch";
import { getServerConfig } from "@/lib/db/queries";

const PER_SERVER_CONCURRENCY = 8;

export type CommentRequest = { serverId: string; key: string };

/**
 * Batch-fetch the most recent comment for a list of (serverId, key) tuples.
 *
 * Requests are grouped by serverId so each server config is resolved once, and
 * each server is hit with bounded concurrency to avoid swamping Jira with
 * hundreds of parallel requests. The result is a flat map keyed by
 * `${serverId}::${key}`; per-issue failures become `null` so one broken issue
 * doesn't sink the whole batch.
 *
 * Shared by the issue dashboard and the resolution-time dashboard, both of
 * which fetch comments lazily (the bulk issue search omits the heavy `comment`
 * field and loads the latest comment per visible row on demand).
 */
export async function fetchLatestComments(
  requests: CommentRequest[],
): Promise<Record<string, LatestCommentResponse | null>> {
  const grouped = new Map<string, string[]>();
  for (const r of requests) {
    if (!r?.serverId || !r?.key) continue;
    const arr = grouped.get(r.serverId);
    if (arr) arr.push(r.key);
    else grouped.set(r.serverId, [r.key]);
  }

  const result: Record<string, LatestCommentResponse | null> = {};

  await Promise.all(
    Array.from(grouped.entries()).map(async ([serverId, keys]) => {
      const serverConfig = getServerConfig(serverId);
      if (!serverConfig) {
        for (const k of keys) result[`${serverId}::${k}`] = null;
        return;
      }
      const settled = await runWithConcurrency(
        keys,
        PER_SERVER_CONCURRENCY,
        (k) => getLatestComment(serverConfig, k),
      );
      settled.forEach((r, i) => {
        result[`${serverId}::${keys[i]}`] =
          r.status === "fulfilled" ? r.value : null;
      });
    }),
  );

  return result;
}
