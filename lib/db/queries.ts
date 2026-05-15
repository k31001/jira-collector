import "server-only";
import { eq, and } from "drizzle-orm";
import { db } from "./client";
import {
  jiraServers,
  dashboards,
  dashboardSources,
  issueNotes,
  customStatuses,
  customStatusMappings,
  statusColors,
} from "./schema";
import { decrypt } from "@/lib/crypto";
import type { JiraServerConfig } from "@/lib/jira/types";

export async function listServers() {
  return db.select().from(jiraServers).all();
}

export async function listServersForClient() {
  const all = await listServers();
  return all.map((row) => {
    const { encryptedCredentials, ...rest } = row;
    void encryptedCredentials;
    return rest;
  });
}

export function getServer(id: string) {
  return db.select().from(jiraServers).where(eq(jiraServers.id, id)).get();
}

export function getServerConfig(id: string): JiraServerConfig | undefined {
  const row = getServer(id);
  if (!row) return undefined;
  return rowToServerConfig(row);
}

export function rowToServerConfig(row: typeof jiraServers.$inferSelect): JiraServerConfig {
  const plain = decrypt(row.encryptedCredentials);
  let parsed: { token?: string; email?: string };
  try {
    parsed = JSON.parse(plain) as { token?: string; email?: string };
  } catch {
    parsed = { token: plain };
  }
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl.replace(/\/$/, ""),
    auth:
      row.authType === "basic"
        ? { type: "basic", email: parsed.email ?? "", token: parsed.token ?? "" }
        : { type: "pat", token: parsed.token ?? "" },
  };
}

export async function listDashboards() {
  return db.select().from(dashboards).all();
}

export function getDashboard(id: string) {
  return db.select().from(dashboards).where(eq(dashboards.id, id)).get();
}

export function listSourcesForDashboard(dashboardId: string) {
  return db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.dashboardId, dashboardId))
    .all();
}

export function getNotesForDashboard(dashboardId: string) {
  return db
    .select()
    .from(issueNotes)
    .where(eq(issueNotes.dashboardId, dashboardId))
    .all();
}

export function getNote(dashboardId: string, serverId: string, issueKey: string) {
  return db
    .select()
    .from(issueNotes)
    .where(
      and(
        eq(issueNotes.dashboardId, dashboardId),
        eq(issueNotes.serverId, serverId),
        eq(issueNotes.issueKey, issueKey),
      ),
    )
    .get();
}

export async function getStatusContext() {
  const [css, csMaps, scolors] = await Promise.all([
    db.select().from(customStatuses).all(),
    db.select().from(customStatusMappings).all(),
    db.select().from(statusColors).all(),
  ]);
  return {
    customStatuses: css,
    customMappings: csMaps,
    statusColors: scolors,
  };
}
