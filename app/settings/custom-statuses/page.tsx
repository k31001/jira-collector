import { db } from "@/lib/db/client";
import { customStatuses, customStatusMappings } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { CustomStatusesClient } from "./CustomStatusesClient";

export const dynamic = "force-dynamic";

export default async function CustomStatusesPage() {
  const css = await db.select().from(customStatuses).all();
  const mappings = await db.select().from(customStatusMappings).all();

  const enriched = css.map((c) => ({
    ...c,
    mappings: mappings
      .filter((m) => m.customStatusId === c.id)
      .map((m) => m.jiraStatusName),
  }));

  return (
    <>
      <PageHeader
        title="커스텀 상태"
        description="여러 Jira 상태를 하나의 커스텀 상태로 묶어 색상과 이름을 통일합니다."
      />
      <div className="p-6">
        <CustomStatusesClient items={enriched} />
      </div>
    </>
  );
}
