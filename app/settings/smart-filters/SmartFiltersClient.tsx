"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseJql, JqlParseError } from "@/lib/jql-eval";
import type { CustomFacetWithValues } from "@/lib/db/queries";
import {
  createCustomFacet,
  createCustomFacetValue,
  deleteCustomFacet,
  deleteCustomFacetValue,
  updateCustomFacet,
  updateCustomFacetValue,
} from "@/actions/smart-filters";

type Facet = CustomFacetWithValues;
type FacetValue = Facet["values"][number];

export function SmartFiltersClient({
  initialFacets,
}: {
  initialFacets: Facet[];
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [newFacetName, setNewFacetName] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onAddFacet() {
    const name = newFacetName.trim();
    if (!name) {
      toast.error("이름을 입력하세요");
      return;
    }
    setPending(true);
    try {
      await createCustomFacet({ name });
      setNewFacetName("");
      setAdding(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setPending(false);
    }
  }

  if (initialFacets.length === 0 && !adding) {
    return (
      <Card>
        <CardContent className="space-y-4 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            아직 정의된 항목이 없습니다.
          </p>
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />첫 항목 만들기
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {adding ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={newFacetName}
              onChange={(e) => setNewFacetName(e.target.value)}
              placeholder="예: 운영체제"
              className="h-8 w-[200px] text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddFacet();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewFacetName("");
                }
              }}
            />
            <Button size="sm" onClick={onAddFacet} disabled={pending}>
              추가
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setNewFacetName("");
              }}
              disabled={pending}
            >
              취소
            </Button>
          </div>
        ) : (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            항목 추가
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {initialFacets.map((f) => (
          <FacetCard key={f.id} facet={f} onChanged={() => router.refresh()} />
        ))}
      </div>
    </div>
  );
}

function FacetCard({
  facet,
  onChanged,
}: {
  facet: Facet;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(facet.name);
  const [valueDialogOpen, setValueDialogOpen] = React.useState(false);
  const [editingValue, setEditingValue] = React.useState<FacetValue | null>(
    null,
  );

  async function commitRename() {
    const next = name.trim();
    if (next === facet.name || !next) {
      setRenaming(false);
      setName(facet.name);
      return;
    }
    try {
      await updateCustomFacet(facet.id, { name: next });
      setRenaming(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "이름 변경 실패");
    }
  }

  async function onDelete() {
    if (
      !confirm(
        `"${facet.name}" 항목과 그 안의 모든 값을 삭제할까요? 되돌릴 수 없습니다.`,
      )
    )
      return;
    try {
      await deleteCustomFacet(facet.id);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "접기" : "펼치기"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {renaming ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setRenaming(false);
                  setName(facet.name);
                }
              }}
              className="h-7 w-[260px] text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="text-left text-sm font-medium hover:underline"
            >
              {facet.name}
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {facet.values.length}개 값
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingValue(null);
              setValueDialogOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> 값 추가
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {expanded && (
          <div className="space-y-1 rounded-md border bg-muted/20 p-2">
            {facet.values.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                값이 없습니다. 우측 상단 &ldquo;값 추가&rdquo; 버튼을 누르세요.
              </div>
            ) : (
              facet.values.map((v) => (
                <ValueRow
                  key={v.id}
                  value={v}
                  onEdit={() => {
                    setEditingValue(v);
                    setValueDialogOpen(true);
                  }}
                  onChanged={onChanged}
                />
              ))
            )}
          </div>
        )}

        <Dialog open={valueDialogOpen} onOpenChange={setValueDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingValue ? "값 편집" : "새 값"}
              </DialogTitle>
            </DialogHeader>
            <ValueForm
              facetId={facet.id}
              editing={editingValue}
              onSaved={() => {
                setValueDialogOpen(false);
                setEditingValue(null);
                onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function ValueRow({
  value,
  onEdit,
  onChanged,
}: {
  value: FacetValue;
  onEdit: () => void;
  onChanged: () => void;
}) {
  async function onDelete() {
    if (!confirm(`"${value.name}" 값을 삭제할까요?`)) return;
    try {
      await deleteCustomFacetValue(value.id);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }
  return (
    <div className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-background/40">
      <span className="min-w-[120px] text-sm font-medium">{value.name}</span>
      <code className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
        {value.jql}
      </code>
      <Button size="sm" variant="ghost" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ValueForm({
  facetId,
  editing,
  onSaved,
}: {
  facetId: string;
  editing: FacetValue | null;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(editing?.name ?? "");
  const [jql, setJql] = React.useState(editing?.jql ?? "");
  const [pending, setPending] = React.useState(false);

  // Live parse so the user sees immediately whether their JQL compiles.
  const parseResult = React.useMemo<
    | { ok: true }
    | { ok: false; message: string }
    | { ok: "empty" }
  >(() => {
    const trimmed = jql.trim();
    if (trimmed === "") return { ok: "empty" };
    try {
      parseJql(trimmed);
      return { ok: true };
    } catch (err) {
      if (err instanceof JqlParseError) {
        return { ok: false, message: err.message };
      }
      return { ok: false, message: "파싱 실패" };
    }
  }, [jql]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const j = jql.trim();
    if (!n) {
      toast.error("이름을 입력하세요");
      return;
    }
    if (!j) {
      toast.error("JQL을 입력하세요");
      return;
    }
    setPending(true);
    try {
      if (editing) {
        await updateCustomFacetValue(editing.id, { name: n, jql: j });
        toast.success("저장했습니다");
      } else {
        await createCustomFacetValue({ facetId, name: n, jql: j });
        toast.success("추가했습니다");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="value-name">값 이름</Label>
        <Input
          id="value-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: Windows"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="value-jql">JQL 표현</Label>
        <Input
          id="value-jql"
          value={jql}
          onChange={(e) => setJql(e.target.value)}
          placeholder="예: labels in (windows, win10)"
          className="font-mono text-xs"
        />
        {parseResult.ok === true && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> 파싱 OK
          </div>
        )}
        {parseResult.ok === false && (
          <div className="flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertCircle className="mt-[1px] h-3 w-3" />
            <span>{parseResult.message}</span>
          </div>
        )}
        <div className="space-y-0.5 text-[11px] text-muted-foreground">
          <div>
            텍스트 필드: <code className="text-xs">status</code>, <code className="text-xs">assignee</code>, <code className="text-xs">reporter</code>, <code className="text-xs">priority</code>, <code className="text-xs">issuetype</code>, <code className="text-xs">labels</code>, <code className="text-xs">resolution</code> · 연산자{" "}
            <code className="text-xs">= != in &quot;not in&quot; &quot;is empty&quot; &quot;is not empty&quot;</code>
          </div>
          <div>
            날짜 필드: <code className="text-xs">created</code>, <code className="text-xs">updated</code>, <code className="text-xs">resolved</code> · 연산자 <code className="text-xs">&gt; &gt;= &lt; &lt;=</code> · 값 <code className="text-xs">-4w</code> <code className="text-xs">-7d</code> <code className="text-xs">-2h</code> <code className="text-xs">-30m</code> 또는 <code className="text-xs">2026-01-01</code>
          </div>
          <div>조합 <code className="text-xs">AND</code></div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending || parseResult.ok === false}>
          저장
        </Button>
      </div>
    </form>
  );
}
