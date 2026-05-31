import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { MarkdownView } from "@/components/docs/MarkdownView";

export const dynamic = "force-static";

const DOCS = {
  usage: {
    title: "사용 매뉴얼",
    description: "대시보드 만들기 · 이슈 노트 · 트렌드 차트 · 기간 보고서 등 일상 사용법.",
    file: "docs/dashboard-guide.md",
  },
  install: {
    title: "설치 매뉴얼",
    description: "자체 서버에 영구 서비스로 띄우는 방법 (Docker · systemd · Nginx).",
    file: "docs/self-hosting.md",
  },
} as const;

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = DOCS[slug as keyof typeof DOCS];
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

  return (
    <>
      <PageHeader title={doc.title} description={doc.description} />
      <div className="p-6">
        <MarkdownView source={content} />
      </div>
    </>
  );
}
