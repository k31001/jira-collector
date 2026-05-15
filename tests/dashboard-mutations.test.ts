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
  dashboards,
  dashboardSources,
} from "@/lib/db/schema";
import {
  applyCreateDashboard,
  applyUpdateDashboard,
  applyCloneDashboard,
  dashboardUpdateSchema,
} from "@/lib/db/dashboard-mutations";

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

test("dashboardUpdateSchema does NOT inject default sources on partial input", () => {
  const parsed = dashboardUpdateSchema.parse({
    visibleColumns: ["key", "status", "summary", "latestComment", "note", "created"],
  });
  assert.equal(parsed.sources, undefined, "sources must remain undefined for partial update");
  assert.equal(parsed.refreshIntervalSec, undefined, "refreshIntervalSec must remain undefined");
  assert.equal(parsed.columnOrder, undefined, "columnOrder must remain undefined");
  assert.equal(parsed.name, undefined, "name must remain undefined");
  assert.deepEqual(parsed.visibleColumns, [
    "key",
    "status",
    "summary",
    "latestComment",
    "note",
    "created",
  ]);
});

test("regression: toggling visibleColumns must NOT delete dashboard sources", () => {
  const serverId = seedServer();
  const { id } = applyCreateDashboard(
    {
      name: "Test Dashboard",
      refreshIntervalSec: 120,
      visibleColumns: ["key", "status", "summary", "latestComment", "note"],
      columnOrder: ["key", "status", "summary", "latestComment", "note"],
      sources: [
        { serverId, sourceType: "jql", jql: "project = PROJ" },
        { serverId, sourceType: "urls", issueUrls: ["http://localhost:4567/browse/PROJ-101"] },
      ],
    },
    db,
  );

  const before = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  assert.equal(before.length, 2, "two sources should be persisted after create");

  applyUpdateDashboard(
    id,
    {
      visibleColumns: ["key", "status", "summary", "latestComment", "note", "created"],
    },
    db,
  );

  const after = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  assert.equal(after.length, 2, "sources must survive a visibleColumns-only update");
  assert.deepEqual(
    after.map((s) => s.sourceType).sort(),
    ["jql", "urls"],
  );
});

test("toggling visibleColumns persists the new columns and does not reset refresh/columnOrder", () => {
  const serverId = seedServer();
  const { id } = applyCreateDashboard(
    {
      name: "Test",
      refreshIntervalSec: 600,
      visibleColumns: ["key", "status", "summary", "latestComment", "note"],
      columnOrder: ["summary", "key", "status", "latestComment", "note"],
      sources: [{ serverId, sourceType: "jql", jql: "project = PROJ" }],
    },
    db,
  );

  applyUpdateDashboard(
    id,
    { visibleColumns: ["key", "status", "summary", "latestComment", "note", "assignee"] },
    db,
  );

  const row = db.select().from(dashboards).where(eq(dashboards.id, id)).get()!;
  const visible = JSON.parse(row.visibleColumns) as string[];
  const order = JSON.parse(row.columnOrder) as string[];

  assert.deepEqual(visible, ["key", "status", "summary", "latestComment", "note", "assignee"]);
  assert.equal(row.refreshIntervalSec, 600, "refresh interval must be preserved");
  assert.deepEqual(order, ["summary", "key", "status", "latestComment", "note"], "column order must be preserved");
});

test("explicit { sources: [] } replaces sources (clears them)", () => {
  const serverId = seedServer();
  const { id } = applyCreateDashboard(
    {
      name: "Test",
      refreshIntervalSec: 300,
      visibleColumns: ["key", "status", "summary", "latestComment", "note"],
      columnOrder: ["key", "status", "summary", "latestComment", "note"],
      sources: [{ serverId, sourceType: "jql", jql: "project = PROJ" }],
    },
    db,
  );
  applyUpdateDashboard(id, { sources: [] }, db);

  const after = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  assert.equal(after.length, 0, "explicit empty sources array must clear all sources");
});

test("explicit { sources: [new] } replaces previous sources", () => {
  const serverId = seedServer();
  const { id } = applyCreateDashboard(
    {
      name: "Test",
      refreshIntervalSec: 300,
      visibleColumns: ["key", "status", "summary", "latestComment", "note"],
      columnOrder: ["key", "status", "summary", "latestComment", "note"],
      sources: [
        { serverId, sourceType: "jql", jql: "old jql" },
        { serverId, sourceType: "urls", issueUrls: ["http://localhost:4567/browse/PROJ-1"] },
      ],
    },
    db,
  );
  applyUpdateDashboard(
    id,
    { sources: [{ serverId, sourceType: "jql", jql: "new jql" }] },
    db,
  );

  const after = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  assert.equal(after.length, 1);
  assert.equal(after[0].jql, "new jql");
});

test("clone copies sources without affecting the original", () => {
  const serverId = seedServer();
  const { id } = applyCreateDashboard(
    {
      name: "Original",
      refreshIntervalSec: 300,
      visibleColumns: ["key", "status", "summary", "latestComment", "note"],
      columnOrder: ["key", "status", "summary", "latestComment", "note"],
      sources: [
        { serverId, sourceType: "jql", jql: "project = PROJ" },
        { serverId, sourceType: "jql", jql: "project = BUG" },
      ],
    },
    db,
  );
  const { id: cloneId } = applyCloneDashboard(id, db);

  assert.notEqual(id, cloneId);
  const origSources = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  const cloneSources = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, cloneId))
    .all();
  assert.equal(origSources.length, 2);
  assert.equal(cloneSources.length, 2);
  assert.deepEqual(
    cloneSources.map((s) => s.jql).sort(),
    ["project = BUG", "project = PROJ"],
  );

  // Deleting clone sources must not affect original
  applyUpdateDashboard(cloneId, { sources: [] }, db);
  const origAfter = db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, id))
    .all();
  assert.equal(origAfter.length, 2);
});
