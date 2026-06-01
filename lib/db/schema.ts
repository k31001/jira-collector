import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const jiraServers = sqliteTable("jira_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  authType: text("auth_type").notNull().default("pat"), // 'pat' | 'basic'
  encryptedCredentials: text("encrypted_credentials").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const dashboards = sqliteTable("dashboards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  visibleColumns: text("visible_columns").notNull().default('["key","status","summary","latestComment","note"]'),
  columnOrder: text("column_order").notNull().default('["key","status","summary","latestComment","note"]'),
  refreshIntervalSec: integer("refresh_interval_sec").notNull().default(300),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const dashboardSources = sqliteTable(
  "dashboard_sources",
  {
    id: text("id").primaryKey(),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => jiraServers.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(), // 'jql' | 'urls'
    jql: text("jql"),
    issueUrls: text("issue_urls"), // JSON string array
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => ({
    byDashboard: index("dashboard_sources_dashboard_idx").on(t.dashboardId),
  }),
);

export const issueNotes = sqliteTable(
  "issue_notes",
  {
    id: text("id").primaryKey(),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => jiraServers.id, { onDelete: "cascade" }),
    issueKey: text("issue_key").notNull(),
    content: text("content").notNull().default(""),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    uniq: uniqueIndex("issue_notes_unique").on(
      t.dashboardId,
      t.serverId,
      t.issueKey,
    ),
  }),
);

export const customStatuses = sqliteTable("custom_statuses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3B82F6"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const customStatusMappings = sqliteTable(
  "custom_status_mappings",
  {
    id: text("id").primaryKey(),
    customStatusId: text("custom_status_id")
      .notNull()
      .references(() => customStatuses.id, { onDelete: "cascade" }),
    jiraStatusName: text("jira_status_name").notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("custom_status_mappings_unique").on(
      t.customStatusId,
      t.jiraStatusName,
    ),
  }),
);

export const statusColors = sqliteTable("status_colors", {
  statusName: text("status_name").primaryKey(),
  color: text("color").notNull(),
});

export const resolutionDashboards = sqliteTable("resolution_dashboards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  windowDays: integer("window_days").notNull().default(90),
  timeBucket: text("time_bucket").notNull().default("week"), // 'day' | 'week' | 'month'
  histogramBucketHours: integer("histogram_bucket_hours").notNull().default(24),
  refreshIntervalSec: integer("refresh_interval_sec").notNull().default(600),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const resolutionDashboardSources = sqliteTable(
  "resolution_dashboard_sources",
  {
    id: text("id").primaryKey(),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => resolutionDashboards.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => jiraServers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    jql: text("jql").notNull(),
    color: text("color").notNull().default("#3B82F6"),
    displayOrder: integer("display_order").notNull().default(0),
    milestones: text("milestones").notNull().default("[]"),
  },
  (t) => ({
    byDashboard: index("resolution_dashboard_sources_dashboard_idx").on(t.dashboardId),
  }),
);

export const customFacets = sqliteTable("custom_facets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const customFacetValues = sqliteTable(
  "custom_facet_values",
  {
    id: text("id").primaryKey(),
    facetId: text("facet_id")
      .notNull()
      .references(() => customFacets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    jql: text("jql").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => ({
    byFacet: index("custom_facet_values_facet_idx").on(t.facetId),
  }),
);

export const ratioConfigs = sqliteTable("ratio_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Restricted-JQL predicate for the numerator (the "of interest" subset). */
  numeratorJql: text("numerator_jql").notNull(),
  /** Predicate for the denominator; empty string means "all issues". */
  denominatorJql: text("denominator_jql").notNull().default(""),
  /** Which date to bucket by: 'created' (incoming) or 'resolved' (outgoing). */
  basis: text("basis").notNull().default("created"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export type JiraServer = typeof jiraServers.$inferSelect;
export type NewJiraServer = typeof jiraServers.$inferInsert;
export type Dashboard = typeof dashboards.$inferSelect;
export type NewDashboard = typeof dashboards.$inferInsert;
export type DashboardSource = typeof dashboardSources.$inferSelect;
export type NewDashboardSource = typeof dashboardSources.$inferInsert;
export type IssueNote = typeof issueNotes.$inferSelect;
export type CustomStatus = typeof customStatuses.$inferSelect;
export type CustomStatusMapping = typeof customStatusMappings.$inferSelect;
export type StatusColor = typeof statusColors.$inferSelect;
export type ResolutionDashboard = typeof resolutionDashboards.$inferSelect;
export type NewResolutionDashboard = typeof resolutionDashboards.$inferInsert;
export type ResolutionDashboardSource = typeof resolutionDashboardSources.$inferSelect;
export type NewResolutionDashboardSource =
  typeof resolutionDashboardSources.$inferInsert;
export type CustomFacet = typeof customFacets.$inferSelect;
export type NewCustomFacet = typeof customFacets.$inferInsert;
export type CustomFacetValue = typeof customFacetValues.$inferSelect;
export type NewCustomFacetValue = typeof customFacetValues.$inferInsert;
export type RatioConfig = typeof ratioConfigs.$inferSelect;
export type NewRatioConfig = typeof ratioConfigs.$inferInsert;
