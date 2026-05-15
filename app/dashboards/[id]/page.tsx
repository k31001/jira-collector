import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Edit3 } from "lucide-react";
import { db } from "@/lib/db/client";
import {
  dashboards as dashboardsTable,
  dashboardSources,
} from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { IssuesTable } from "@/components/issues-table/IssuesTable";
import { FavoriteButton } from "@/components/dashboard/FavoriteButton";
import type { ColumnKey } from "@/components/issues-table/columns";

export const dynamic = "force-dynamic";

export default async function DashboardViewPage({
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

  const visibleColumns = JSON.parse(dash.visibleColumns) as ColumnKey[];

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FavoriteButton id={dash.id} favorite={dash.favorite} />
            {dash.name}
          </span>
        }
        description={
          dash.description ?? `${sources.length}개 소스 · 새로고침 ${dash.refreshIntervalSec}초`
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboards/${dash.id}/edit`}>
              <Edit3 className="h-4 w-4" />
              편집
            </Link>
          </Button>
        }
      />
      {sources.length === 0 ? (
        <div className="p-6">
          <div className="rounded-lg border bg-card p-8 text-center space-y-3">
            <p className="text-muted-foreground">
              이 대시보드에 소스가 없습니다. JQL이나 이슈 URL을 추가해 보세요.
            </p>
            <Button asChild>
              <Link href={`/dashboards/${dash.id}/edit`}>소스 추가</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 py-4">
          <IssuesTable
            dashboardId={dash.id}
            refreshIntervalSec={dash.refreshIntervalSec}
            initialVisibleColumns={visibleColumns}
          />
        </div>
      )}
    </>
  );
}
