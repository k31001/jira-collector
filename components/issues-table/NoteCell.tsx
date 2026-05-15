"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { upsertNote } from "@/actions/notes";
import { cn } from "@/lib/utils";

type Props = {
  dashboardId: string;
  serverId: string;
  issueKey: string;
  initial: string;
};

export function NoteCell({ dashboardId, serverId, issueKey, initial }: Props) {
  const [value, setValue] = React.useState(initial ?? "");
  const [editing, setEditing] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = React.useRef(initial ?? "");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    setValue(initial ?? "");
    lastSavedRef.current = initial ?? "";
  }, [initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  React.useLayoutEffect(() => {
    if (editing) autoResize();
  }, [editing, value]);

  function persist(newValue: string) {
    if (newValue === lastSavedRef.current) return;
    setState("saving");
    upsertNote({ dashboardId, serverId, issueKey, content: newValue })
      .then(() => {
        lastSavedRef.current = newValue;
        setState("saved");
        setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1200);
      })
      .catch((err) => {
        console.error(err);
        setState("idle");
      });
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(v), 500);
  }

  function onBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    persist(value);
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setValue(lastSavedRef.current);
      setEditing(false);
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onBlur();
    }
  }

  if (!editing) {
    return (
      <div
        className={cn(
          "group min-h-[24px] cursor-text rounded px-1.5 py-1 text-sm hover:bg-accent/50",
          !value && "text-muted-foreground italic",
        )}
        onClick={() => {
          setEditing(true);
          requestAnimationFrame(() => textareaRef.current?.focus());
        }}
        title="클릭하여 편집"
      >
        {value ? (
          <span className="whitespace-pre-wrap break-words line-clamp-4">{value}</span>
        ) : (
          "메시지 추가…"
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        autoFocus
        rows={3}
        placeholder="이슈 메모를 입력하세요 (Cmd+Enter 저장, Esc 취소)"
        className="w-full resize-none rounded border border-input bg-background px-1.5 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <span className="absolute right-1.5 top-1.5 text-muted-foreground">
        {state === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
        {state === "saved" && <Check className="h-3 w-3 text-emerald-500" />}
      </span>
    </div>
  );
}
