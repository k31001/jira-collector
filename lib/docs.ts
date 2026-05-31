/**
 * Markdown helpers shared by /docs pages.
 * Pure functions — usable from both server (TOC extraction) and client
 * (heading IDs in <MarkdownView>) without crossing the network.
 */

export type TocItem = {
  level: 2 | 3;
  text: string;
  slug: string;
};

/**
 * Convert a heading text into a URL-fragment-safe slug. Preserves unicode
 * letters (so Korean headings stay readable), strips punctuation, collapses
 * whitespace to hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scan a markdown source for `##` / `###` headings and emit a table of
 * contents. Headings inside fenced code blocks are skipped.
 */
export function extractToc(source: string): TocItem[] {
  const out: TocItem[] = [];
  let inCodeBlock = false;
  for (const line of source.split("\n")) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = line.match(/^(##|###)\s+(.+?)\s*$/);
    if (!match) continue;
    const level = match[1].length === 2 ? 2 : 3;
    const text = match[2].replace(/[*_`]+/g, "").trim();
    if (!text) continue;
    out.push({ level: level as 2 | 3, text, slug: slugify(text) });
  }
  return out;
}
