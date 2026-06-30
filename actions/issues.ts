"use server";

import { z } from "zod";
import { getServerConfig } from "@/lib/db/queries";
import { updateIssueLabels as updateIssueLabelsClient } from "@/lib/jira/client";
import { JiraError } from "@/lib/jira/types";

const labelsSchema = z.object({
  serverId: z.string().min(1),
  issueKey: z.string().min(1),
  // The full desired label set; Jira replaces the field wholesale.
  labels: z.array(z.string()).max(200),
});

/**
 * Normalize a raw label list to what Jira will accept: trim each entry, drop
 * blanks, and de-duplicate while preserving order. Jira forbids whitespace
 * inside a label, so we reject those up-front with a clear message rather than
 * letting the API return an opaque 400.
 */
function normalizeLabels(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const label = r.trim();
    if (!label) continue;
    if (/\s/.test(label)) {
      throw new Error(`라벨에는 공백을 넣을 수 없습니다: "${label}"`);
    }
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export async function updateIssueLabels(
  input: z.infer<typeof labelsSchema>,
): Promise<{ labels: string[] }> {
  const { serverId, issueKey, labels } = labelsSchema.parse(input);
  const server = getServerConfig(serverId);
  if (!server) {
    throw new Error("서버를 찾을 수 없습니다.");
  }
  const normalized = normalizeLabels(labels);
  try {
    await updateIssueLabelsClient(server, issueKey, normalized);
  } catch (err) {
    if (err instanceof JiraError) {
      throw new Error(`Jira 라벨 수정 실패 (${err.status}).`);
    }
    throw err;
  }
  return { labels: normalized };
}
