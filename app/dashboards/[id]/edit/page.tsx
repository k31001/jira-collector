import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import {
  dashboards as dashboardsTable,
  dashboardSources,
  jiraServers,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { DashboardForm } from "@/components/dashboard/DashboardForm";
import type { SourceItem } from "@/components/source-editor/SourceEditor";

export const dynamic = "force-dynamic";

export default async function EditDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dash = db
    .select()
    .from(dashboardsTable)
    .where(eq(dashboardsTable.id, id))
    .get();
  if (!dash) notFound();

  const sources = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  const servers = await db
    .select({ id: jiraServers.id, name: jiraServers.name, baseUrl: jiraServers.baseUrl })
    .from(jiraServers);

  const sourceItems: SourceItem[] = sources.map((s) => ({
    serverId: s.serverId,
    sourceType: s.sourceType as "jql" | "urls",
    jql: s.jql ?? "",
    issueUrls: s.issueUrls ? (JSON.parse(s.issueUrls) as string[]) : [],
  }));

  return (
    <>
      <PageHeader
        title={`${dash.name} · 편집`}
        description="이름, 소스, 새로고침 주기를 변경합니다."
      />
      <div className="p-6">
        <DashboardForm
          mode="edit"
          servers={servers}
          initial={{
            id: dash.id,
            name: dash.name,
            description: dash.description,
            refreshIntervalSec: dash.refreshIntervalSec,
            sources: sourceItems,
            visibleColumns: JSON.parse(dash.visibleColumns) as string[],
            columnOrder: JSON.parse(dash.columnOrder) as string[],
          }}
        />
      </div>
    </>
  );
}
