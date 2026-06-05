import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";

import {
  jiraServers,
  ratioConfigs,
  resolutionDashboardRatios,
  resolutionDashboardSources,
} from "@/lib/db/schema";
import {
  applyCreateResolutionDashboard,
  applyDeleteResolutionDashboard,
  applyReplaceRatioDashboards,
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

function seedRatio(name: string, displayOrder = 0) {
  const id = nanoid();
  db
    .insert(ratioConfigs)
    .values({
      id,
      name,
      numeratorJql: "issuetype = Bug",
      denominatorJql: "",
      displayOrder,
    })
    .run();
  return id;
}

const BASE = {
  windowDays: 90,
  timeBucket: "week" as const,
  histogramBucketHours: 24,
  refreshIntervalSec: 600,
  sources: [],
};

function seedDashboard(name: string) {
  return applyCreateResolutionDashboard({ name, ...BASE }, db).id;
}

function dashboardsForRatio(ratioConfigId: string) {
  return db
    .select()
    .from(resolutionDashboardRatios)
    .where(eq(resolutionDashboardRatios.ratioConfigId, ratioConfigId))
    .all()
    .map((r) => r.dashboardId)
    .sort();
}

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

test("applyReplaceRatioDashboards attaches a ratio to multiple dashboards", () => {
  const r = seedRatio("R");
  const d1 = seedDashboard("D1");
  const d2 = seedDashboard("D2");
  applyReplaceRatioDashboards(r, [d1, d2], db);
  assert.deepEqual(dashboardsForRatio(r), [d1, d2].sort());
});

test("applyReplaceRatioDashboards replaces the prior selection", () => {
  const r = seedRatio("R");
  const d1 = seedDashboard("D1");
  const d2 = seedDashboard("D2");
  applyReplaceRatioDashboards(r, [d1], db);
  applyReplaceRatioDashboards(r, [d2], db);
  assert.deepEqual(dashboardsForRatio(r), [d2]);
});

test("applyReplaceRatioDashboards drops unknown and duplicate dashboard ids", () => {
  const r = seedRatio("R");
  const d1 = seedDashboard("D1");
  applyReplaceRatioDashboards(r, [d1, d1, "does-not-exist"], db);
  assert.deepEqual(dashboardsForRatio(r), [d1]);
});

test("applyReplaceRatioDashboards with [] detaches all dashboards", () => {
  const r = seedRatio("R");
  const d1 = seedDashboard("D1");
  applyReplaceRatioDashboards(r, [d1], db);
  applyReplaceRatioDashboards(r, [], db);
  assert.deepEqual(dashboardsForRatio(r), []);
});

test("attachment displayOrder follows the ratio's global order", () => {
  const r = seedRatio("R", 3);
  const d1 = seedDashboard("D1");
  applyReplaceRatioDashboards(r, [d1], db);
  const row = db
    .select()
    .from(resolutionDashboardRatios)
    .where(eq(resolutionDashboardRatios.ratioConfigId, r))
    .get();
  assert.equal(row?.displayOrder, 3);
});

test("deleting a dashboard cascades to its ratio attachments", () => {
  const r = seedRatio("R");
  const d1 = seedDashboard("D1");
  applyReplaceRatioDashboards(r, [d1], db);
  applyDeleteResolutionDashboard(d1, db);
  assert.deepEqual(dashboardsForRatio(r), []);
});
