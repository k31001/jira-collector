import { db } from "@/lib/db/client";
import { jiraServers } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { DashboardForm } from "@/components/dashboard/DashboardForm";

export const dynamic = "force-dynamic";

export default async function NewDashboardPage() {
  const servers = await db
    .select({ id: jiraServers.id, name: jiraServers.name, baseUrl: jiraServers.baseUrl })
    .from(jiraServers);

  return (
    <>
      <PageHeader
        title="새 대시보드"
        description="이 대시보드에서 보고 싶은 이슈를 JQL 쿼리 또는 URL 목록으로 정의하세요."
      />
      <div className="p-6">
        <DashboardForm mode="create" servers={servers} />
      </div>
    </>
  );
}
