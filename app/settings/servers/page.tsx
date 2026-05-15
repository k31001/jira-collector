import { db } from "@/lib/db/client";
import { jiraServers } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { ServersClient } from "./ServersClient";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const rows = await db
    .select({
      id: jiraServers.id,
      name: jiraServers.name,
      baseUrl: jiraServers.baseUrl,
      authType: jiraServers.authType,
      createdAt: jiraServers.createdAt,
    })
    .from(jiraServers)
    .all();

  return (
    <>
      <PageHeader
        title="Jira 서버"
        description="이슈를 가져올 Jira 서버를 등록합니다. 토큰은 암호화되어 로컬 DB에 저장됩니다."
      />
      <div className="p-6">
        <ServersClient servers={rows} />
      </div>
    </>
  );
}
