import { NextResponse } from "next/server";
import { fetchResolutionDashboardIssues } from "@/lib/jira/fetch-resolution";
import { ttlCache } from "@/lib/server-cache";
import type { ResolutionDashboardIssuesResult } from "@/lib/jira/fetch-resolution";

export const dynamic = "force-dynamic";

const cache = ttlCache<ResolutionDashboardIssuesResult>(15_000);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const bypass = url.searchParams.get("bypass") === "1";
  if (bypass) cache.invalidate(id);
  const result = await cache.get(id, () => fetchResolutionDashboardIssues(id));
  return NextResponse.json(result);
}
