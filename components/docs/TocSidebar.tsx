"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { TocItem } from "@/lib/docs";

/**
 * Sticky right-rail "On this page" navigation.
 *
 * Tracks the visible heading via IntersectionObserver and highlights its
 * entry. Falls back gracefully to "no active state" if no headings have
 * `id` attributes yet (e.g., during first paint).
 */
export function TocSidebar({ items }: { items: TocItem[] }) {
  const [activeSlug, setActiveSlug] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (items.length === 0) return;
    const elements: HTMLElement[] = [];
    for (const item of items) {
      const el = document.getElementById(item.slug);
      if (el) elements.push(el);
    }
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost visible heading so the active marker advances
        // with the user as they scroll down.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top -
              b.target.getBoundingClientRect().top,
          );
        if (visible.length > 0) {
          setActiveSlug(visible[0].target.id);
        }
      },
      { rootMargin: "-72px 0px -60% 0px", threshold: [0, 1] },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="문서 목차"
      className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto"
    >
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        목차
      </div>
      <ul className="space-y-1.5 border-l border-border">
        {items.map((item) => {
          const isActive = item.slug === activeSlug;
          return (
            <li
              key={item.slug}
              className={cn(item.level === 3 ? "pl-6" : "pl-3")}
            >
              <a
                href={`#${item.slug}`}
                className={cn(
                  "block -ml-px border-l border-transparent py-0.5 text-xs leading-snug transition-colors",
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
