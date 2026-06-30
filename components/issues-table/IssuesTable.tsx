"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUpDown,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Copy,
  Download,
  ExternalLink,
  GripVertical,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "./StatusBadge";
import { NoteCell } from "./NoteCell";
import { StatusStatsBar } from "./StatusStatsBar";
import { TrendChart } from "./TrendChart";
import { ReportDialog } from "./ReportDialog";
import {
  ALL_COLUMNS,
  REQUIRED_COLUMNS,
  columnLabel,
  reconcileColumnOrder,
  type ColumnKey,
} from "./columns";
import { SmartFilters } from "@/components/resolution-time/SmartFilters";
import {
  applyFacets,
  buildFacets,
  type FacetSelection,
} from "@/lib/resolution-time";
import type { DashboardIssuesResult, NormalizedIssue } from "@/lib/jira/types";
import { cn, formatDate, formatRelative, truncate } from "@/lib/utils";
import { updateDashboard } from "@/actions/dashboards";

const FILTERS_STORAGE_KEY = (dashboardId: string) =>
  `dashboard-filters:${dashboardId}`;

function loadFacetSelection(dashboardId: string): FacetSelection {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY(dashboardId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FacetSelection;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

type Props = {
  dashboardId: string;
  dashboardName: string;
  refreshIntervalSec: number;
  initialVisibleColumns: ColumnKey[];
  initialColumnOrder: ColumnKey[];
};

const PAGE_SIZES = [10, 30, 60];

export function IssuesTable({
  dashboardId,
  dashboardName,
  refreshIntervalSec,
  initialVisibleColumns,
  initialColumnOrder,
}: Props) {
  const [reportOpen, setReportOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "updated", desc: true },
  ]);
  const [statusFilter, setStatusFilter] = React.useState<Set<string>>(new Set());

  // Smart-filter facet selection. Start empty (SSR-safe) and hydrate from
  // localStorage after mount, then persist on change once loaded — same shape
  // as the trend-chart prefs, to avoid an SSR/client hydration mismatch.
  const [facetSelection, setFacetSelection] = React.useState<FacetSelection>({});
  const [filtersLoaded, setFiltersLoaded] = React.useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    setFacetSelection(loadFacetSelection(dashboardId));
    setFiltersLoaded(true);
  }, [dashboardId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (!filtersLoaded) return;
    try {
      window.localStorage.setItem(
        FILTERS_STORAGE_KEY(dashboardId),
        JSON.stringify(facetSelection),
      );
    } catch {}
  }, [dashboardId, filtersLoaded, facetSelection]);

  const [pagination, setPagination] = React.useState<PaginationState>(() => {
    if (typeof window === "undefined") return { pageIndex: 0, pageSize: 30 };
    try {
      const raw = window.localStorage.getItem(
        `issues-table-page-size:${dashboardId}`,
      );
      const parsed = raw ? Number(raw) : NaN;
      const allowed = PAGE_SIZES.includes(parsed) ? parsed : 30;
      return { pageIndex: 0, pageSize: allowed };
    } catch {
      return { pageIndex: 0, pageSize: 30 };
    }
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        `issues-table-page-size:${dashboardId}`,
        String(pagination.pageSize),
      );
    } catch {}
  }, [dashboardId, pagination.pageSize]);

  const [visibility, setVisibility] = React.useState<VisibilityState>(() => {
    const map: VisibilityState = {};
    for (const c of ALL_COLUMNS) {
      map[c.key] = initialVisibleColumns.includes(c.key) || REQUIRED_COLUMNS.includes(c.key);
    }
    return map;
  });

  const [columnOrder, setColumnOrder] = React.useState<ColumnKey[]>(() =>
    reconcileColumnOrder(initialColumnOrder),
  );

  // Persist visibility (debounced)
  React.useEffect(() => {
    const visible = ALL_COLUMNS.filter((c) => visibility[c.key]).map((c) => c.key);
    const sameAsInit =
      visible.length === initialVisibleColumns.length &&
      visible.every((v) => initialVisibleColumns.includes(v));
    if (sameAsInit) return;
    const t = setTimeout(() => {
      updateDashboard(dashboardId, { visibleColumns: visible }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility, dashboardId]);

  // Persist column order (debounced)
  React.useEffect(() => {
    const sameAsInit =
      columnOrder.length === initialColumnOrder.length &&
      columnOrder.every((v, i) => initialColumnOrder[i] === v);
    if (sameAsInit) return;
    const t = setTimeout(() => {
      updateDashboard(dashboardId, { columnOrder }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnOrder, dashboardId]);

  // Manual-refresh flag — when the user clicks "새로고침" we want to bypass
  // the 15s server-side TTL cache on /api/dashboards/[id]/issues, otherwise
  // the same `fetchedAt` comes back and the visible-page comment batch never
  // re-fires.
  const bypassNextFetchRef = React.useRef(false);

  const query = useQuery<DashboardIssuesResult>({
    queryKey: ["issues", dashboardId],
    queryFn: async () => {
      // `lite=1` strips the heavy `comment` field from the upstream Jira
      // search. Comments are fetched lazily for the visible page below.
      const bypass = bypassNextFetchRef.current;
      bypassNextFetchRef.current = false;
      const params = `?lite=1${bypass ? "&bypass=1" : ""}`;
      const res = await fetch(`/api/dashboards/${dashboardId}/issues${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("이슈 fetch 실패");
      return (await res.json()) as DashboardIssuesResult;
    },
    refetchInterval: refreshIntervalSec > 0 ? refreshIntervalSec * 1000 : false,
    staleTime: refreshIntervalSec * 1000,
  });

  // Lazy comment cache: lookups keyed by `${serverId}::${key}`. `undefined`
  // means "not fetched yet" (show spinner), `null` means "no comment exists"
  // (show em-dash). Reset whenever a fresh upstream fetch lands so stale
  // comments don't leak across data revisions.
  type LazyComment = {
    author?: string;
    body: string;
    created: string;
  };
  const [lazyComments, setLazyComments] = React.useState<
    Record<string, LazyComment | null>
  >({});
  // Epoch counter bumped in lockstep with lazyComments wipes — the visible
  // batch fetch effect can't depend on `lazyComments` itself (would create
  // a self-feedback loop) but it needs a signal to re-fire after a wipe,
  // otherwise the cleared cache is never repopulated.
  const [commentsResetEpoch, setCommentsResetEpoch] = React.useState(0);
  React.useEffect(() => {
    if (query.data?.fetchedAt) {
      setLazyComments({});
      setCommentsResetEpoch((e) => e + 1);
    }
  }, [query.data?.fetchedAt]);

  React.useEffect(() => {
    if (query.data?.errors?.length) {
      for (const e of query.data.errors.slice(0, 3)) {
        toast.error(`${e.serverName}: ${e.message}`);
      }
    }
  }, [query.data?.errors]);

  const columns = React.useMemo<ColumnDef<NormalizedIssue>[]>(
    () => [
      {
        id: "key",
        accessorFn: (r) => r.key,
        header: ({ column }) => sortableHeader(column, "Key"),
        cell: ({ row }) => (
          <a
            href={row.original.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-foreground hover:underline"
          >
            {row.original.key}
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        ),
        size: 110,
      },
      {
        id: "status",
        accessorFn: (r) => r.effectiveStatus.label,
        header: ({ column }) => sortableHeader(column, "상태"),
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.effectiveStatus.label}
            color={row.original.effectiveStatus.color}
            rawLabel={row.original.rawStatus}
          />
        ),
        size: 110,
      },
      {
        id: "summary",
        accessorFn: (r) => r.summary,
        header: ({ column }) => sortableHeader(column, "Summary"),
        cell: ({ row }) => (
          <div className="min-w-[260px] max-w-[480px]">
            <div className="text-sm leading-snug">{row.original.summary}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {row.original.serverName} · {row.original.issueType ?? "—"}
            </div>
          </div>
        ),
      },
      {
        id: "latestComment",
        accessorFn: (r) => r.latestComment?.body ?? "",
        header: "최근 코멘트",
        enableSorting: false,
        cell: ({ row }) => {
          const eager = row.original.latestComment;
          const lazyKey = `${row.original.serverId}::${row.original.key}`;
          const lazy = lazyComments[lazyKey];
          // Priority: eager (from /issues route in non-lite mode) > lazy fetch.
          const c = eager ?? lazy;
          if (c === null) {
            return <span className="text-muted-foreground text-xs">—</span>;
          }
          if (c === undefined) {
            return (
              <span
                className="inline-flex items-center gap-1 text-muted-foreground text-xs"
                aria-label="코멘트 불러오는 중"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
              </span>
            );
          }
          const body = stripHtml(c.body);
          return (
            <div className="min-w-[200px] max-w-[360px]">
              <div className="text-xs leading-snug">{truncate(body, 200)}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {c.author ?? "익명"} · {formatRelative(c.created)}
              </div>
            </div>
          );
        },
      },
      {
        id: "note",
        accessorFn: (r) => r.note ?? "",
        header: "내 메모",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-[200px] max-w-[360px]">
            <NoteCell
              dashboardId={dashboardId}
              serverId={row.original.serverId}
              issueKey={row.original.key}
              initial={row.original.note ?? ""}
            />
          </div>
        ),
      },
      {
        id: "assignee",
        accessorFn: (r) => r.assignee?.name ?? "",
        header: ({ column }) => sortableHeader(column, "담당자"),
        cell: ({ row }) =>
          row.original.assignee?.name ? (
            <span className="text-sm">{row.original.assignee.name}</span>
          ) : (
            <span className="text-muted-foreground text-xs">미할당</span>
          ),
      },
      {
        id: "reporter",
        accessorFn: (r) => r.reporter?.name ?? "",
        header: ({ column }) => sortableHeader(column, "보고자"),
        cell: ({ row }) =>
          row.original.reporter?.name ? (
            <span className="text-sm">{row.original.reporter.name}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: "created",
        accessorFn: (r) => r.created ?? "",
        header: ({ column }) => sortableHeader(column, "생성일"),
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">{formatDate(row.original.created)}</span>
        ),
      },
      {
        id: "updated",
        accessorFn: (r) => r.updated ?? "",
        header: ({ column }) => sortableHeader(column, "수정일"),
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">{formatDate(row.original.updated)}</span>
        ),
      },
      {
        id: "resolved",
        accessorFn: (r) => r.resolved ?? "",
        header: ({ column }) => sortableHeader(column, "해결일"),
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">
            {row.original.resolved ? formatDate(row.original.resolved) : "—"}
          </span>
        ),
      },
      {
        id: "priority",
        accessorFn: (r) => r.priority ?? "",
        header: ({ column }) => sortableHeader(column, "우선순위"),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.priority ?? "—"}</span>
        ),
      },
      {
        id: "issueType",
        accessorFn: (r) => r.issueType ?? "",
        header: ({ column }) => sortableHeader(column, "이슈 타입"),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.issueType ?? "—"}</span>
        ),
      },
      {
        id: "labels",
        accessorFn: (r) => r.labels.join(", "),
        header: "Labels",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.labels.slice(0, 5).map((l) => (
              <span
                key={l}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {l}
              </span>
            ))}
          </div>
        ),
      },
      {
        id: "serverName",
        accessorFn: (r) => r.serverName,
        header: ({ column }) => sortableHeader(column, "서버"),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.serverName}</span>
        ),
      },
    ],
    [dashboardId, lazyComments],
  );

  const data = React.useMemo(
    () => query.data?.issues ?? [],
    [query.data?.issues],
  );

  // Precompute one lowercase haystack per issue, then reuse on every keystroke.
  // Recomputing the haystack inside the search useMemo would re-allocate
  // O(N) strings and lower-case calls per keystroke; doing it once when the
  // issue list changes keeps the search reactive even at thousands of rows.
  const haystacks = React.useMemo(() => {
    const out = new Array<string>(data.length);
    for (let i = 0; i < data.length; i++) {
      const it = data[i];
      out[i] = (
        it.key +
        " " +
        it.summary +
        " " +
        it.effectiveStatus.label +
        " " +
        it.rawStatus +
        " " +
        (it.assignee?.name ?? "") +
        " " +
        (it.reporter?.name ?? "") +
        " " +
        it.serverName +
        " " +
        (it.note ?? "") +
        " " +
        it.labels.join(" ")
      ).toLowerCase();
    }
    return out;
  }, [data]);

  // Facet options reflect the full corpus so the dropdowns stay stable while
  // selecting; the apply step then narrows the rows.
  const facets = React.useMemo(() => buildFacets(data), [data]);

  const facetFiltered = React.useMemo(
    () => applyFacets(data, facetSelection),
    [data, facetSelection],
  );

  const afterStatusFilter = React.useMemo(() => {
    if (statusFilter.size === 0) return facetFiltered;
    return facetFiltered.filter((i) => statusFilter.has(i.effectiveStatus.label));
  }, [facetFiltered, statusFilter]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return afterStatusFilter;
    const lower = search.toLowerCase();
    // Status filter is rare; when active, we filter by computing the index
    // into `haystacks` from `data`. When inactive, afterStatusFilter === data
    // and indices line up trivially.
    if (afterStatusFilter === data) {
      const out: typeof data = [];
      for (let i = 0; i < data.length; i++) {
        if (haystacks[i].includes(lower)) out.push(data[i]);
      }
      return out;
    }
    // Status-filtered: build a Set of post-filter identities then walk data
    const allowed = new Set(afterStatusFilter);
    const out: typeof data = [];
    for (let i = 0; i < data.length; i++) {
      if (!allowed.has(data[i])) continue;
      if (haystacks[i].includes(lower)) out.push(data[i]);
    }
    return out;
  }, [afterStatusFilter, search, data, haystacks]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility: visibility, columnOrder, pagination },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onColumnOrderChange: (updater) =>
      setColumnOrder((prev) =>
        typeof updater === "function" ? (updater(prev) as ColumnKey[]) : (updater as ColumnKey[]),
      ),
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Reset to first page when filters/search/data change so the user isn't
  // stranded on a no-longer-existent page.
  React.useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [search, statusFilter, facetSelection, filtered.length]);

  // Compute the (serverId, key) pairs for the currently-rendered page. Used
  // to drive the lazy comment batch loader below.
  const currentPageRows = table.getRowModel().rows;
  const visibleKeysSignature = React.useMemo(
    () =>
      currentPageRows
        .map((r) => `${r.original.serverId}::${r.original.key}`)
        .sort()
        .join("|"),
    [currentPageRows],
  );

  // Batch-fetch latest comments for the visible page. Skips keys already
  // cached, including ones eagerly populated on the issue itself.
  React.useEffect(() => {
    if (currentPageRows.length === 0) return;
    const missing: Array<{ serverId: string; key: string }> = [];
    for (const r of currentPageRows) {
      if (r.original.latestComment) continue; // eager from server
      const k = `${r.original.serverId}::${r.original.key}`;
      if (k in lazyComments) continue; // already fetched (or known absent)
      missing.push({ serverId: r.original.serverId, key: r.original.key });
    }
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboards/${dashboardId}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requests: missing }),
          },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          comments: Record<string, LazyComment | null>;
        };
        if (cancelled) return;
        setLazyComments((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(json.comments)) {
            next[k] = json.comments[k];
          }
          // Anything we asked for but didn't get back: mark as null so we
          // don't re-request on every render.
          for (const m of missing) {
            const k = `${m.serverId}::${m.key}`;
            if (!(k in next)) next[k] = null;
          }
          return next;
        });
      } catch {
        // Network errors silently leave entries undefined; the cell shows a
        // spinner, and the next render attempt will re-trigger this effect.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKeysSignature, dashboardId, commentsResetEpoch]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setColumnOrder((prev) => {
      const from = prev.indexOf(active.id as ColumnKey);
      const to = prev.indexOf(over.id as ColumnKey);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function copyMarkdown() {
    const rows = table.getRowModel().rows;
    if (rows.length === 0) {
      toast.info("복사할 행이 없습니다");
      return;
    }
    const visibleCols = table.getVisibleLeafColumns();
    const header = `| ${visibleCols.map((c) => columnLabel(c.id as ColumnKey)).join(" | ")} |`;
    const sep = `| ${visibleCols.map(() => "---").join(" | ")} |`;
    const body = rows.map((r) => {
      const issue = r.original;
      const cells = visibleCols.map((c) =>
        mdCell(c.id as ColumnKey, issue, lazyComments),
      );
      return `| ${cells.join(" | ")} |`;
    });
    const md = [header, sep, ...body].join("\n");
    navigator.clipboard.writeText(md);
    toast.success("Markdown으로 복사했습니다");
  }

  function exportCsv() {
    const rows = table.getRowModel().rows;
    const visibleCols = table.getVisibleLeafColumns();
    const header = visibleCols.map((c) => columnLabel(c.id as ColumnKey));
    const body = rows.map((r) =>
      visibleCols.map((c) =>
        csvCell(c.id as ColumnKey, r.original, lazyComments),
      ),
    );
    const csv = [header, ...body]
      .map((line) => line.map(escapeCsv).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-${dashboardId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-0">
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        dashboardName={dashboardName}
        issues={data}
      />
      <TrendChart dashboardId={dashboardId} issues={data} />
      <StatusStatsBar
        issues={facetFiltered}
        selected={statusFilter}
        onChange={setStatusFilter}
      />

      {data.length > 0 && (
        <div className="border-t px-6 py-2">
          <SmartFilters
            facets={facets}
            value={facetSelection}
            onChange={setFacetSelection}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-6 py-2 border-t">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이슈 검색…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {query.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : query.data?.fetchedAt ? (
            <>마지막 갱신 {formatRelative(query.data.fetchedAt)}</>
          ) : null}
          {filtered.length !== data.length ? (
            <span>· {filtered.length}/{data.length}</span>
          ) : data.length > 0 ? (
            <span>· {data.length}개</span>
          ) : null}
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            bypassNextFetchRef.current = true;
            query.refetch();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </Button>
        <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
          <CalendarRange className="h-3.5 w-3.5" />
          기간 보고서
        </Button>
        <Button variant="outline" size="sm" onClick={copyMarkdown}>
          <Copy className="h-3.5 w-3.5" />
          Markdown
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="h-3.5 w-3.5" />
              컬럼
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
            <DropdownMenuLabel>표시할 컬럼</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_COLUMNS.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={visibility[c.key] ?? false}
                disabled={c.required}
                onCheckedChange={(v) =>
                  setVisibility((prev) => ({ ...prev, [c.key]: !!v }))
                }
              >
                {c.label}
                {c.required && (
                  <span className="ml-2 text-[10px] text-muted-foreground">(필수)</span>
                )}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <div className="px-2 py-1 text-[11px] text-muted-foreground">
              헤더를 드래그하여 순서를 바꿀 수 있습니다
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-t">
        {query.isError ? (
          <div className="p-6 text-sm text-destructive">
            {(query.error as Error).message}
          </div>
        ) : query.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 이슈 불러오는 중…
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => {
                  const headerIds = hg.headers.map((h) => h.column.id);
                  return (
                    <TableRow key={hg.id}>
                      <SortableContext items={headerIds} strategy={horizontalListSortingStrategy}>
                        {hg.headers.map((h) => (
                          <SortableHeader key={h.id} id={h.column.id}>
                            {h.isPlaceholder
                              ? null
                              : flexRender(h.column.columnDef.header, h.getContext())}
                          </SortableHeader>
                        ))}
                      </SortableContext>
                    </TableRow>
                  );
                })}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={table.getVisibleLeafColumns().length}
                      className="py-12 text-center text-muted-foreground"
                    >
                      표시할 이슈가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DndContext>
        )}
      </div>

      {!query.isLoading && !query.isError && filtered.length > 0 && (
        <PaginationBar
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          totalRows={filtered.length}
          pageCount={Math.max(1, table.getPageCount())}
          canPrev={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onFirst={() => table.setPageIndex(0)}
          onPrev={() => table.previousPage()}
          onNext={() => table.nextPage()}
          onLast={() => table.setPageIndex(Math.max(0, table.getPageCount() - 1))}
          onPageSizeChange={(size) =>
            setPagination({ pageIndex: 0, pageSize: size })
          }
        />
      )}
    </div>
  );
}

function PaginationBar({
  pageIndex,
  pageSize,
  totalRows,
  pageCount,
  canPrev,
  canNext,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onPageSizeChange,
}: {
  pageIndex: number;
  pageSize: number;
  totalRows: number;
  pageCount: number;
  canPrev: boolean;
  canNext: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onPageSizeChange: (size: number) => void;
}) {
  const start = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(totalRows, (pageIndex + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center gap-3 border-t px-6 py-2 text-xs">
      <div className="text-muted-foreground">
        {start}–{end} / {totalRows}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">페이지당</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-[80px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}개
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="첫 페이지"
          onClick={onFirst}
          disabled={!canPrev}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="이전 페이지"
          onClick={onPrev}
          disabled={!canPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 tabular-nums">
          {pageIndex + 1} / {pageCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="다음 페이지"
          onClick={onNext}
          disabled={!canNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="마지막 페이지"
          onClick={onLast}
          disabled={!canNext}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SortableHeader({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
  };
  return (
    <TableHead ref={setNodeRef} style={style} className={cn("group", isDragging && "z-10")}>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          className="cursor-grab opacity-0 group-hover:opacity-60 hover:opacity-100 active:cursor-grabbing -ml-1"
          aria-label="컬럼 이동"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        {children}
      </span>
    </TableHead>
  );
}

function sortableHeader<TData>(
  column: import("@tanstack/react-table").Column<TData, unknown>,
  label: string,
) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );
}

function stripHtml(s: string) {
  if (!s) return "";
  if (typeof document !== "undefined") {
    const tmp = document.createElement("div");
    tmp.innerHTML = s;
    return tmp.textContent ?? "";
  }
  return s.replace(/<[^>]*>/g, "");
}

type CommentLike = { body: string };

function resolveCommentBody(
  issue: NormalizedIssue,
  lazy: Record<string, CommentLike | null>,
): string {
  if (issue.latestComment) return issue.latestComment.body;
  const k = `${issue.serverId}::${issue.key}`;
  return lazy[k]?.body ?? "";
}

function mdCell(
  key: ColumnKey,
  issue: NormalizedIssue,
  lazyComments: Record<string, CommentLike | null>,
): string {
  switch (key) {
    case "key":
      return `[${issue.key}](${issue.url})`;
    case "status":
      return issue.effectiveStatus.label;
    case "summary":
      return issue.summary.replace(/\|/g, "\\|");
    case "latestComment":
      return truncate(
        stripHtml(resolveCommentBody(issue, lazyComments)),
        80,
      ).replace(/\|/g, "\\|");
    case "note":
      return (issue.note ?? "").replace(/\|/g, "\\|").replace(/\n/g, " / ");
    case "assignee":
      return issue.assignee?.name ?? "";
    case "reporter":
      return issue.reporter?.name ?? "";
    case "created":
      return formatDate(issue.created);
    case "updated":
      return formatDate(issue.updated);
    case "resolved":
      return issue.resolved ? formatDate(issue.resolved) : "";
    case "priority":
      return issue.priority ?? "";
    case "issueType":
      return issue.issueType ?? "";
    case "labels":
      return issue.labels.join(" ");
    case "serverName":
      return issue.serverName;
  }
}

function csvCell(
  key: ColumnKey,
  issue: NormalizedIssue,
  lazyComments: Record<string, CommentLike | null>,
): string {
  switch (key) {
    case "key":
      return issue.key;
    case "status":
      return issue.effectiveStatus.label;
    case "summary":
      return issue.summary;
    case "latestComment":
      return stripHtml(resolveCommentBody(issue, lazyComments));
    case "note":
      return issue.note ?? "";
    case "assignee":
      return issue.assignee?.name ?? "";
    case "reporter":
      return issue.reporter?.name ?? "";
    case "created":
      return issue.created ?? "";
    case "updated":
      return issue.updated ?? "";
    case "resolved":
      return issue.resolved ?? "";
    case "priority":
      return issue.priority ?? "";
    case "issueType":
      return issue.issueType ?? "";
    case "labels":
      return issue.labels.join(" ");
    case "serverName":
      return issue.serverName;
  }
}

function escapeCsv(v: string): string {
  if (v == null) return "";
  if (/["\n,]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
