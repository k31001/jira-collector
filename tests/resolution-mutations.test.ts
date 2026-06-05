import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc, eq } from "drizzle-orm";

import {
  jiraServers,
  ratioConfigs,
  resolutionDashboardRatios,
  resolutionDashboardSources,
} from "@/lib/db/schema";
import {
  applyCreateResolutionDashboard,
  applyUpdateResolutionDashboard,
} from "@/lib/db/resolution-mutations";

let db: ReturnType<typeof drizzle>;

beforeEach(() => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
});

function seedServer() {
  const id = nanoid();
  db
    .insert(jiraServers)
    .values({
      id,
      name: "Test Jira",
      baseUrl: "http://localhost:4567",
      authType: "pat",
      encryptedCredentials: "test:test:test",
    })
    .run();
  return id;
}

function seedRatio(name: string) {
  const id = nanoid();
  db
    .insert(ratioConfigs)
    .values({ id, name, numeratorJql: "issuetype = Bug", denominatorJql: "" })
    .run();
  return id;
}

function attachedRatioIds(dashboardId: string) {
  return db
    .select()
    .from(resolutionDashboardRatios)
    .where(eq(resolutionDashboardRatios.dashboardId, dashboardId))
    .orderBy(asc(resolutionDashboardRatios.displayOrder))
    .all()
    .map((r) => r.ratioConfigId);
}

const BASE = {
  windowDays: 90,
  timeBucket: "week" as const,
  histogramBucketHours: 24,
  refreshIntervalSec: 600,
  sources: [],
};

test("create persists milestones for each source", () => {
  const serverId = seedServer();
  const { id } = applyCreateResolutionDashboard(
    {
      name: "Test Board",
      windowDays: 90,
      timeBucket: "week",
      histogramBucketHours: 24,
      refreshIntervalSec: 600,
      sources: [
        {
          serverId,
          label: "Team A",
          jql: "project = PROJ",
          color: "#3B82F6",
          milestones: [
            { name: "v2 릴리즈", date: "2026-04-15" },
            { name: "SLA 변경", date: "2026-05-01" },
          ],
        },
      ],
      ratioConfigIds: [],
    },
    db,
  );

  const row = db
    .select()
    .from(resolutionDashboardSources)
    .where(eq(resolutionDashboardSources.dashboardId, id))
    .get();
  assert.ok(row, "source should be inserted");
  const stored = JSON.parse(row!.milestones) as Array<{
    name: string;
    date: string;
  }>;
  assert.equal(stored.length, 2);
  assert.equal(stored[0].name, "v2 릴리즈");
  assert.equal(stored[0].date, "2026-04-15");
  assert.equal(stored[1].name, "SLA 변경");
});

test("update persists milestones (regression for missing column in update insert)", () => {
  const serverId = seedServer();
  const { id } = applyCreateResolutionDashboard(
    {
      name: "Test Board",
      windowDays: 90,
      timeBucket: "week",
      histogramBucketHours: 24,
      refreshIntervalSec: 600,
      sources: [
        {
          serverId,
          label: "Team A",
          jql: "project = PROJ",
          color: "#3B82F6",
          milestones: [],
        },
      ],
      ratioConfigIds: [],
    },
    db,
  );

  applyUpdateResolutionDashboard(
    id,
    {
      sources: [
        {
          serverId,
          label: "Team A",
          jql: "project = PROJ",
          color: "#3B82F6",
          milestones: [{ name: "v2 릴리즈", date: "2026-04-15" }],
        },
      ],
    },
    db,
  );

  const row = db
    .select()
    .from(resolutionDashboardSources)
    .where(eq(resolutionDashboardSources.dashboardId, id))
    .get();
  assert.ok(row, "source should be re-inserted after update");
  const stored = JSON.parse(row!.milestones) as Array<{
    name: string;
    date: string;
  }>;
  assert.equal(stored.length, 1, "milestone added via update must persist");
  assert.equal(stored[0].name, "v2 릴리즈");
  assert.equal(stored[0].date, "2026-04-15");
});

test("update without sources leaves existing milestones intact", () => {
  const serverId = seedServer();
  const { id } = applyCreateResolutionDashboard(
    {
      name: "Test Board",
      windowDays: 90,
      timeBucket: "week",
      histogramBucketHours: 24,
      refreshIntervalSec: 600,
      sources: [
        {
          serverId,
          label: "Team A",
          jql: "project = PROJ",
          color: "#3B82F6",
          milestones: [{ name: "v2", date: "2026-04-15" }],
        },
      ],
      ratioConfigIds: [],
    },
    db,
  );

  applyUpdateResolutionDashboard(id, { windowDays: 180 }, db);

  const row = db
    .select()
    .from(resolutionDashboardSources)
    .where(eq(resolutionDashboardSources.dashboardId, id))
    .get();
  const stored = JSON.parse(row!.milestones) as Array<{
    name: string;
    date: string;
  }>;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, "v2");
});

test("create attaches selected ratios in order, dropping unknown and duplicate ids", () => {
  const r1 = seedRatio("R1");
  const r2 = seedRatio("R2");
  const { id } = applyCreateResolutionDashboard(
    { name: "Board", ...BASE, ratioConfigIds: [r2, r1, r2, "does-not-exist"] },
    db,
  );
  assert.deepEqual(attachedRatioIds(id), [r2, r1]);
});

test("update replaces ratio attachments", () => {
  const r1 = seedRatio("R1");
  const r2 = seedRatio("R2");
  const { id } = applyCreateResolutionDashboard(
    { name: "Board", ...BASE, ratioConfigIds: [r1] },
    db,
  );
  applyUpdateResolutionDashboard(id, { ratioConfigIds: [r2] }, db);
  assert.deepEqual(attachedRatioIds(id), [r2]);
});

test("update without ratioConfigIds leaves attachments intact", () => {
  const r1 = seedRatio("R1");
  const { id } = applyCreateResolutionDashboard(
    { name: "Board", ...BASE, ratioConfigIds: [r1] },
    db,
  );
  applyUpdateResolutionDashboard(id, { windowDays: 180 }, db);
  assert.deepEqual(attachedRatioIds(id), [r1]);
});

test("update with empty ratioConfigIds detaches all ratios", () => {
  const r1 = seedRatio("R1");
  const { id } = applyCreateResolutionDashboard(
    { name: "Board", ...BASE, ratioConfigIds: [r1] },
    db,
  );
  applyUpdateResolutionDashboard(id, { ratioConfigIds: [] }, db);
  assert.deepEqual(attachedRatioIds(id), []);
});

test("deleting a ratio config cascades to dashboard attachments", () => {
  const r1 = seedRatio("R1");
  const { id } = applyCreateResolutionDashboard(
    { name: "Board", ...BASE, ratioConfigIds: [r1] },
    db,
  );
  db.delete(ratioConfigs).where(eq(ratioConfigs.id, r1)).run();
  assert.deepEqual(attachedRatioIds(id), []);
});
