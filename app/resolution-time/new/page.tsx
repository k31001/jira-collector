import { db } from "@/lib/db/client";
import { jiraServers } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { ResolutionDashboardForm } from "@/components/resolution-time/ResolutionDashboardForm";

export const dynamic = "force-dynamic";

export default async function NewResolutionDashboardPage() {
  const servers = await db
    .select({
      id: jiraServers.id,
      name: jiraServers.name,
      baseUrl: jiraServers.baseUrl,
    })
    .from(jiraServers);

  return (
    <>
      <PageHeader
        title="새 해결 시간 대시보드"
        description="비교하고 싶은 JQL을 여러 개 등록해 평균 해결 시간을 한 화면에서 추적하세요."
      />
      <div className="p-6">
        <ResolutionDashboardForm mode="create" servers={servers} />
      </div>
    </>
  );
}
