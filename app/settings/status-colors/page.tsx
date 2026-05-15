import { db } from "@/lib/db/client";
import { statusColors } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatusColorsClient } from "./StatusColorsClient";

export const dynamic = "force-dynamic";

export default async function StatusColorsPage() {
  const rows = await db.select().from(statusColors).all();
  return (
    <>
      <PageHeader
        title="상태 컬러 오버라이드"
        description="원본 Jira 상태 이름과 매칭되는 컬러를 사용자 지정합니다. 커스텀 상태에 매핑된 항목은 커스텀 상태의 컬러가 우선합니다."
      />
      <div className="p-6">
        <StatusColorsClient items={rows} />
      </div>
    </>
  );
}
