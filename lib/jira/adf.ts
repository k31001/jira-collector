/**
 * Extract plain text from Atlassian Document Format (ADF) — Jira Cloud
 * returns comment/description bodies as ADF JSON unless `expand=renderedFields`
 * is honored. We prefer renderedBody when present, but fall back to walking
 * the ADF tree so the "latest comment" column never shows `[object Object]`.
 */
export function adfToText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join("");
  if (typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (n.type === "hardBreak") return "\n";
  if (Array.isArray(n.content)) {
    const inner = (n.content as unknown[]).map(adfToText).join("");
    if (n.type === "paragraph" || n.type === "heading" || n.type === "listItem") {
      return `${inner}\n`;
    }
    return inner;
  }
  return "";
}

export function commentBodyToText(comment: {
  body?: unknown;
  renderedBody?: unknown;
}): string {
  const rb = comment.renderedBody;
  if (typeof rb === "string" && rb.trim().length > 0) return rb;
  return adfToText(comment.body).trim();
}
