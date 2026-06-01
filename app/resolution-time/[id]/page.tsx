import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Edit3 } from "lucide-react";
import { db } from "@/lib/db/client";
import {
  resolutionDashboards as table,
  resolutionDashboardSources,
} from "@/lib/db/schema";
import { listCustomFacetsWithValues } from "@/lib/db/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ResolutionFavoriteButton } from "@/components/resolution-time/ResolutionFavoriteButton";
import { ResolutionDashboardView } from "@/components/resolution-time/ResolutionDashboardView";

export const dynamic = "force-dynamic";

export default async function ResolutionDashboardViewPage({
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

  const customFacets = listCustomFacetsWithValues();

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ResolutionFavoriteButton id={dash.id} favorite={dash.favorite} />
            {dash.name}
          </span>
        }
        description={
          dash.description ??
          `${sources.length}개 JQL · 윈도 ${dash.windowDays}일 · ${dash.timeBucket} 단위`
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/resolution-time/${dash.id}/edit`}>
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
              이 대시보드에 JQL이 없습니다. 편집해서 추가해 주세요.
            </p>
            <Button asChild>
              <Link href={`/resolution-time/${dash.id}/edit`}>JQL 추가</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ResolutionDashboardView
          dashboardId={dash.id}
          refreshIntervalSec={dash.refreshIntervalSec}
          initialWindowDays={dash.windowDays}
          initialTimeBucket={dash.timeBucket as "day" | "week" | "month" | "quarter"}
          initialHistogramBucketHours={dash.histogramBucketHours}
          customFacets={customFacets}
        />
      )}
    </>
  );
}
