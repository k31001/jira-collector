import Link from "next/link";
import { Plus, Timer, Trash2 } from "lucide-react";
import { db } from "@/lib/db/client";
import { resolutionDashboards as table } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResolutionFavoriteButton } from "@/components/resolution-time/ResolutionFavoriteButton";
import { ResolutionDeleteButton } from "@/components/resolution-time/ResolutionDeleteButton";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ResolutionDashboardsPage() {
  const list = await db
    .select({
      id: table.id,
      name: table.name,
      description: table.description,
      favorite: table.favorite,
      updatedAt: table.updatedAt,
    })
    .from(table);

  const sorted = [...list].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <PageHeader
        title="해결 시간 대시보드"
        description="여러 JQL의 평균 해결 시간(Resolution Time)을 한곳에서 비교하고, 시간축 변화·분포 히스토그램을 확인하세요."
        actions={
          <Button asChild>
            <Link href="/resolution-time/new">
              <Plus className="h-4 w-4" />새 대시보드
            </Link>
          </Button>
        }
      />
      <div className="p-6">
        {sorted.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center space-y-3">
            <Timer className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-medium">아직 대시보드가 없습니다</h2>
            <p className="text-sm text-muted-foreground">
              비교하고 싶은 JQL을 하나의 대시보드에 모아 평균 해결 시간을 추적할 수 있습니다.
            </p>
            <Button asChild>
              <Link href="/resolution-time/new">
                <Plus className="h-4 w-4" />첫 대시보드 만들기
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((d) => (
              <Card key={d.id} className="group">
                <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ResolutionFavoriteButton id={d.id} favorite={d.favorite} />
                    <Link
                      href={`/resolution-time/${d.id}`}
                      className="hover:underline"
                    >
                      {d.name}
                    </Link>
                  </CardTitle>
                  <ResolutionDeleteButton id={d.id} name={d.name}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </ResolutionDeleteButton>
                </CardHeader>
                <CardContent className="space-y-2">
                  {d.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {d.description}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    수정 {formatDate(d.updatedAt * 1000)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
