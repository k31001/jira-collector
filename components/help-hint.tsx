"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Small click-to-open "?" help bubble meant to sit next to a chart/card
 * title. Use it to explain how to read a graph — what the axes mean, what a
 * healthy vs worrying shape looks like, and what action it suggests.
 */
export function HelpHint({
  title,
  children,
  align = "start",
}: {
  /** Bold heading shown at the top of the popover. */
  title?: string;
  /** Body content — typically a few short lines / a bullet list. */
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="도움말"
          // Stop the click from bubbling to clickable card headers (e.g. the
          // collapsible smart-filter bar).
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-80 text-xs leading-relaxed"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div className="mb-1.5 text-sm font-medium">{title}</div>}
        <div className="space-y-1.5 text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Convenience wrapper for a labelled line inside a HelpHint body. */
export function HelpRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="font-medium text-foreground">{label}</span> {children}
    </div>
  );
}
