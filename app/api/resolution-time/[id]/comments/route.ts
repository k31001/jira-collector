import { NextResponse } from "next/server";
import {
  fetchLatestComments,
  type CommentRequest,
} from "@/lib/jira/comments-batch";

export const dynamic = "force-dynamic";

type Body = { requests: CommentRequest[] };

/**
 * Latest comments for the resolution-time dashboard's slow-issue table, fetched
 * lazily per visible row so the bulk issue search can omit the heavy `comment`
 * field. Keyed by serverId + key, so it spans the dashboard's multiple sources.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const requests = Array.isArray(body?.requests) ? body.requests : [];
  if (requests.length === 0) {
    return NextResponse.json({ comments: {} });
  }
  const comments = await fetchLatestComments(requests);
  return NextResponse.json({ comments });
}
