"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseJql, JqlParseError } from "@/lib/jql-eval";
import type { RatioConfigDef } from "@/lib/db/queries";
import {
  createRatioConfig,
  deleteRatioConfig,
  updateRatioConfig,
} from "@/actions/ratio-analysis";

const SUPPORTED = (
  <div className="space-y-0.5 text-[11px] text-muted-foreground">
    <div>
      텍스트 필드: <code className="text-xs">status</code>,{" "}
      <code className="text-xs">assignee</code>,{" "}
      <code className="text-xs">reporter</code>,{" "}
      <code className="text-xs">priority</code>,{" "}
      <code className="text-xs">issuetype</code>,{" "}
      <code className="text-xs">labels</code>,{" "}
      <code className="text-xs">resolution</code> · 연산자{" "}
      <code className="text-xs">
        = != in &quot;not in&quot; &quot;is empty&quot; &quot;is not empty&quot;
      </code>
    </div>
    <div>
      날짜 필드: <code className="text-xs">created</code>,{" "}
      <code className="text-xs">updated</code>,{" "}
      <code className="text-xs">resolved</code> · 연산자{" "}
      <code className="text-xs">&gt; &gt;= &lt; &lt;=</code> · 값{" "}
      <code className="text-xs">-4w</code> <code className="text-xs">-7d</code>{" "}
      <code className="text-xs">-2h</code> <code className="text-xs">-30m</code>{" "}
      또는 <code className="text-xs">2026-01-01</code>
    </div>
    <div>
      커스텀 필드: <code className="text-xs">cf[10016]</code>(또는{" "}
      <code className="text-xs">customfield_10016</code>) · 텍스트는{" "}
      <code className="text-xs">= != in</code>, 숫자는{" "}
      <code className="text-xs">&gt; &gt;= &lt; &lt;=</code>
    </div>
    <div>
      조합 <code className="text-xs">AND</code> · 예{" "}
      <code className="text-xs">issuetype = Bug AND created &gt; -4w</code>,{" "}
      <code className="text-xs">cf[10016] &gt;= 5</code>
    </div>
  </div>
);

export function RatioAnalysisClient({
  initialConfigs,
  usage,
}: {
  initialConfigs: RatioConfigDef[];
  /** ratio config id → number of dashboards displaying it. */
  usage: Record<string, number>;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            비율 추가
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardContent className="p-4">
            <RatioForm
              mode="create"
              onDone={() => {
                setCreating(false);
                router.refresh();
              }}
              onCancel={() => setCreating(false)}
            />
          </CardContent>
        </Card>
      )}

      {initialConfigs.length === 0 && !creating ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            정의된 비율이 없습니다. &quot;비율 추가&quot;로 시작하세요.
          </CardContent>
        </Card>
      ) : (
        initialConfigs.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              <div className="mb-2 flex justify-end">
                <Badge variant={usage[c.id] ? "secondary" : "outline"}>
                  {usage[c.id]
                    ? `${usage[c.id]}개 대시보드에서 사용 중`
                    : "사용하는 대시보드 없음"}
                </Badge>
              </div>
              <RatioForm
                mode="edit"
                config={c}
                onDone={() => router.refresh()}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function useJqlCheck(jql: string, allowEmpty: boolean) {
  return React.useMemo<
    { ok: true } | { ok: false; message: string } | { ok: "empty" }
  >(() => {
    const trimmed = jql.trim();
    if (trimmed === "") return allowEmpty ? { ok: true } : { ok: "empty" };
    try {
      parseJql(trimmed);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof JqlParseError ? err.message : "파싱 실패",
      };
    }
  }, [jql, allowEmpty]);
}

function ParseStatus({
  result,
}: {
  result: { ok: true } | { ok: false; message: string } | { ok: "empty" };
}) {
  if (result.ok === true)
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> 파싱 OK
      </div>
    );
  if (result.ok === false)
    return (
      <div className="flex items-start gap-1.5 text-[11px] text-destructive">
        <AlertCircle className="mt-[1px] h-3 w-3" />
        <span>{result.message}</span>
      </div>
    );
  return null;
}

function RatioForm({
  mode,
  config,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  config?: RatioConfigDef;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = React.useState(config?.name ?? "");
  const [numerator, setNumerator] = React.useState(config?.numeratorJql ?? "");
  const [denominator, setDenominator] = React.useState(
    config?.denominatorJql ?? "",
  );
  const [basis, setBasis] = React.useState<"created" | "resolved">(
    config?.basis ?? "created",
  );
  const [pending, setPending] = React.useState(false);

  const numCheck = useJqlCheck(numerator, false);
  const denCheck = useJqlCheck(denominator, true);
  const canSave =
    name.trim() !== "" && numCheck.ok === true && denCheck.ok === true;

  async function save() {
    if (!canSave) {
      toast.error("입력을 확인하세요");
      return;
    }
    setPending(true);
    try {
      if (mode === "create") {
        await createRatioConfig({
          name: name.trim(),
          numeratorJql: numerator.trim(),
          denominatorJql: denominator.trim(),
          basis,
        });
        toast.success("추가했습니다");
      } else if (config) {
        await updateRatioConfig(config.id, {
          name: name.trim(),
          numeratorJql: numerator.trim(),
          denominatorJql: denominator.trim(),
          basis,
        });
        toast.success("저장했습니다");
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!config) return;
    if (!confirm(`"${config.name}" 비율을 삭제할까요?`)) return;
    try {
      await deleteRatioConfig(config.id);
      toast.success("삭제했습니다");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label>이름</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 버그 유입 비율"
          />
        </div>
        <div className="space-y-1.5">
          <Label>기준 날짜</Label>
          <Select
            value={basis}
            onValueChange={(v) => setBasis(v as "created" | "resolved")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">생성일 (유입)</SelectItem>
              <SelectItem value="resolved">해결일 (완료)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>분자 JQL (관심 대상)</Label>
          <Input
            value={numerator}
            onChange={(e) => setNumerator(e.target.value)}
            placeholder="예: issuetype = Bug"
            className="font-mono text-xs"
          />
          <ParseStatus result={numCheck} />
        </div>
        <div className="space-y-1.5">
          <Label>분모 JQL (전체 기준 · 비우면 모든 이슈)</Label>
          <Input
            value={denominator}
            onChange={(e) => setDenominator(e.target.value)}
            placeholder="비움 = 전체 / 예: issuetype in (Bug, Story, Task)"
            className="font-mono text-xs"
          />
          <ParseStatus result={denCheck} />
        </div>
      </div>
      {SUPPORTED}
      <div className="flex items-center justify-between">
        {mode === "edit" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> 삭제
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
              취소
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={pending || !canSave}>
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
