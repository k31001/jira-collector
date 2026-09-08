"use server";

import { revalidatePath } from "next/cache";
import {
  applyCreateResolutionDashboard,
  applyDeleteResolutionDashboard,
  applySetResolutionFavorite,
  applyUpdateResolutionDashboard,
  type ResolutionDashboardInput,
  type ResolutionDashboardUpdate,
} from "@/lib/db/resolution-mutations";
import { invalidateResolutionIssuesCache } from "@/lib/resolution-issues-cache";

export async function createResolutionDashboard(
  input: ResolutionDashboardInput,
) {
  const result = applyCreateResolutionDashboard(input);
  revalidatePath("/resolution-time", "layout");
  return result;
}

export async function updateResolutionDashboard(
  id: string,
  input: ResolutionDashboardUpdate,
) {
  applyUpdateResolutionDashboard(id, input);
  // The issue payload is cached per dashboard for its refresh interval; a
  // changed JQL set must not be served from the old one. View-level settings
  // (window, bucket) don't affect the payload, so they leave the cache alone.
  if (input.sources !== undefined) invalidateResolutionIssuesCache(id);
  revalidatePath(`/resolution-time/${id}`);
  revalidatePath(`/resolution-time/${id}/edit`);
  revalidatePath("/resolution-time", "layout");
  return { id };
}

export async function deleteResolutionDashboard(id: string) {
  applyDeleteResolutionDashboard(id);
  invalidateResolutionIssuesCache(id);
  revalidatePath("/resolution-time", "layout");
}

export async function setResolutionFavorite(id: string, favorite: boolean) {
  applySetResolutionFavorite(id, favorite);
  revalidatePath("/resolution-time", "layout");
}
