"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatHours, type ResolvedIssue } from "@/lib/resolution-time";
import { formatDate } from "@/lib/utils";

export type IssueListSelection = {
  sourceLabel: string;
  binLabel: string;
  issues: ResolvedIssue[];
};

export function IssueListDialog({
  open,
  onOpenChange,
  selection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: IssueListSelection | null;
}) {
  const sorted = React.useMemo(() => {
    if (!selection) return [];
    return [...selection.issues].sort(
      (a, b) => b.resolutionHours - a.resolutionHours,
    );
  }, [selection]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {selection?.sourceLabel ?? ""} · {selection?.binLabel ?? ""}
          </DialogTitle>
          <DialogDescription>
            해당 구간({selection?.binLabel ?? ""})에 속한 이슈 {sorted.length}개. 해결 시간이 오래 걸린 순으로 정렬됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              이슈가 없습니다.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-2 text-left">Key</th>
                  <th className="py-1.5 pr-2 text-left">요약</th>
                  <th className="py-1.5 pr-2 text-left">상태</th>
                  <th className="py-1.5 pr-2 text-right">해결 시간</th>
                  <th className="py-1.5 pr-2 text-left">해결일</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((i) => (
                  <tr key={`${i.serverId}::${i.key}`} className="border-b">
                    <td className="py-1.5 pr-2 align-top">
                      <a
                        href={i.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
                      >
                        {i.key}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <div className="text-xs leading-snug">{i.summary}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {i.serverName} · {i.issueType ?? "—"} · {i.assignee?.name ?? "미할당"}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[10px]"
                        style={{
                          background: `${i.effectiveStatus.color}20`,
                          color: i.effectiveStatus.color,
                        }}
                      >
                        {i.effectiveStatus.label}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right align-top font-mono text-xs">
                      {formatHours(i.resolutionHours)}
                    </td>
                    <td className="py-1.5 pr-2 align-top text-[11px] text-muted-foreground">
                      {formatDate(i.resolved)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
