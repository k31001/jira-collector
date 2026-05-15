"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomStatusForm } from "@/components/custom-status/CustomStatusForm";
import { deleteCustomStatus } from "@/actions/custom-statuses";
import { getContrastColor } from "@/lib/utils";

type Item = {
  id: string;
  name: string;
  color: string;
  mappings: string[];
};

export function CustomStatusesClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);

  async function onDelete(id: string, name: string) {
    if (!confirm(`"${name}" 커스텀 상태를 삭제할까요?`)) return;
    try {
      await deleteCustomStatus(id);
      toast.success("삭제했습니다");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              커스텀 상태 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 커스텀 상태</DialogTitle>
            </DialogHeader>
            <CustomStatusForm
              mode="create"
              onDone={() => {
                setCreateOpen(false);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            아직 커스텀 상태가 없습니다. 예: “이슈 분석 중” → In Progress, Resolved를 묶기
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-2">
                  <CardTitle className="text-base">
                    <span
                      className="inline-flex items-center rounded px-2 py-0.5 text-xs"
                      style={{ backgroundColor: c.color, color: getContrastColor(c.color) }}
                    >
                      {c.name}
                    </span>
                  </CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(c)}
                    aria-label="수정"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(c.id, c.name)}
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-1.5">매핑된 Jira 상태</div>
                <div className="flex flex-wrap gap-1.5">
                  {c.mappings.length === 0 ? (
                    <span className="text-xs text-muted-foreground">매핑 없음</span>
                  ) : (
                    c.mappings.map((m) => (
                      <span
                        key={m}
                        className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {m}
                      </span>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>커스텀 상태 수정</DialogTitle>
          </DialogHeader>
          {editing && (
            <CustomStatusForm
              mode="edit"
              initial={editing}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
