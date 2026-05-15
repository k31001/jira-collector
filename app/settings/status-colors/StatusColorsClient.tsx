"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { HexColorPicker } from "react-colorful";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setStatusColor, deleteStatusColor } from "@/actions/custom-statuses";
import { getContrastColor } from "@/lib/utils";

type Item = { statusName: string; color: string };

export function StatusColorsClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#10B981");
  const [pending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) {
      toast.error("상태 이름을 입력하세요");
      return;
    }
    startTransition(async () => {
      try {
        await setStatusColor({ statusName: name.trim(), color });
        toast.success("저장했습니다");
        setName("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  async function remove(s: string) {
    if (!confirm(`"${s}" 오버라이드를 삭제할까요?`)) return;
    try {
      await deleteStatusColor(s);
      toast.success("삭제했습니다");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">새 오버라이드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Jira 상태 이름 (예: To Do)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-9 w-16 rounded border shadow-sm"
                  style={{ backgroundColor: color }}
                  aria-label="컬러"
                />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2">
                <HexColorPicker color={color} onChange={setColor} />
              </PopoverContent>
            </Popover>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="font-mono w-32"
            />
            <Button onClick={add} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus className="h-4 w-4" />}
              저장
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-medium">등록된 오버라이드</div>
        {items.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              등록된 항목이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <ul className="rounded-lg border divide-y">
            {items.map((it) => (
              <li key={it.statusName} className="flex items-center gap-3 px-3 py-2">
                <span
                  className="rounded px-2 py-0.5 text-xs"
                  style={{ backgroundColor: it.color, color: getContrastColor(it.color) }}
                >
                  {it.statusName}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{it.color}</span>
                <span className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="삭제"
                  onClick={() => remove(it.statusName)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
