"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { issueNotes } from "@/lib/db/schema";

const upsertSchema = z.object({
  dashboardId: z.string().min(1),
  serverId: z.string().min(1),
  issueKey: z.string().min(1),
  content: z.string().max(20_000),
});

export async function upsertNote(input: z.infer<typeof upsertSchema>) {
  const data = upsertSchema.parse(input);
  const now = Math.floor(Date.now() / 1000);
  const existing = db
    .select()
    .from(issueNotes)
    .where(
      and(
        eq(issueNotes.dashboardId, data.dashboardId),
        eq(issueNotes.serverId, data.serverId),
        eq(issueNotes.issueKey, data.issueKey),
      ),
    )
    .get();
  if (existing) {
    db
      .update(issueNotes)
      .set({ content: data.content, updatedAt: now })
      .where(eq(issueNotes.id, existing.id))
      .run();
    return { id: existing.id, updatedAt: now };
  }
  const id = nanoid();
  db
    .insert(issueNotes)
    .values({
      id,
      dashboardId: data.dashboardId,
      serverId: data.serverId,
      issueKey: data.issueKey,
      content: data.content,
      updatedAt: now,
    })
    .run();
  return { id, updatedAt: now };
}
