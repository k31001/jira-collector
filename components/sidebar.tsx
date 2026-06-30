"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Download,
  LayoutDashboard,
  Settings,
  Server,
  Palette,
  Percent,
  Sliders,
  Tag,
  PlusCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { ThemeToggle } from "@/components/theme-toggle";

type DashboardLink = { id: string; name: string; favorite: boolean };

const COLLAPSE_KEY = "sidebar-collapsed";

export function Sidebar({
  dashboards,
  resolutionDashboards,
}: {
  dashboards: DashboardLink[];
  resolutionDashboards: DashboardLink[];
}) {
  const pathname = usePathname();

  // Collapsed state lets the user reclaim horizontal space. Server renders
  // expanded; the persisted choice is applied after mount to avoid a hydration
  // mismatch. A ref mirrors it so the global key handler reads the latest value.
  const [collapsed, setCollapsed] = React.useState(false);
  const collapsedRef = React.useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    let stored = false;
    try {
      stored = window.localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {}
    collapsedRef.current = stored;
    setCollapsed(stored);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setCollapsedPersist = React.useCallback((next: boolean) => {
    collapsedRef.current = next;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {}
  }, []);

  // ⌘B / Ctrl+B toggles the sidebar (mirrors the ⌘K command palette shortcut).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsedPersist(!collapsedRef.current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCollapsedPersist]);

  const sorted = React.useMemo(() => {
    return [...dashboards].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [dashboards]);

  const sortedResolution = React.useMemo(() => {
    return [...resolutionDashboards].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [resolutionDashboards]);

  // Collapsed: render a slim rail with a reopen button so the menu can always
  // be brought back (and the theme toggle stays reachable).
  if (collapsed) {
    return (
      <aside className="hidden md:flex w-12 shrink-0 flex-col items-center gap-2 border-r bg-card/40 py-3">
        <button
          type="button"
          onClick={() => setCollapsedPersist(false)}
          aria-label="사이드바 열기"
          title="사이드바 열기 (⌘B)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <ThemeToggle />
      </aside>
    );
  }

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card/40">
      <div className="flex h-14 items-center justify-between px-4 border-b">
        <Link href="/dashboards" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground text-xs">JC</span>
          jira-collector
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setCollapsedPersist(true)}
            aria-label="사이드바 접기"
            title="사이드바 접기 (⌘B)"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        <div>
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              대시보드
            </span>
            <Link
              href="/dashboards/new"
              className="text-muted-foreground hover:text-foreground"
              aria-label="새 대시보드"
            >
              <PlusCircle className="h-4 w-4" />
            </Link>
          </div>
          <ul className="space-y-0.5">
            <SidebarLink
              href="/dashboards"
              active={pathname === "/dashboards"}
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="모든 대시보드"
            />
            {sorted.length === 0 && (
              <li className="px-2 py-2 text-xs text-muted-foreground">
                아직 대시보드가 없습니다.
              </li>
            )}
            {sorted.map((d) => (
              <SidebarLink
                key={d.id}
                href={`/dashboards/${d.id}`}
                active={pathname === `/dashboards/${d.id}`}
                icon={
                  d.favorite ? (
                    <Star className="h-4 w-4 fill-current text-amber-400" />
                  ) : (
                    <LayoutDashboard className="h-4 w-4 opacity-60" />
                  )
                }
                label={d.name}
              />
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              해결 시간
            </span>
            <Link
              href="/resolution-time/new"
              className="text-muted-foreground hover:text-foreground"
              aria-label="새 해결 시간 대시보드"
            >
              <PlusCircle className="h-4 w-4" />
            </Link>
          </div>
          <ul className="space-y-0.5">
            <SidebarLink
              href="/resolution-time"
              active={pathname === "/resolution-time"}
              icon={<Timer className="h-4 w-4" />}
              label="모든 대시보드"
            />
            {sortedResolution.length === 0 && (
              <li className="px-2 py-2 text-xs text-muted-foreground">
                아직 대시보드가 없습니다.
              </li>
            )}
            {sortedResolution.map((d) => (
              <SidebarLink
                key={d.id}
                href={`/resolution-time/${d.id}`}
                active={pathname === `/resolution-time/${d.id}`}
                icon={
                  d.favorite ? (
                    <Star className="h-4 w-4 fill-current text-amber-400" />
                  ) : (
                    <Timer className="h-4 w-4 opacity-60" />
                  )
                }
                label={d.name}
              />
            ))}
          </ul>
        </div>

        <div>
          <div className="px-2 pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              도움말
            </span>
          </div>
          <ul className="space-y-0.5">
            <SidebarLink
              href="/docs/usage"
              active={pathname === "/docs/usage"}
              icon={<BookOpen className="h-4 w-4" />}
              label="사용 매뉴얼"
            />
            <SidebarLink
              href="/docs/install"
              active={pathname === "/docs/install"}
              icon={<Download className="h-4 w-4" />}
              label="설치 매뉴얼"
            />
          </ul>
        </div>

        <div>
          <div className="px-2 pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              설정
            </span>
          </div>
          <ul className="space-y-0.5">
            <SidebarLink
              href="/settings"
              active={pathname === "/settings"}
              icon={<Settings className="h-4 w-4" />}
              label="설정 허브"
            />
            <SidebarLink
              href="/settings/servers"
              active={pathname.startsWith("/settings/servers")}
              icon={<Server className="h-4 w-4" />}
              label="Jira 서버"
            />
            <SidebarLink
              href="/settings/custom-statuses"
              active={pathname.startsWith("/settings/custom-statuses")}
              icon={<Tag className="h-4 w-4" />}
              label="커스텀 상태"
            />
            <SidebarLink
              href="/settings/status-colors"
              active={pathname.startsWith("/settings/status-colors")}
              icon={<Palette className="h-4 w-4" />}
              label="상태 컬러"
            />
            <SidebarLink
              href="/settings/smart-filters"
              active={pathname.startsWith("/settings/smart-filters")}
              icon={<Sliders className="h-4 w-4" />}
              label="스마트 필터"
            />
            <SidebarLink
              href="/settings/ratio-analysis"
              active={pathname.startsWith("/settings/ratio-analysis")}
              icon={<Percent className="h-4 w-4" />}
              label="비율 분석"
            />
          </ul>
        </div>
      </nav>

      <div className="border-t p-3 text-[11px] text-muted-foreground">
        single-user · local · v{APP_VERSION}
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          active
            ? "bg-accent text-accent-foreground font-medium"
            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}
