"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
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
import {
  ALL_COLUMNS,
  REQUIRED_COLUMNS,
  columnLabel,
  reconcileColumnOrder,
  type ColumnKey,
} from "./columns";
import type { DashboardIssuesResult, NormalizedIssue } from "@/lib/jira/types";
import { cn, formatDate, formatRelative, truncate } from "@/lib/utils";
import { updateDashboard } from "@/actions/dashboards";

type Props = {
  dashboardId: string;
  refreshIntervalSec: number;
  initialVisibleColumns: ColumnKey[];
  initialColumnOrder: ColumnKey[];
};

export function IssuesTable({
  dashboardId,
  refreshIntervalSec,
  initialVisibleColumns,
  initialColumnOrder,
}: Props) {
  const [search, setSearch] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "updated", desc: true },
  ]);
  const [statusFilter, setStatusFilter] = React.useState<Set<string>>(new Set());

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

  const query = useQuery<DashboardIssuesResult>({
    queryKey: ["issues", dashboardId],
    queryFn: async () => {
      const res = await fetch(`/api/dashboards/${dashboardId}/issues`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("이슈 fetch 실패");
      return (await res.json()) as DashboardIssuesResult;
    },
    refetchInterval: refreshIntervalSec > 0 ? refreshIntervalSec * 1000 : false,
    staleTime: refreshIntervalSec * 1000,
  });

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
          const c = row.original.latestComment;
          if (!c) return <span className="text-muted-foreground text-xs">—</span>;
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
    [dashboardId],
  );

  const data = query.data?.issues ?? [];

  const afterStatusFilter = React.useMemo(() => {
    if (statusFilter.size === 0) return data;
    return data.filter((i) => statusFilter.has(i.effectiveStatus.label));
  }, [data, statusFilter]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return afterStatusFilter;
    const lower = search.toLowerCase();
    return afterStatusFilter.filter((i) =>
      [
        i.key,
        i.summary,
        i.effectiveStatus.label,
        i.rawStatus,
        i.assignee?.name,
        i.reporter?.name,
        i.serverName,
        i.note,
        i.labels.join(" "),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(lower)),
    );
  }, [afterStatusFilter, search]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility: visibility, columnOrder },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onColumnOrderChange: (updater) =>
      setColumnOrder((prev) =>
        typeof updater === "function" ? (updater(prev) as ColumnKey[]) : (updater as ColumnKey[]),
      ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

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
      const cells = visibleCols.map((c) => mdCell(c.id as ColumnKey, issue));
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
      visibleCols.map((c) => csvCell(c.id as ColumnKey, r.original)),
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
      <TrendChart dashboardId={dashboardId} issues={data} />
      <StatusStatsBar
        issues={data}
        selected={statusFilter}
        onChange={setStatusFilter}
      />

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
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
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

function mdCell(key: ColumnKey, issue: NormalizedIssue): string {
  switch (key) {
    case "key":
      return `[${issue.key}](${issue.url})`;
    case "status":
      return issue.effectiveStatus.label;
    case "summary":
      return issue.summary.replace(/\|/g, "\\|");
    case "latestComment":
      return truncate(stripHtml(issue.latestComment?.body ?? ""), 80).replace(/\|/g, "\\|");
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

function csvCell(key: ColumnKey, issue: NormalizedIssue): string {
  switch (key) {
    case "key":
      return issue.key;
    case "status":
      return issue.effectiveStatus.label;
    case "summary":
      return issue.summary;
    case "latestComment":
      return stripHtml(issue.latestComment?.body ?? "");
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
