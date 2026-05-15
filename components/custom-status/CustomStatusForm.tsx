"use client";

import * as React from "react";
import { HexColorPicker } from "react-colorful";
import { useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomStatus,
  updateCustomStatus,
  type CustomStatusInput,
} from "@/actions/custom-statuses";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getContrastColor } from "@/lib/utils";

type Props = {
  mode: "create" | "edit";
  initial?: {
    id: string;
    name: string;
    color: string;
    mappings: string[];
  };
  onDone?: () => void;
};

export function CustomStatusForm({ mode, initial, onDone }: Props) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [color, setColor] = React.useState(initial?.color ?? "#3B82F6");
  const [mappings, setMappings] = React.useState<string[]>(initial?.mappings ?? []);
  const [input, setInput] = React.useState("");
  const [pending, startTransition] = useTransition();

  function addMapping() {
    const v = input.trim();
    if (!v) return;
    if (!mappings.includes(v)) setMappings([...mappings, v]);
    setInput("");
  }

  function removeMapping(v: string) {
    setMappings(mappings.filter((m) => m !== v));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const payload: CustomStatusInput = { name, color, mappings };
      try {
        if (mode === "create") {
          await createCustomStatus(payload);
          toast.success("커스텀 상태를 추가했습니다");
        } else if (initial) {
          await updateCustomStatus(initial.id, payload);
          toast.success("커스텀 상태를 저장했습니다");
        }
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cs-name">이름</Label>
        <Input
          id="cs-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이슈 분석 중"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>컬러</Label>
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-9 w-16 rounded border shadow-sm"
                style={{ backgroundColor: color }}
                aria-label="컬러 선택"
              />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <HexColorPicker color={color} onChange={setColor} />
            </PopoverContent>
          </Popover>
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="font-mono w-28"
          />
          <span
            className="rounded px-2 py-0.5 text-xs"
            style={{ backgroundColor: color, color: getContrastColor(color) }}
          >
            {name || "미리보기"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>매핑할 Jira 상태</Label>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addMapping();
              }
            }}
            placeholder="In Progress"
          />
          <Button type="button" variant="outline" onClick={addMapping}>
            <Plus className="h-4 w-4" />
            추가
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {mappings.length === 0 && (
            <span className="text-xs text-muted-foreground">
              매핑된 상태가 없습니다. 위 입력란에서 추가하세요.
            </span>
          )}
          {mappings.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => removeMapping(m)}
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs hover:bg-destructive/20"
            >
              {m}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          매칭은 대소문자 무시. 한 Jira 상태는 하나의 커스텀 상태에만 매핑하세요.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === "create" ? "추가" : "저장"}
        </Button>
      </div>
    </form>
  );
}
