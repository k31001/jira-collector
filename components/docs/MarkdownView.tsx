"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/docs";

/**
 * Render markdown content with hand-tuned Tailwind styling. We do this
 * instead of using `@tailwindcss/typography` so the spacing / weights /
 * colors line up with the rest of the app's compact aesthetic.
 *
 * H2 and H3 headings get matching `id` slugs so the TOC sidebar can jump
 * to them. We also show a subtle `#` anchor on hover for copy-link UX.
 */
export function MarkdownView({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-[760px] text-[15px] leading-[1.75] text-foreground/90",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-2 mb-6 text-3xl font-bold tracking-tight text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => {
            const id = slugify(nodeText(children));
            return (
              <h2
                id={id}
                className="group mt-12 mb-4 scroll-mt-20 border-b pb-2 text-2xl font-semibold tracking-tight text-foreground"
              >
                <HeadingAnchor id={id} />
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const id = slugify(nodeText(children));
            return (
              <h3
                id={id}
                className="group mt-8 mb-3 scroll-mt-20 text-lg font-semibold tracking-tight text-foreground"
              >
                <HeadingAnchor id={id} />
                {children}
              </h3>
            );
          },
          h4: ({ children }) => (
            <h4 className="mt-6 mb-2 text-base font-semibold text-foreground">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-4 text-foreground/90">{children}</p>
          ),
          a: ({ href, children }) => {
            const url = String(href ?? "");
            const isExternal =
              url.startsWith("http://") || url.startsWith("https://");
            const isInternal = url.startsWith("/");
            const linkClass =
              "font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary";
            if (isExternal) {
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={linkClass}
                >
                  {children}
                </a>
              );
            }
            if (isInternal) {
              return (
                <Link href={url} className={linkClass}>
                  {children}
                </Link>
              );
            }
            return (
              <a href={url} className={linkClass}>
                {children}
              </a>
            );
          },
          ul: ({ children }) => (
            <ul className="my-4 list-disc space-y-1.5 pl-6 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 list-decimal space-y-1.5 pl-6 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-1 text-foreground/90 [&>p]:my-2">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-5 rounded-r-md border-l-4 border-primary/60 bg-muted/40 px-4 py-3 text-foreground/85 [&>p]:my-1">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = /\blanguage-/.test(className ?? "");
            if (isBlock) {
              // Block-level <code> is wrapped by <pre> below; just emit
              // the inner so the <pre> styling controls the visuals.
              return <code className="font-mono text-[13px]">{children}</code>;
            }
            return (
              <code className="rounded border border-border/60 bg-muted/60 px-1.5 py-[1px] font-mono text-[0.875em] text-foreground">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-5 overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-10 border-border/60" />,
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-medium">{children}</th>
          ),
          tr: ({ children }) => (
            <tr className="border-t border-border/60 even:bg-muted/20">
              {children}
            </tr>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 align-top">{children}</td>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

function HeadingAnchor({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label="이 섹션의 링크 복사"
      className="float-left -ml-7 mr-2 mt-[2px] inline-flex h-6 w-5 items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
    >
      <Hash className="h-3.5 w-3.5" />
    </a>
  );
}

function nodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (React.isValidElement(node)) {
    return nodeText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}
