import "server-only";
import { eq, and, asc } from "drizzle-orm";
import { db } from "./client";
import {
  jiraServers,
  dashboards,
  dashboardSources,
  issueNotes,
  customStatuses,
  customStatusMappings,
  statusColors,
  customFacets,
  customFacetValues,
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

/* -------------------------------------------------------------------------- */
/*  Custom smart-filter facets (global)                                         */
/* -------------------------------------------------------------------------- */

export type CustomFacetWithValues = {
  id: string;
  name: string;
  displayOrder: number;
  values: Array<{
    id: string;
    name: string;
    jql: string;
    displayOrder: number;
  }>;
};

/**
 * Return every facet with its values inlined, sorted by display order.
 * Loaded fresh on each call — the table is small and only touched from the
 * resolution-time dashboard load and the settings page.
 */
export function listCustomFacetsWithValues(): CustomFacetWithValues[] {
  const facets = db
    .select()
    .from(customFacets)
    .orderBy(asc(customFacets.displayOrder), asc(customFacets.createdAt))
    .all();
  if (facets.length === 0) return [];
  const allValues = db
    .select()
    .from(customFacetValues)
    .orderBy(
      asc(customFacetValues.facetId),
      asc(customFacetValues.displayOrder),
    )
    .all();
  const valuesByFacet = new Map<string, typeof allValues>();
  for (const v of allValues) {
    const arr = valuesByFacet.get(v.facetId);
    if (arr) arr.push(v);
    else valuesByFacet.set(v.facetId, [v]);
  }
  return facets.map((f) => ({
    id: f.id,
    name: f.name,
    displayOrder: f.displayOrder,
    values: (valuesByFacet.get(f.id) ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      jql: v.jql,
      displayOrder: v.displayOrder,
    })),
  }));
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
