import type { CustomStatus, CustomStatusMapping, StatusColor } from "@/lib/db/schema";

const CATEGORY_COLORS: Record<string, string> = {
  new: "#94A3B8",
  undefined: "#94A3B8",
  indeterminate: "#3B82F6",
  done: "#10B981",
};

export type StatusResolution = {
  label: string;
  color: string;
  isCustom: boolean;
  groupedFrom?: string[];
};

export type StatusContext = {
  customStatuses: CustomStatus[];
  customMappings: CustomStatusMapping[];
  statusColors: StatusColor[];
};

export function resolveStatusDisplay(
  rawStatusName: string,
  categoryKey: string | undefined,
  ctx: StatusContext,
): StatusResolution {
  const lower = (rawStatusName || "").toLowerCase();

  for (const cs of ctx.customStatuses) {
    const matches = ctx.customMappings.filter((m) => m.customStatusId === cs.id);
    const hit = matches.find((m) => m.jiraStatusName.toLowerCase() === lower);
    if (hit) {
      return {
        label: cs.name,
        color: cs.color,
        isCustom: true,
        groupedFrom: matches.map((m) => m.jiraStatusName),
      };
    }
  }

  const override = ctx.statusColors.find(
    (c) => c.statusName.toLowerCase() === lower,
  );
  if (override) {
    return { label: rawStatusName, color: override.color, isCustom: false };
  }

  const cat = categoryKey || "undefined";
  return {
    label: rawStatusName || "Unknown",
    color: CATEGORY_COLORS[cat] || "#94A3B8",
    isCustom: false,
  };
}
