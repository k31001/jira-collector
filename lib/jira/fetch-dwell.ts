/**
 * Status dwell-time fetcher for the Resolution Time dashboard.
 *
 * This is the heavy, OPT-IN path: for each JQL source it searches the issue
 * keys, then fetches each issue's changelog (one request per issue) to
 * reconstruct status transitions, and finally aggregates per-status dwell
 * time on the server so the client receives a tiny payload.
 *
 * Because every issue costs a changelog request, the per-source issue set is
 * capped (`MAX_ISSUES_PER_SOURCE`) and `truncated` is surfaced so the UI can
 * tell the user the analysis was sampled.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  resolutionDashboards,
  resolutionDashboardSources,
} from "@/lib/db/schema";
import { getServerConfig } from "@/lib/db/queries";
import { JiraError } from "./types";
import { getIssueChangelog, searchIssues } from "./client";
import { runWithConcurrency } from "./fetch";
import { aggregateDwell, type DwellAggregateEntry, type DwellInput } from "@/lib/dwell";

const MAX_ISSUES_PER_SOURCE = 200;
const CHANGELOG_CONCURRENCY = 8;
const DWELL_FIELDS = ["status", "created", "resolutiondate"];

export type DwellSourceResult = {
  sourceId: string;
  label: string;
  color: string;
  statuses: DwellAggregateEntry[];
  issueCount: number;
  truncated: boolean;
  error: string | null;
};

export type DashboardDwellResult = {
  sources: DwellSourceResult[];
  fetchedAt: number;
};

type RawDwellIssue = {
  key: string;
  fields?: {
    status?: { name?: string };
    created?: string;
    resolutiondate?: string | null;
  };
};

export async function fetchDashboardDwell(
  dashboardId: string,
): Promise<DashboardDwellResult> {
  const dash = db
    .select()
    .from(resolutionDashboards)
    .where(eq(resolutionDashboards.id, dashboardId))
    .get();
  if (!dash) return { sources: [], fetchedAt: Date.now() };

  const sources = db
    .select()
    .from(resolutionDashboardSources)
    .where(eq(resolutionDashboardSources.dashboardId, dashboardId))
    .all()
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const now = Date.now();

  const results: DwellSourceResult[] = await Promise.all(
    sources.map(async (s) => {
      const base: DwellSourceResult = {
        sourceId: s.id,
        label: s.label,
        color: s.color,
        statuses: [],
        issueCount: 0,
        truncated: false,
        error: null,
      };
      const serverConfig = getServerConfig(s.serverId);
      if (!serverConfig) {
        return { ...base, error: "Jira 서버 설정을 찾을 수 없습니다" };
      }
      try {
        const raws = (await searchIssues(serverConfig, s.jql, {
          fields: DWELL_FIELDS,
        })) as RawDwellIssue[];
        const truncated = raws.length > MAX_ISSUES_PER_SOURCE;
        const sliced = truncated
          ? raws.slice(0, MAX_ISSUES_PER_SOURCE)
          : raws;

        const settled = await runWithConcurrency(
          sliced,
          CHANGELOG_CONCURRENCY,
          async (issue): Promise<DwellInput | null> => {
            const createdMs = issue.fields?.created
              ? Date.parse(issue.fields.created)
              : NaN;
            if (!Number.isFinite(createdMs)) return null;
            const resolved = issue.fields?.resolutiondate;
            const endMs = resolved ? Date.parse(resolved) : now;
            const transitions = await getIssueChangelog(serverConfig, issue.key);
            return {
              createdMs,
              currentStatus: issue.fields?.status?.name ?? "(미상)",
              endMs: Number.isFinite(endMs) ? endMs : now,
              transitions,
            };
          },
        );

        const inputs: DwellInput[] = [];
        for (const r of settled) {
          if (r.status === "fulfilled" && r.value) inputs.push(r.value);
        }

        return {
          ...base,
          statuses: aggregateDwell(inputs),
          issueCount: inputs.length,
          truncated,
        };
      } catch (err) {
        return { ...base, error: errorMessage(err) };
      }
    }),
  );

  return { sources: results, fetchedAt: now };
}

function errorMessage(err: unknown): string {
  if (err instanceof JiraError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
