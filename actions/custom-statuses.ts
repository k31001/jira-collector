"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  customStatuses,
  customStatusMappings,
  statusColors,
} from "@/lib/db/schema";

const customStatusInput = z.object({
  name: z.string().min(1, "이름이 필요합니다").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/i, "올바른 hex 컬러를 입력하세요"),
  mappings: z.array(z.string().min(1)).default([]),
  displayOrder: z.number().int().optional(),
});

export type CustomStatusInput = z.infer<typeof customStatusInput>;

export async function createCustomStatus(input: CustomStatusInput) {
  const data = customStatusInput.parse(input);
  const id = nanoid();
  db
    .insert(customStatuses)
    .values({
      id,
      name: data.name,
      color: data.color,
      displayOrder: data.displayOrder ?? 0,
    })
    .run();
  await setMappings(id, data.mappings);
  revalidatePath("/settings/custom-statuses");
  revalidatePath("/dashboards", "layout");
  return { id };
}

export async function updateCustomStatus(id: string, input: Partial<CustomStatusInput>) {
  const data = customStatusInput.partial().parse(input);
  const update: Partial<typeof customStatuses.$inferInsert> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.color !== undefined) update.color = data.color;
  if (data.displayOrder !== undefined) update.displayOrder = data.displayOrder;
  if (Object.keys(update).length > 0) {
    db.update(customStatuses).set(update).where(eq(customStatuses.id, id)).run();
  }
  if (data.mappings) await setMappings(id, data.mappings);
  revalidatePath("/settings/custom-statuses");
  revalidatePath("/dashboards", "layout");
}

export async function deleteCustomStatus(id: string) {
  db.delete(customStatuses).where(eq(customStatuses.id, id)).run();
  revalidatePath("/settings/custom-statuses");
  revalidatePath("/dashboards", "layout");
}

export async function setMappings(customStatusId: string, mappings: string[]) {
  db
    .delete(customStatusMappings)
    .where(eq(customStatusMappings.customStatusId, customStatusId))
    .run();
  const unique = Array.from(new Set(mappings.map((m) => m.trim()).filter(Boolean)));
  for (const m of unique) {
    db
      .insert(customStatusMappings)
      .values({
        id: nanoid(),
        customStatusId,
        jiraStatusName: m,
      })
      .run();
  }
}

const colorSchema = z.object({
  statusName: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/i),
});

export async function setStatusColor(input: z.infer<typeof colorSchema>) {
  const data = colorSchema.parse(input);
  const existing = db
    .select()
    .from(statusColors)
    .where(eq(statusColors.statusName, data.statusName))
    .get();
  if (existing) {
    db
      .update(statusColors)
      .set({ color: data.color })
      .where(eq(statusColors.statusName, data.statusName))
      .run();
  } else {
    db.insert(statusColors).values(data).run();
  }
  revalidatePath("/settings/status-colors");
  revalidatePath("/dashboards", "layout");
}

export async function deleteStatusColor(statusName: string) {
  db.delete(statusColors).where(eq(statusColors.statusName, statusName)).run();
  revalidatePath("/settings/status-colors");
  revalidatePath("/dashboards", "layout");
}
