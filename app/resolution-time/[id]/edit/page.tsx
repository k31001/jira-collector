import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  resolutionDashboards as table,
  resolutionDashboardSources,
  jiraServers,
} from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import {
  ResolutionDashboardForm,
  type ResolutionSourceItem,
} from "@/components/resolution-time/ResolutionDashboardForm";

export const dynamic = "force-dynamic";

export default async function EditResolutionDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dash = db.select().from(table).where(eq(table.id, id)).get();
  if (!dash) notFound();

  const sources = db
    .select()
    .from(resolutionDashboardSources)
    .where(eq(resolutionDashboardSources.dashboardId, id))
    .all()
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const servers = await db
    .select({
      id: jiraServers.id,
      name: jiraServers.name,
      baseUrl: jiraServers.baseUrl,
    })
    .from(jiraServers);

  const sourceItems: ResolutionSourceItem[] = sources.map((s) => {
    let milestones: { name: string; date: string }[] = [];
    try {
      const parsed = JSON.parse(s.milestones) as unknown;
      if (Array.isArray(parsed)) {
        milestones = parsed.filter(
          (m): m is { name: string; date: string } =>
            !!m &&
            typeof m === "object" &&
            typeof (m as { name?: unknown }).name === "string" &&
            typeof (m as { date?: unknown }).date === "string",
        );
      }
    } catch {
      // ignore malformed JSON
    }
    return {
      serverId: s.serverId,
      label: s.label,
      jql: s.jql,
      color: s.color,
      milestones,
    };
  });

  return (
    <>
      <PageHeader
        title={`${dash.name} · 편집`}
        description="JQL, 라벨, 색상, 윈도 및 버킷 설정을 변경합니다."
      />
      <div className="p-6">
        <ResolutionDashboardForm
          mode="edit"
          servers={servers}
          initial={{
            id: dash.id,
            name: dash.name,
            description: dash.description,
            windowDays: dash.windowDays,
            timeBucket: dash.timeBucket as "day" | "week" | "month" | "quarter",
            histogramBucketHours: dash.histogramBucketHours,
            refreshIntervalSec: dash.refreshIntervalSec,
            sources: sourceItems,
          }}
        />
      </div>
    </>
  );
}
