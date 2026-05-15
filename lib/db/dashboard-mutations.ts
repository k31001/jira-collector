/**
 * Pure DB mutation logic for dashboards. Decoupled from Next runtime
 * (no `revalidatePath`, no `"use server"`) so it can be exercised directly
 * from tests with a fresh SQLite instance.
 *
 * The Next-side server actions in `actions/dashboards.ts` are thin wrappers
 * that call these and then invalidate the right paths.
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb } from "./client";
import { dashboards, dashboardSources, issueNotes } from "./schema";

type AnyDb = BetterSQLite3Database<Record<string, never>> | typeof defaultDb;

const sourceSchema = z.object({
  serverId: z.string().min(1),
  sourceType: z.enum(["jql", "urls"]),
  jql: z.string().optional(),
  issueUrls: z.array(z.string()).optional(),
});

export const dashboardInputSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(120),
  description: z.string().optional(),
  refreshIntervalSec: z.number().int().min(0).max(86_400).default(300),
  visibleColumns: z
    .array(z.string())
    .default(["key", "status", "summary", "latestComment", "note"]),
  columnOrder: z
    .array(z.string())
    .default(["key", "status", "summary", "latestComment", "note"]),
  sources: z.array(sourceSchema).default([]),
});

export const dashboardUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  refreshIntervalSec: z.number().int().min(0).max(86_400).optional(),
  visibleColumns: z.array(z.string()).optional(),
  columnOrder: z.array(z.string()).optional(),
  sources: z.array(sourceSchema).optional(),
});

export type DashboardInput = z.infer<typeof dashboardInputSchema>;
export type DashboardUpdate = z.infer<typeof dashboardUpdateSchema>;

export function applyCreateDashboard(
  input: DashboardInput,
  database: AnyDb = defaultDb,
): { id: string } {
  const data = dashboardInputSchema.parse(input);
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  database
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
    database
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
  return { id };
}

export function applyUpdateDashboard(
  id: string,
  input: DashboardUpdate,
  database: AnyDb = defaultDb,
): void {
  const next = dashboardUpdateSchema.parse(input);
  const update: Partial<typeof dashboards.$inferInsert> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };
  if (next.name !== undefined) update.name = next.name;
  if (next.description !== undefined) update.description = next.description ?? null;
  if (next.refreshIntervalSec !== undefined)
    update.refreshIntervalSec = next.refreshIntervalSec;
  if (next.visibleColumns !== undefined)
    update.visibleColumns = JSON.stringify(next.visibleColumns);
  if (next.columnOrder !== undefined)
    update.columnOrder = JSON.stringify(next.columnOrder);
  database.update(dashboards).set(update).where(eq(dashboards.id, id)).run();

  if (next.sources !== undefined) {
    database
      .delete(dashboardSources)
      .where(eq(dashboardSources.dashboardId, id))
      .run();
    next.sources.forEach((s, i) => {
      database
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
}

export function applyDeleteDashboard(
  id: string,
  database: AnyDb = defaultDb,
): void {
  database.delete(dashboards).where(eq(dashboards.id, id)).run();
}

export function applyCloneDashboard(
  id: string,
  database: AnyDb = defaultDb,
): { id: string } {
  const orig = database.select().from(dashboards).where(eq(dashboards.id, id)).get();
  if (!orig) throw new Error("대시보드를 찾을 수 없습니다");
  const newId = nanoid();
  const now = Math.floor(Date.now() / 1000);
  database
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

  const origSources = database
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  for (const s of origSources) {
    database
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
  return { id: newId };
}

export function applySetFavorite(
  id: string,
  favorite: boolean,
  database: AnyDb = defaultDb,
): void {
  database
    .update(dashboards)
    .set({ favorite, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(dashboards.id, id))
    .run();
}

export function applyDeleteNotesForDashboard(
  id: string,
  database: AnyDb = defaultDb,
): void {
  database.delete(issueNotes).where(eq(issueNotes.dashboardId, id)).run();
}
