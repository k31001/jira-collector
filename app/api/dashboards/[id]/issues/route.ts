import { NextResponse } from "next/server";
import { fetchDashboardIssues } from "@/lib/jira/fetch";
import { ttlCache } from "@/lib/server-cache";
import type { DashboardIssuesResult } from "@/lib/jira/types";

export const dynamic = "force-dynamic";

// 15-second TTL — short enough that manual refresh feels fresh, long enough
// to absorb the worst case (page reload + auto-poll firing back-to-back).
// `lite` responses are cached under a separate key so the two shapes never
// collide.
const cache = ttlCache<DashboardIssuesResult>(15_000);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const lite = url.searchParams.get("lite") === "1";
  const bypass = url.searchParams.get("bypass") === "1";
  const cacheKey = lite ? `${id}::lite` : id;
  if (bypass) cache.invalidate(cacheKey);
  const result = await cache.get(cacheKey, () =>
    fetchDashboardIssues(id, { lite }),
  );
  return NextResponse.json(result);
}
