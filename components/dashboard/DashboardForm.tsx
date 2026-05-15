"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SourceEditor, type SourceItem } from "@/components/source-editor/SourceEditor";
import type { RegisteredServer } from "@/lib/jira/url-parser";
import {
  createDashboard,
  updateDashboard,
  type DashboardInput,
} from "@/actions/dashboards";

type Props = {
  mode: "create" | "edit";
  servers: RegisteredServer[];
  initial?: {
    id: string;
    name: string;
    description?: string | null;
    refreshIntervalSec: number;
    sources: SourceItem[];
    visibleColumns?: string[];
    columnOrder?: string[];
  };
};

export function DashboardForm({ mode, servers, initial }: Props) {
  const router = useRouter();
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [refresh, setRefresh] = React.useState(initial?.refreshIntervalSec ?? 300);
  const [sources, setSources] = React.useState<SourceItem[]>(initial?.sources ?? []);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload: DashboardInput = {
          name,
          description: description || undefined,
          refreshIntervalSec: refresh,
          visibleColumns:
            initial?.visibleColumns ?? ["key", "status", "summary", "latestComment", "note"],
          columnOrder:
            initial?.columnOrder ?? ["key", "status", "summary", "latestComment", "note"],
          sources,
        };
        if (mode === "create") {
          const { id } = await createDashboard(payload);
          toast.success("대시보드를 생성했습니다");
          router.push(`/dashboards/${id}`);
        } else if (initial) {
          await updateDashboard(initial.id, payload);
          toast.success("대시보드를 업데이트했습니다");
          router.push(`/dashboards/${initial.id}`);
          router.refresh();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <Label htmlFor="name">이름</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="내 보고용 대시보드"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="refresh">자동 새로고침 (초)</Label>
          <Input
            id="refresh"
            type="number"
            min={0}
            value={refresh}
            onChange={(e) => setRefresh(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="desc">설명 (선택)</Label>
        <Textarea
          id="desc"
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="이 대시보드의 목적, 사용 방법 등"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>소스 (JQL 또는 이슈 URL 목록)</Label>
        <p className="text-xs text-muted-foreground">
          여러 서버를 섞어서 추가할 수 있습니다. 빈 소스는 저장되지 않습니다.
        </p>
        <SourceEditor servers={servers} value={sources} onChange={setSources} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === "create" ? "생성" : "저장"}
        </Button>
      </div>
    </form>
  );
}
