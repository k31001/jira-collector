import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db/client";
import { dashboards as dashboardsTable } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DashboardListClient } from "@/components/dashboard/DashboardListClient";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  const list = await db
    .select({
      id: dashboardsTable.id,
      name: dashboardsTable.name,
      description: dashboardsTable.description,
      favorite: dashboardsTable.favorite,
      updatedAt: dashboardsTable.updatedAt,
    })
    .from(dashboardsTable);

  return (
    <>
      <PageHeader
        title="대시보드"
        description="여러 Jira 서버 이슈를 한 테이블에서 모아 보세요."
        actions={
          <Button asChild>
            <Link href="/dashboards/new">
              <Plus className="h-4 w-4" />새 대시보드
            </Link>
          </Button>
        }
      />
      <div className="p-6">
        <DashboardListClient dashboards={list} />
      </div>
    </>
  );
}
