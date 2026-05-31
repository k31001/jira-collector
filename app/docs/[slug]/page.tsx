import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { MarkdownView } from "@/components/docs/MarkdownView";
import { TocSidebar } from "@/components/docs/TocSidebar";
import { extractToc } from "@/lib/docs";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";

type DocSlug = "usage" | "install";

const DOCS: Record<
  DocSlug,
  { title: string; description: string; file: string }
> = {
  usage: {
    title: "사용 매뉴얼",
    description:
      "대시보드 만들기 · 이슈 노트 · 트렌드 차트 · 해결 시간 분석 · 기간 보고서 등 일상 사용법.",
    file: "docs/dashboard-guide.md",
  },
  install: {
    title: "설치 매뉴얼",
    description: "자체 서버에 영구 서비스로 띄우는 방법 (Docker · systemd · Nginx).",
    file: "docs/self-hosting.md",
  },
};

const DOC_ORDER: DocSlug[] = ["usage", "install"];

const DOC_META: Record<DocSlug, { icon: React.ReactNode }> = {
  usage: { icon: <BookOpen className="h-3.5 w-3.5" /> },
  install: { icon: <Download className="h-3.5 w-3.5" /> },
};

export function generateStaticParams() {
  return DOC_ORDER.map((slug) => ({ slug }));
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = DOCS[slug as DocSlug];
  if (!doc) notFound();

  const filePath = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    doc.file,
  );
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    notFound();
  }

  // Strip the H1 from the source — the PageHeader already shows the title,
  // so leaving it in causes a doubled top heading.
  const body = content.replace(/^#\s+.+\n+/, "");
  const toc = extractToc(body);

  return (
    <>
      <PageHeader title={doc.title} description={doc.description} />
      <div className="border-b bg-card/30 px-6 py-2">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs">
          {DOC_ORDER.map((s) => {
            const d = DOCS[s];
            const active = s === slug;
            return (
              <Link
                key={s}
                href={`/docs/${s}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {DOC_META[s].icon}
                {d.title}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mx-auto flex w-full max-w-6xl gap-12 px-6 py-8 lg:px-10">
        <article className="min-w-0 flex-1">
          <MarkdownView source={body} />
        </article>
        <aside className="hidden w-56 shrink-0 xl:block">
          <TocSidebar items={toc} />
        </aside>
      </div>
    </>
  );
}
