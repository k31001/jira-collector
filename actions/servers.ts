"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { jiraServers } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { getMyself } from "@/lib/jira/client";

const serverInputSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(60),
  baseUrl: z
    .string()
    .url("올바른 URL이 아닙니다")
    .transform((s) => s.replace(/\/$/, "")),
  authType: z.enum(["pat", "basic"]).default("pat"),
  email: z.string().optional(),
  token: z.string().min(1, "토큰을 입력하세요"),
});

export type ServerInput = z.infer<typeof serverInputSchema>;

export async function createServer(input: ServerInput) {
  const data = serverInputSchema.parse(input);
  const id = nanoid();
  const credentials = encrypt(
    JSON.stringify(
      data.authType === "basic"
        ? { email: data.email ?? "", token: data.token }
        : { token: data.token },
    ),
  );
  const now = Math.floor(Date.now() / 1000);
  db
    .insert(jiraServers)
    .values({
      id,
      name: data.name,
      baseUrl: data.baseUrl,
      authType: data.authType,
      encryptedCredentials: credentials,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  revalidatePath("/settings/servers");
  revalidatePath("/dashboards", "layout");
  return { id };
}

export async function updateServer(id: string, input: Partial<ServerInput>) {
  const existing = db.select().from(jiraServers).where(eq(jiraServers.id, id)).get();
  if (!existing) throw new Error("서버를 찾을 수 없습니다");

  const next = serverInputSchema.partial().parse(input);
  const update: Partial<typeof jiraServers.$inferInsert> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };
  if (next.name) update.name = next.name;
  if (next.baseUrl) update.baseUrl = next.baseUrl;
  if (next.authType) update.authType = next.authType;
  if (next.token) {
    const authType = next.authType ?? existing.authType;
    update.encryptedCredentials = encrypt(
      JSON.stringify(
        authType === "basic"
          ? { email: next.email ?? "", token: next.token }
          : { token: next.token },
      ),
    );
  }
  db.update(jiraServers).set(update).where(eq(jiraServers.id, id)).run();
  revalidatePath("/settings/servers");
  return { id };
}

export async function deleteServer(id: string) {
  db.delete(jiraServers).where(eq(jiraServers.id, id)).run();
  revalidatePath("/settings/servers");
  revalidatePath("/dashboards", "layout");
  return { id };
}

const testInputSchema = serverInputSchema.pick({
  baseUrl: true,
  authType: true,
  email: true,
  token: true,
});

export async function testConnection(input: z.infer<typeof testInputSchema>) {
  const data = testInputSchema.parse(input);
  try {
    const me = await getMyself({
      id: "test",
      name: "test",
      baseUrl: data.baseUrl,
      auth:
        data.authType === "basic"
          ? { type: "basic", email: data.email ?? "", token: data.token }
          : { type: "pat", token: data.token },
    });
    return {
      ok: true as const,
      user: me.displayName ?? me.name ?? me.emailAddress ?? "(unknown)",
    };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
