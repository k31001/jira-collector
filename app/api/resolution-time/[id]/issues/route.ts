import { NextResponse } from "next/server";
import { fetchResolutionDashboardIssues } from "@/lib/jira/fetch-resolution";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const result = await fetchResolutionDashboardIssues(id);
  return NextResponse.json(result);
}
