import { NextResponse } from "next/server";
import { fetchDashboardIssues } from "@/lib/jira/fetch";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const result = await fetchDashboardIssues(id);
  return NextResponse.json(result);
}
