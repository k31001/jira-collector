/**
 * Pure DB mutations for resolution-time dashboards. Mirrors
 * `dashboard-mutations.ts` so the Next-side server actions can stay thin.
 */
import "server-only";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb } from "./client";
import {
  ratioConfigs,
  resolutionDashboards,
  resolutionDashboardRatios,
  resolutionDashboardSources,
} from "./schema";

// Accept the app's schema-bound db, an explicitly empty-schema db, or a
// schema-less db (what `drizzle(sqlite)` yields in tests) — all expose the
// same query builder used below.
type AnyDb =
  | BetterSQLite3Database<Record<string, never>>
  | BetterSQLite3Database<Record<string, unknown>>
  | typeof defaultDb;

export const TIME_BUCKETS = ["day", "week", "month", "quarter"] as const;

const milestoneSchema = z.object({
  name: z.string().min(1, "마일스톤 이름을 입력하세요").max(80),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다"),
});

export type Milestone = z.infer<typeof milestoneSchema>;

const sourceSchema = z.object({
  serverId: z.string().min(1, "Jira 서버를 선택하세요"),
  label: z.string().min(1, "라벨을 입력하세요").max(80),
  jql: z.string().min(1, "JQL을 입력하세요"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "컬러는 #RRGGBB 형식이어야 합니다")
    .default("#3B82F6"),
  milestones: z.array(milestoneSchema).default([]),
});

export const resolutionDashboardInputSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(120),
  description: z.string().optional(),
  windowDays: z.number().int().min(7).max(365).default(90),
  timeBucket: z.enum(TIME_BUCKETS).default("week"),
  histogramBucketHours: z.number().int().min(1).max(720).default(24),
  refreshIntervalSec: z.number().int().min(0).max(86_400).default(600),
  sources: z.array(sourceSchema).default([]),
  /** Ids of global ratio configs this dashboard displays (order = render order). */
  ratioConfigIds: z.array(z.string()).default([]),
});

// Hand-rolled to avoid `.partial()` which preserves the `.default([])` on
// child fields and would silently turn `undefined sources` into `[]`, wiping
// out existing rows. The matching dashboard mutations have the same quirk.
export const resolutionDashboardUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  windowDays: z.number().int().min(7).max(365).optional(),
  timeBucket: z.enum(TIME_BUCKETS).optional(),
  histogramBucketHours: z.number().int().min(1).max(720).optional(),
  refreshIntervalSec: z.number().int().min(0).max(86_400).optional(),
  sources: z.array(sourceSchema).optional(),
  // `undefined` = leave attachments untouched; `[]` = detach all.
  ratioConfigIds: z.array(z.string()).optional(),
});

export type ResolutionDashboardInput = z.infer<
  typeof resolutionDashboardInputSchema
>;
export type ResolutionDashboardUpdate = z.infer<
  typeof resolutionDashboardUpdateSchema
>;

/**
 * Replace a dashboard's ratio attachments with `ratioConfigIds` (delete-all
 * then insert), mirroring how sources are replaced. Ids that no longer exist
 * are dropped and duplicates are collapsed, so a stale selection can't violate
 * the (dashboard, ratio) unique index or leave a dangling FK.
 */
function replaceDashboardRatios(
  database: AnyDb,
  dashboardId: string,
  ratioConfigIds: string[],
): void {
  database
    .delete(resolutionDashboardRatios)
    .where(eq(resolutionDashboardRatios.dashboardId, dashboardId))
    .run();
  if (ratioConfigIds.length === 0) return;
  const existing = new Set(
    database
      .select({ id: ratioConfigs.id })
      .from(ratioConfigs)
      .where(inArray(ratioConfigs.id, ratioConfigIds))
      .all()
      .map((r) => r.id),
  );
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of ratioConfigIds) {
    if (existing.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  ordered.forEach((ratioConfigId, i) => {
    database
      .insert(resolutionDashboardRatios)
      .values({ id: nanoid(), dashboardId, ratioConfigId, displayOrder: i })
      .run();
  });
}

export function applyCreateResolutionDashboard(
  input: ResolutionDashboardInput,
  database: AnyDb = defaultDb,
): { id: string } {
  const data = resolutionDashboardInputSchema.parse(input);
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  database
    .insert(resolutionDashboards)
    .values({
      id,
      name: data.name,
      description: data.description ?? null,
      windowDays: data.windowDays,
      timeBucket: data.timeBucket,
      histogramBucketHours: data.histogramBucketHours,
      refreshIntervalSec: data.refreshIntervalSec,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  data.sources.forEach((s, i) => {
    database
      .insert(resolutionDashboardSources)
      .values({
        id: nanoid(),
        dashboardId: id,
        serverId: s.serverId,
        label: s.label,
        jql: s.jql,
        color: s.color,
        milestones: JSON.stringify(s.milestones),
        displayOrder: i,
      })
      .run();
  });
  replaceDashboardRatios(database, id, data.ratioConfigIds);
  return { id };
}

export function applyUpdateResolutionDashboard(
  id: string,
  input: ResolutionDashboardUpdate,
  database: AnyDb = defaultDb,
): void {
  const next = resolutionDashboardUpdateSchema.parse(input);
  const update: Partial<typeof resolutionDashboards.$inferInsert> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };
  if (next.name !== undefined) update.name = next.name;
  if (next.description !== undefined)
    update.description = next.description ?? null;
  if (next.windowDays !== undefined) update.windowDays = next.windowDays;
  if (next.timeBucket !== undefined) update.timeBucket = next.timeBucket;
  if (next.histogramBucketHours !== undefined)
    update.histogramBucketHours = next.histogramBucketHours;
  if (next.refreshIntervalSec !== undefined)
    update.refreshIntervalSec = next.refreshIntervalSec;
  database
    .update(resolutionDashboards)
    .set(update)
    .where(eq(resolutionDashboards.id, id))
    .run();

  if (next.sources !== undefined) {
    database
      .delete(resolutionDashboardSources)
      .where(eq(resolutionDashboardSources.dashboardId, id))
      .run();
    next.sources.forEach((s, i) => {
      database
        .insert(resolutionDashboardSources)
        .values({
          id: nanoid(),
          dashboardId: id,
          serverId: s.serverId,
          label: s.label,
          jql: s.jql,
          color: s.color,
          milestones: JSON.stringify(s.milestones ?? []),
          displayOrder: i,
        })
        .run();
    });
  }

  if (next.ratioConfigIds !== undefined) {
    replaceDashboardRatios(database, id, next.ratioConfigIds);
  }
}

export function applyDeleteResolutionDashboard(
  id: string,
  database: AnyDb = defaultDb,
): void {
  database
    .delete(resolutionDashboards)
    .where(eq(resolutionDashboards.id, id))
    .run();
}

export function applySetResolutionFavorite(
  id: string,
  favorite: boolean,
  database: AnyDb = defaultDb,
): void {
  database
    .update(resolutionDashboards)
    .set({ favorite, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(resolutionDashboards.id, id))
    .run();
}
