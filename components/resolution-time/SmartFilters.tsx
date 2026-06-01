"use client";

import * as React from "react";
import { ChevronDown, Filter, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  CustomFacetForFilter,
  CustomFacetSelection,
  FacetField,
  Facets,
  FacetSelection,
} from "@/lib/resolution-time";

const FACET_LABELS: Record<FacetField, string> = {
  status: "상태",
  assignee: "담당자",
  issueType: "타입",
  priority: "우선순위",
  labels: "라벨",
  reporter: "보고자",
};

const FACET_ORDER: FacetField[] = [
  "status",
  "assignee",
  "issueType",
  "priority",
  "labels",
  "reporter",
];

export function SmartFilters({
  facets,
  value,
  onChange,
  customFacets = [],
  customValue = {},
  onCustomChange,
}: {
  facets: Facets;
  value: FacetSelection;
  onChange: (v: FacetSelection) => void;
  customFacets?: CustomFacetForFilter[];
  customValue?: CustomFacetSelection;
  onCustomChange?: (v: CustomFacetSelection) => void;
}) {
  const builtInCount = Object.values(value).reduce(
    (acc, v) => acc + (v?.length ?? 0),
    0,
  );
  const customCount = Object.values(customValue).reduce(
    (acc, v) => acc + (v?.length ?? 0),
    0,
  );
  const activeCount = builtInCount + customCount;

  function patchField(field: FacetField, next: string[]) {
    const cleaned: FacetSelection = { ...value };
    if (next.length === 0) {
      delete cleaned[field];
    } else {
      cleaned[field] = next;
    }
    onChange(cleaned);
  }

  function patchCustom(facetId: string, next: string[]) {
    if (!onCustomChange) return;
    const cleaned: CustomFacetSelection = { ...customValue };
    if (next.length === 0) {
      delete cleaned[facetId];
    } else {
      cleaned[facetId] = next;
    }
    onCustomChange(cleaned);
  }

  function clearAll() {
    onChange({});
    onCustomChange?.({});
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Filter className="h-3 w-3" />
        스마트 필터
      </span>
      {FACET_ORDER.map((field) => {
        const options = facets[field];
        if (options.length === 0) return null;
        const selected = value[field] ?? [];
        return (
          <FacetPopover
            key={field}
            label={FACET_LABELS[field]}
            options={options}
            selected={selected}
            onChange={(next) => patchField(field, next)}
          />
        );
      })}
      {customFacets.map((facet) => {
        if (facet.values.length === 0) return null;
        // Counts in custom facets come from the user definition, not from
        // the issue corpus, so we surface a placeholder dash instead of a
        // misleading population count.
        const options = facet.values.map((v) => ({ value: v.id, count: 0, label: v.name }));
        const selected = customValue[facet.id] ?? [];
        return (
          <FacetPopover
            key={facet.id}
            label={facet.name}
            options={options}
            selected={selected}
            onChange={(next) => patchCustom(facet.id, next)}
            hideCounts
          />
        );
      })}
      {activeCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-7 px-2 text-xs"
        >
          <X className="h-3 w-3" />
          모두 해제 ({activeCount})
        </Button>
      )}
    </div>
  );
}

function FacetPopover({
  label,
  options,
  selected,
  onChange,
  hideCounts = false,
}: {
  label: string;
  options: { value: string; count: number; label?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Suppress per-option counts (used by custom facets where the count is
   * not meaningful — values are user-defined, not aggregated from issues). */
  hideCounts?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const visible = React.useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => {
      const hay = (o.label ?? o.value).toLowerCase();
      return hay.includes(lower);
    });
  }, [options, search]);

  function toggle(v: string) {
    if (selectedSet.has(v)) {
      onChange(selected.filter((s) => s !== v));
    } else {
      onChange([...selected, v]);
    }
  }

  const isActive = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={isActive ? "default" : "outline"}
          size="sm"
          className={cn("h-7 gap-1 px-2 text-xs", isActive && "shadow-sm")}
        >
          {label}
          {isActive ? (
            <span className="rounded-full bg-background/30 px-1.5 text-[10px]">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="border-b p-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${label} 검색…`}
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {visible.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              일치하는 값이 없습니다
            </div>
          ) : (
            visible.map((o) => {
              const checked = selectedSet.has(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.value)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="flex-1 truncate">{o.label ?? o.value}</span>
                  {!hideCounts && (
                    <span className="text-[10px] text-muted-foreground">
                      {o.count}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
              className="h-6 w-full text-xs"
            >
              초기화
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
