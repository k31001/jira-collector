import { NextResponse } from "next/server";
import { getLatestComment, type LatestCommentResponse } from "@/lib/jira/client";
import { runWithConcurrency } from "@/lib/jira/fetch";
import { getServerConfig } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const PER_SERVER_CONCURRENCY = 8;

type Body = {
  requests: Array<{ serverId: string; key: string }>;
};

type ResponsePayload = {
  comments: Record<string, LatestCommentResponse | null>;
};

/**
 * Batch fetch the most recent comment for a list of (serverId, key) tuples.
 *
 * Requests are grouped by serverId so we only resolve each server config
 * once, and each server is hit with bounded concurrency to avoid swamping
 * Jira with hundreds of parallel requests.
 *
 * Result is a flat map keyed by `${serverId}::${key}`. Per-issue failures
 * become `null` so a single broken issue doesn't sink the whole batch.
 */
export async function POST(
  req: Request,
  _ctx: { params: Promise<{ id: string }> },
) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const requests = Array.isArray(body?.requests) ? body.requests : [];
  if (requests.length === 0) {
    return NextResponse.json({ comments: {} } satisfies ResponsePayload);
  }

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
        const key = `${serverId}::${keys[i]}`;
        result[key] = r.status === "fulfilled" ? r.value : null;
      });
    }),
  );

  return NextResponse.json({ comments: result } satisfies ResponsePayload);
}
