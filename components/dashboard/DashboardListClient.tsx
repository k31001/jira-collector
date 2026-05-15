"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Pencil, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  cloneDashboard,
  deleteDashboard,
  setFavorite,
} from "@/actions/dashboards";
import { formatRelative } from "@/lib/utils";

type Dash = {
  id: string;
  name: string;
  description: string | null;
  favorite: boolean;
  updatedAt: number;
};

export function DashboardListClient({ dashboards }: { dashboards: Dash[] }) {
  const router = useRouter();
  const sorted = React.useMemo(
    () =>
      [...dashboards].sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      }),
    [dashboards],
  );

  async function onDelete(id: string, name: string) {
    if (!confirm(`"${name}" 대시보드를 삭제할까요? 이 대시보드에 저장된 노트도 함께 사라집니다.`)) return;
    try {
      await deleteDashboard(id);
      toast.success("삭제했습니다");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  async function onClone(id: string) {
    try {
      const r = await cloneDashboard(id);
      toast.success("복제했습니다");
      router.push(`/dashboards/${r.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "복제 실패");
    }
  }

  async function onToggleFavorite(id: string, value: boolean) {
    try {
      await setFavorite(id, value);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경 실패");
    }
  }

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <p className="text-muted-foreground">
            아직 대시보드가 없습니다. 첫 대시보드를 만들어보세요.
          </p>
          <Button asChild>
            <Link href="/dashboards/new">대시보드 만들기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((d) => (
        <Card key={d.id} className="group flex flex-col">
          <CardHeader className="space-y-1 pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">
                <Link href={`/dashboards/${d.id}`} className="hover:underline">
                  {d.name}
                </Link>
              </CardTitle>
              <button
                aria-label="즐겨찾기"
                className="text-muted-foreground hover:text-amber-400"
                onClick={() => onToggleFavorite(d.id, !d.favorite)}
              >
                <Star
                  className={d.favorite ? "h-4 w-4 fill-current text-amber-400" : "h-4 w-4"}
                />
              </button>
            </div>
            {d.description && (
              <CardDescription className="line-clamp-2">{d.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex items-center justify-between pt-0 mt-auto">
            <span className="text-xs text-muted-foreground">{formatRelative(d.updatedAt * 1000)}</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button asChild variant="ghost" size="icon" aria-label="수정">
                <Link href={`/dashboards/${d.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="복제"
                onClick={() => onClone(d.id)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="삭제"
                onClick={() => onDelete(d.id, d.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
