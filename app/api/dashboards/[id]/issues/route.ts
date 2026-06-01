import { NextResponse } from "next/server";
import { fetchDashboardIssues } from "@/lib/jira/fetch";
import { ttlCache } from "@/lib/server-cache";
import type { DashboardIssuesResult } from "@/lib/jira/types";

export const dynamic = "force-dynamic";

// 15-second TTL — short enough that manual refresh feels fresh, long enough
// to absorb the worst case (page reload + auto-poll firing back-to-back).
const cache = ttlCache<DashboardIssuesResult>(15_000);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const bypass = url.searchParams.get("bypass") === "1";
  if (bypass) cache.invalidate(id);
  const result = await cache.get(id, () => fetchDashboardIssues(id));
  return NextResponse.json(result);
}
