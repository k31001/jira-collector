"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LayoutDashboard,
  PlusCircle,
  Server,
  Settings,
  Tag,
  Palette,
} from "lucide-react";

type DashLink = { id: string; name: string };

export function CommandPalette({ dashboards }: { dashboards: DashLink[] }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-xl">
        <DialogTitle className="sr-only">명령 팔레트</DialogTitle>
        <Command className="rounded-lg overflow-hidden">
          <Command.Input
            placeholder="대시보드 점프 또는 명령 검색…"
            className="w-full px-4 py-3 text-sm bg-transparent outline-none border-b"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-1">
            <Command.Empty className="p-4 text-sm text-muted-foreground text-center">
              결과 없음
            </Command.Empty>
            <Command.Group heading="대시보드">
              {dashboards.map((d) => (
                <Command.Item
                  key={d.id}
                  onSelect={() => go(`/dashboards/${d.id}`)}
                  className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm aria-selected:bg-accent"
                >
                  <LayoutDashboard className="h-4 w-4 opacity-60" />
                  {d.name}
                </Command.Item>
              ))}
              <Command.Item
                onSelect={() => go("/dashboards/new")}
                className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm aria-selected:bg-accent"
              >
                <PlusCircle className="h-4 w-4 opacity-60" />새 대시보드
              </Command.Item>
            </Command.Group>
            <Command.Group heading="설정">
              <Command.Item
                onSelect={() => go("/settings")}
                className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm aria-selected:bg-accent"
              >
                <Settings className="h-4 w-4 opacity-60" />
                설정 허브
              </Command.Item>
              <Command.Item
                onSelect={() => go("/settings/servers")}
                className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm aria-selected:bg-accent"
              >
                <Server className="h-4 w-4 opacity-60" />
                Jira 서버
              </Command.Item>
              <Command.Item
                onSelect={() => go("/settings/custom-statuses")}
                className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm aria-selected:bg-accent"
              >
                <Tag className="h-4 w-4 opacity-60" />
                커스텀 상태
              </Command.Item>
              <Command.Item
                onSelect={() => go("/settings/status-colors")}
                className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm aria-selected:bg-accent"
              >
                <Palette className="h-4 w-4 opacity-60" />
                상태 컬러
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
