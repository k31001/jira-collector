import { NextResponse } from "next/server";
import { fetchDashboardDwell } from "@/lib/jira/fetch-dwell";
import { ttlCache } from "@/lib/server-cache";
import type { DashboardDwellResult } from "@/lib/jira/fetch-dwell";

export const dynamic = "force-dynamic";

// Dwell analysis is expensive (one changelog request per issue), so cache it
// longer than the issue list and only ever fetch it on explicit user action.
const cache = ttlCache<DashboardDwellResult>(60_000);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  if (url.searchParams.get("bypass") === "1") cache.invalidate(id);
  const result = await cache.get(id, () => fetchDashboardDwell(id));
  return NextResponse.json(result);
}
