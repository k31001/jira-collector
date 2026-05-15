"use client";

import * as React from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JiraServerForm } from "@/components/jira-server-form/JiraServerForm";
import { deleteServer } from "@/actions/servers";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Server = {
  id: string;
  name: string;
  baseUrl: string;
  authType: string;
  createdAt: number;
};

export function ServersClient({ servers }: { servers: Server[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Server | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 서버를 삭제할까요? 관련된 대시보드 소스도 함께 제거됩니다.`)) return;
    try {
      await deleteServer(id);
      toast.success("서버를 삭제했습니다");
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
              서버 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 Jira 서버</DialogTitle>
            </DialogHeader>
            <JiraServerForm
              mode="create"
              onDone={() => {
                setCreateOpen(false);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {servers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            아직 등록된 Jira 서버가 없습니다. 우측 상단의 “서버 추가”로 시작하세요.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {servers.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{s.name}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="수정"
                    onClick={() => setEditing(s)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="삭제"
                    onClick={() => handleDelete(s.id, s.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <div className="font-mono text-xs">{s.baseUrl}</div>
                <div className="text-xs">
                  인증: {s.authType === "pat" ? "Personal Access Token" : "Basic (Email + Token)"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>서버 수정</DialogTitle>
          </DialogHeader>
          {editing && (
            <JiraServerForm
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
