"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { dashboards, dashboardSources, issueNotes } from "@/lib/db/schema";

const sourceSchema = z.object({
  serverId: z.string().min(1),
  sourceType: z.enum(["jql", "urls"]),
  jql: z.string().optional(),
  issueUrls: z.array(z.string()).optional(),
});

const dashboardInputSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(120),
  description: z.string().optional(),
  refreshIntervalSec: z.number().int().min(0).max(86_400).default(300),
  visibleColumns: z.array(z.string()).default(["key", "status", "summary", "latestComment", "note"]),
  columnOrder: z.array(z.string()).default(["key", "status", "summary", "latestComment", "note"]),
  sources: z.array(sourceSchema).default([]),
});

export type DashboardInput = z.infer<typeof dashboardInputSchema>;

export async function createDashboard(input: DashboardInput) {
  const data = dashboardInputSchema.parse(input);
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  db
    .insert(dashboards)
    .values({
      id,
      name: data.name,
      description: data.description ?? null,
      visibleColumns: JSON.stringify(data.visibleColumns),
      columnOrder: JSON.stringify(data.columnOrder),
      refreshIntervalSec: data.refreshIntervalSec,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  data.sources.forEach((s, i) => {
    db
      .insert(dashboardSources)
      .values({
        id: nanoid(),
        dashboardId: id,
        serverId: s.serverId,
        sourceType: s.sourceType,
        jql: s.jql ?? null,
        issueUrls: s.issueUrls ? JSON.stringify(s.issueUrls) : null,
        displayOrder: i,
      })
      .run();
  });
  revalidatePath("/dashboards", "layout");
  return { id };
}

export async function updateDashboard(id: string, input: Partial<DashboardInput>) {
  const next = dashboardInputSchema.partial().parse(input);
  const update: Partial<typeof dashboards.$inferInsert> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };
  if (next.name !== undefined) update.name = next.name;
  if (next.description !== undefined) update.description = next.description ?? null;
  if (next.refreshIntervalSec !== undefined)
    update.refreshIntervalSec = next.refreshIntervalSec;
  if (next.visibleColumns) update.visibleColumns = JSON.stringify(next.visibleColumns);
  if (next.columnOrder) update.columnOrder = JSON.stringify(next.columnOrder);
  db.update(dashboards).set(update).where(eq(dashboards.id, id)).run();

  if (next.sources) {
    db.delete(dashboardSources).where(eq(dashboardSources.dashboardId, id)).run();
    next.sources.forEach((s, i) => {
      db
        .insert(dashboardSources)
        .values({
          id: nanoid(),
          dashboardId: id,
          serverId: s.serverId,
          sourceType: s.sourceType,
          jql: s.jql ?? null,
          issueUrls: s.issueUrls ? JSON.stringify(s.issueUrls) : null,
          displayOrder: i,
        })
        .run();
    });
  }
  revalidatePath(`/dashboards/${id}`);
  revalidatePath(`/dashboards/${id}/edit`);
  revalidatePath("/dashboards", "layout");
  return { id };
}

export async function deleteDashboard(id: string) {
  db.delete(dashboards).where(eq(dashboards.id, id)).run();
  revalidatePath("/dashboards", "layout");
}

export async function cloneDashboard(id: string) {
  const orig = db.select().from(dashboards).where(eq(dashboards.id, id)).get();
  if (!orig) throw new Error("대시보드를 찾을 수 없습니다");
  const newId = nanoid();
  const now = Math.floor(Date.now() / 1000);
  db
    .insert(dashboards)
    .values({
      id: newId,
      name: `${orig.name} (복사)`,
      description: orig.description,
      visibleColumns: orig.visibleColumns,
      columnOrder: orig.columnOrder,
      refreshIntervalSec: orig.refreshIntervalSec,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const origSources = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  for (const s of origSources) {
    db
      .insert(dashboardSources)
      .values({
        id: nanoid(),
        dashboardId: newId,
        serverId: s.serverId,
        sourceType: s.sourceType,
        jql: s.jql,
        issueUrls: s.issueUrls,
        displayOrder: s.displayOrder,
      })
      .run();
  }
  revalidatePath("/dashboards", "layout");
  return { id: newId };
}

export async function setFavorite(id: string, favorite: boolean) {
  db
    .update(dashboards)
    .set({ favorite, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(dashboards.id, id))
    .run();
  revalidatePath("/dashboards", "layout");
}

export async function deleteNotesForDashboard(id: string) {
  db.delete(issueNotes).where(eq(issueNotes.dashboardId, id)).run();
  revalidatePath(`/dashboards/${id}`);
}
