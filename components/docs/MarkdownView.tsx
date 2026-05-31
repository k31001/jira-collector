"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders markdown content with Tailwind-styled headings, tables, code, lists
 * and links. We map each element manually instead of pulling in the
 * `@tailwindcss/typography` plugin so the docs match the rest of the app's
 * compact spacing.
 */
export function MarkdownView({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-8 mb-4 text-2xl font-semibold tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-8 mb-3 border-b pb-1 text-xl font-semibold tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-6 mb-2 text-base font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-4 mb-1 text-sm font-semibold">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="my-3 text-foreground/90">{children}</p>
          ),
          a: ({ href, children }) => {
            const url = String(href ?? "");
            const isExternal =
              url.startsWith("http://") || url.startsWith("https://");
            const isInternal = url.startsWith("/");
            const className = "text-primary underline-offset-2 hover:underline";
            if (isExternal) {
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={className}
                >
                  {children}
                </a>
              );
            }
            if (isInternal) {
              return (
                <Link href={url} className={className}>
                  {children}
                </Link>
              );
            }
            return (
              <a href={url} className={className}>
                {children}
              </a>
            );
          },
          ul: ({ children }) => (
            <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="text-foreground/90">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = /\blanguage-/.test(className ?? "");
            if (isBlock) {
              return (
                <code className="block whitespace-pre overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-6 border-border" />,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-md border">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1.5 text-left font-medium">{children}</th>
          ),
          tr: ({ children }) => <tr className="border-t">{children}</tr>,
          td: ({ children }) => (
            <td className="px-2 py-1.5 align-top">{children}</td>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
