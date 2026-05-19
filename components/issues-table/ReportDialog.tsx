"use client";

import * as React from "react";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildReport } from "@/lib/report";
import type { NormalizedIssue } from "@/lib/jira/types";

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fromDateInputValue(v: string): Date {
  // Interpret as local midnight to match the user's calendar perception
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

const PRESETS = [
  { label: "지난 7일", days: 7 },
  { label: "지난 14일", days: 14 },
  { label: "지난 30일", days: 30 },
  { label: "지난 90일", days: 90 },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardName: string;
  issues: NormalizedIssue[];
};

export function ReportDialog({ open, onOpenChange, dashboardName, issues }: Props) {
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const defaultStart = React.useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6); // last 7 days inclusive
    return d;
  }, [today]);

  const [startStr, setStartStr] = React.useState(toDateInputValue(defaultStart));
  const [endStr, setEndStr] = React.useState(toDateInputValue(today));
  const [includeNotes, setIncludeNotes] = React.useState(true);

  function applyPreset(days: number) {
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    setStartStr(toDateInputValue(start));
    setEndStr(toDateInputValue(end));
  }

  const markdown = React.useMemo(() => {
    try {
      return buildReport({
        dashboardName,
        issues,
        range: {
          start: fromDateInputValue(startStr),
          end: fromDateInputValue(endStr),
        },
        includeNotes,
      });
    } catch (err) {
      return `(보고서 생성 오류: ${(err as Error).message})`;
    }
  }, [dashboardName, issues, startStr, endStr, includeNotes]);

  async function copyMd() {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Markdown으로 복사했습니다");
    } catch {
      toast.error("클립보드 복사 실패");
    }
  }

  function downloadMd() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${dashboardName.replace(/\s+/g, "-")}-${startStr}_${endStr}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const invalid = (() => {
    if (!startStr || !endStr) return "기간을 입력하세요";
    const s = fromDateInputValue(startStr).getTime();
    const e = fromDateInputValue(endStr).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) return "날짜 형식이 잘못됐습니다";
    if (s > e) return "시작일이 종료일보다 늦습니다";
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>기간 보고서</DialogTitle>
          <DialogDescription>
            현재 대시보드에 로드된 이슈를 기반으로, 지정한 기간 동안의 활동을 Markdown 보고서로 만듭니다.
            전체 커버리지가 필요하면 JQL에 해결된 이슈도 포함하도록 설정하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label htmlFor="report-start">시작일</Label>
              <Input
                id="report-start"
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                max={endStr}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-end">종료일</Label>
              <Input
                id="report-end"
                type="date"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                min={startStr}
                max={toDateInputValue(today)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
              />
              노트 포함
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.days}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {invalid ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {invalid}
            </div>
          ) : (
            <div className="rounded-md border bg-muted/40">
              <div className="border-b px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                미리보기
              </div>
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed">
                {markdown}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={downloadMd} disabled={!!invalid}>
            <Download className="h-4 w-4" />
            .md 다운로드
          </Button>
          <Button onClick={copyMd} disabled={!!invalid}>
            <Copy className="h-4 w-4" />
            Markdown 복사
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
