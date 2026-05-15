"use server";

import { z } from "zod";
import { getServerConfig } from "@/lib/db/queries";
import { countIssues } from "@/lib/jira/client";

const schema = z.object({
  serverId: z.string().min(1, "서버를 선택하세요"),
  jql: z.string().min(1, "JQL을 입력하세요"),
});

export async function testJql(input: z.infer<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const message =
      parsed.error.issues.map((i) => i.message).join(", ") || "잘못된 입력";
    return { ok: false as const, error: message };
  }
  const data = parsed.data;
  const server = getServerConfig(data.serverId);
  if (!server) return { ok: false as const, error: "서버를 찾을 수 없습니다" };
  try {
    const count = await countIssues(server, data.jql);
    return { ok: true as const, count };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
