"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RegisteredServer } from "@/lib/jira/url-parser";
import {
  createResolutionDashboard,
  updateResolutionDashboard,
} from "@/actions/resolution-dashboards";
import { testJql } from "@/actions/jql";

export type Milestone = { name: string; date: string };

export type ResolutionSourceItem = {
  serverId: string;
  label: string;
  jql: string;
  color: string;
  milestones: Milestone[];
};

/** A globally-defined ratio the user can attach to this dashboard. */
export type RatioLibraryItem = {
  id: string;
  name: string;
  basis: "created" | "resolved";
  numeratorJql: string;
  denominatorJql: string;
};

type FormState = {
  name: string;
  description: string;
  windowDays: number;
  timeBucket: "day" | "week" | "month" | "quarter";
  histogramBucketHours: number;
  refreshIntervalSec: number;
  sources: ResolutionSourceItem[];
  ratioConfigIds: string[];
};

const DEFAULT_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
];

type Props = {
  mode: "create" | "edit";
  servers: RegisteredServer[];
  /** All globally-defined ratios, available to attach to this dashboard. */
  ratioLibrary: RatioLibraryItem[];
  initial?: {
    id: string;
    name: string;
    description?: string | null;
    windowDays: number;
    timeBucket: "day" | "week" | "month" | "quarter";
    histogramBucketHours: number;
    refreshIntervalSec: number;
    sources: ResolutionSourceItem[];
    ratioConfigIds: string[];
  };
};

export function ResolutionDashboardForm({
  mode,
  servers,
  ratioLibrary,
  initial,
}: Props) {
  const router = useRouter();
  const [state, setState] = React.useState<FormState>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    windowDays: initial?.windowDays ?? 90,
    timeBucket: (initial?.timeBucket as FormState["timeBucket"]) ?? "week",
    histogramBucketHours: initial?.histogramBucketHours ?? 24,
    refreshIntervalSec: initial?.refreshIntervalSec ?? 600,
    sources: initial?.sources ?? [],
    ratioConfigIds: initial?.ratioConfigIds ?? [],
  });
  const [pending, startTransition] = useTransition();

  function patch(p: Partial<FormState>) {
    setState((s) => ({ ...s, ...p }));
  }

  function patchSource(idx: number, p: Partial<ResolutionSourceItem>) {
    setState((s) => {
      const next = [...s.sources];
      next[idx] = { ...next[idx], ...p };
      return { ...s, sources: next };
    });
  }

  function removeSource(idx: number) {
    setState((s) => {
      const next = [...s.sources];
      next.splice(idx, 1);
      return { ...s, sources: next };
    });
  }

  function addSource() {
    setState((s) => ({
      ...s,
      sources: [
        ...s.sources,
        {
          serverId: servers[0]?.id ?? "",
          label: `JQL ${s.sources.length + 1}`,
          jql: "",
          color: DEFAULT_COLORS[s.sources.length % DEFAULT_COLORS.length],
          milestones: [],
        },
      ],
    }));
  }

  function toggleRatio(id: string, on: boolean) {
    setState((s) => ({
      ...s,
      ratioConfigIds: on
        ? [...s.ratioConfigIds, id]
        : s.ratioConfigIds.filter((x) => x !== id),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          name: state.name,
          description: state.description || undefined,
          windowDays: state.windowDays,
          timeBucket: state.timeBucket,
          histogramBucketHours: state.histogramBucketHours,
          refreshIntervalSec: state.refreshIntervalSec,
          sources: state.sources,
          ratioConfigIds: state.ratioConfigIds,
        };
        if (mode === "create") {
          const { id } = await createResolutionDashboard(payload);
          toast.success("대시보드를 생성했습니다");
          router.push(`/resolution-time/${id}`);
        } else if (initial) {
          await updateResolutionDashboard(initial.id, payload);
          toast.success("대시보드를 업데이트했습니다");
          router.push(`/resolution-time/${initial.id}`);
          router.refresh();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  if (servers.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          먼저 <a className="underline" href="/settings/servers">Jira 서버</a>를 등록하세요.
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <Label htmlFor="name">이름</Label>
          <Input
            id="name"
            value={state.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="예: 팀별 평균 해결 시간 추적"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="refresh">자동 새로고침 (초)</Label>
          <Input
            id="refresh"
            type="number"
            min={0}
            value={state.refreshIntervalSec}
            onChange={(e) =>
              patch({ refreshIntervalSec: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="desc">설명 (선택)</Label>
        <Textarea
          id="desc"
          value={state.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={2}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="window">시계열 윈도 (일)</Label>
          <Input
            id="window"
            type="number"
            min={7}
            max={365}
            value={state.windowDays}
            onChange={(e) => patch({ windowDays: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>시계열 단위</Label>
          <Select
            value={state.timeBucket}
            onValueChange={(v) =>
              patch({ timeBucket: v as FormState["timeBucket"] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">일</SelectItem>
              <SelectItem value="week">주</SelectItem>
              <SelectItem value="month">월</SelectItem>
              <SelectItem value="quarter">분기</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="hbin">히스토그램 버킷 (시간)</Label>
          <Input
            id="hbin"
            type="number"
            min={1}
            max={720}
            value={state.histogramBucketHours}
            onChange={(e) =>
              patch({ histogramBucketHours: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>비교할 JQL 목록</Label>
        <p className="text-xs text-muted-foreground">
          각 JQL은 차트에서 하나의 시리즈로 나타납니다. 라벨과 컬러로 구분하세요.
        </p>
        <div className="space-y-3">
          {state.sources.map((src, idx) => (
            <ResolutionSourceCard
              key={idx}
              servers={servers}
              source={src}
              onChange={(p) => patchSource(idx, p)}
              onRemove={() => removeSource(idx)}
            />
          ))}
          <Button type="button" variant="outline" onClick={addSource}>
            <Plus className="h-4 w-4" />
            JQL 추가
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>비율 분석 카드</Label>
        <p className="text-xs text-muted-foreground">
          이 대시보드에 표시할 비율을 선택하세요. 정의는{" "}
          <a className="underline" href="/settings/ratio-analysis">
            비율 분석 설정
          </a>
          에서 공유 관리됩니다.
        </p>
        {ratioLibrary.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            정의된 비율이 없습니다.{" "}
            <a className="underline" href="/settings/ratio-analysis">
              비율 분석 설정
            </a>
            에서 먼저 추가하면 여기서 선택할 수 있습니다.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ratioLibrary.map((r) => {
              const checked = state.ratioConfigIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRatio(r.id, !checked)}
                  aria-pressed={checked}
                  className="flex w-full items-start gap-3 rounded-md border p-2.5 text-left transition-colors hover:bg-accent/50"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {r.basis === "resolved" ? "해결일" : "생성일"} 기준
                      </span>
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      분자 {r.numeratorJql} · 분모{" "}
                      {r.denominatorJql.trim() || "전체"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
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

function ResolutionSourceCard({
  source,
  servers,
  onChange,
  onRemove,
}: {
  source: ResolutionSourceItem;
  servers: RegisteredServer[];
  onChange: (p: Partial<ResolutionSourceItem>) => void;
  onRemove: () => void;
}) {
  const [testResult, setTestResult] = React.useState<
    null | { ok: true; count: number } | { ok: false; error: string }
  >(null);
  const [testing, startTesting] = useTransition();

  async function runTest() {
    if (!source.jql.trim()) {
      setTestResult({ ok: false, error: "JQL을 입력하세요" });
      return;
    }
    if (!source.serverId) {
      setTestResult({ ok: false, error: "서버를 선택하세요" });
      return;
    }
    setTestResult(null);
    startTesting(async () => {
      try {
        const r = await testJql({
          serverId: source.serverId,
          jql: source.jql,
        });
        setTestResult(r);
      } catch (err) {
        setTestResult({
          ok: false,
          error: err instanceof Error ? err.message : "쿼리 테스트 실패",
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <input
            type="color"
            value={source.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-5 w-5 cursor-pointer rounded border bg-transparent p-0"
            aria-label="시리즈 색상"
          />
          <Input
            value={source.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="JQL 라벨"
            className="h-7 w-44 text-xs"
          />
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="JQL 삭제"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Jira 서버</Label>
          <Select
            value={source.serverId}
            onValueChange={(v) => onChange({ serverId: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {servers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>JQL</Label>
            <div className="flex items-center gap-2">
              {testResult?.ok && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {testResult.count}개 매칭
                </span>
              )}
              {testResult && !testResult.ok && (
                <span className="flex items-center gap-1 text-xs text-destructive truncate max-w-[40ch]">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {testResult.error}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runTest}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="animate-spin h-3.5 w-3.5" />
                ) : null}
                쿼리 테스트
              </Button>
            </div>
          </div>
          <Textarea
            value={source.jql}
            onChange={(e) => onChange({ jql: e.target.value })}
            placeholder="project = ABC AND resolved >= -90d"
            className="font-mono text-xs min-h-[80px]"
          />
          <p className="text-[11px] text-muted-foreground">
            팁: 해결된 이슈만 분석되므로 <code>resolved &gt;= -90d</code> 같은 조건을 함께 거는 것이 좋습니다.
          </p>
        </div>

        <MilestoneEditor
          value={source.milestones}
          onChange={(next) => onChange({ milestones: next })}
        />
      </CardContent>
    </Card>
  );
}

function MilestoneEditor({
  value,
  onChange,
}: {
  value: Milestone[];
  onChange: (next: Milestone[]) => void;
}) {
  function patch(idx: number, p: Partial<Milestone>) {
    const next = [...value];
    next[idx] = { ...next[idx], ...p };
    onChange(next);
  }
  function remove(idx: number) {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
  }
  function add() {
    onChange([...value, { name: "", date: toDateInput(new Date()) }]);
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">마일스톤 (선택)</Label>
      <p className="text-[11px] text-muted-foreground">
        시계열 차트 시간축에 수직선으로 표시됩니다 (예: 릴리즈, 정책 변경 시점).
      </p>
      <div className="space-y-1.5">
        {value.map((m, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={m.name}
              onChange={(e) => patch(idx, { name: e.target.value })}
              placeholder="예: v2.0 릴리즈"
              className="h-7 flex-1 text-xs"
            />
            <Input
              type="date"
              value={m.date}
              onChange={(e) => patch(idx, { date: e.target.value })}
              className="h-7 w-[150px] text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="마일스톤 삭제"
              onClick={() => remove(idx)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3" />
          마일스톤 추가
        </Button>
      </div>
    </div>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
