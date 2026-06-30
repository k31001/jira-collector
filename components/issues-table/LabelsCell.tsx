"use client";

import * as React from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { updateIssueLabels } from "@/actions/issues";
import { cn } from "@/lib/utils";

type Props = {
  serverId: string;
  issueKey: string;
  initial: string[];
};

// Parse the comma/space-separated editor text into a label list. Jira labels
// can't contain whitespace, so any run of commas/spaces is a separator.
function parseLabels(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sameLabels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function LabelsCell({ serverId, issueKey, initial }: Props) {
  const [labels, setLabels] = React.useState<string[]>(initial);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep in sync when a fresh dashboard fetch lands with updated labels.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    setLabels(initial);
  }, [initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function beginEdit() {
    setDraft(labels.join(", "));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function commit() {
    // Read the live input value so a syllable still mid-IME-composition isn't
    // dropped (same hazard as the note editor).
    const next = parseLabels(inputRef.current?.value ?? draft);
    setEditing(false);
    if (sameLabels(next, labels)) return;
    const prev = labels;
    setLabels(next); // optimistic
    setState("saving");
    updateIssueLabels({ serverId, issueKey, labels: next })
      .then((res) => {
        setLabels(res.labels);
        setState("saved");
        setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1200);
      })
      .catch((err: unknown) => {
        setLabels(prev); // revert
        setState("idle");
        toast.error(
          err instanceof Error ? err.message : "라벨 수정에 실패했습니다.",
        );
      });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder="라벨 (쉼표/공백 구분, Enter 저장)"
        className="w-full min-w-[160px] rounded border border-input bg-background px-1.5 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      title="클릭하여 라벨 편집"
      className={cn(
        "group flex min-h-[24px] w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent/50",
      )}
    >
      {labels.slice(0, 5).map((l) => (
        <span
          key={l}
          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {l}
        </span>
      ))}
      {labels.length > 5 && (
        <span className="text-[11px] text-muted-foreground">
          +{labels.length - 5}
        </span>
      )}
      {labels.length === 0 && (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100">
          <Plus className="h-3 w-3" />
          라벨
        </span>
      )}
      {state === "saving" && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
      {state === "saved" && <Check className="h-3 w-3 text-emerald-500" />}
    </button>
  );
}
