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
  revalidatePath(`/resolution-time/${id}`);
  revalidatePath(`/resolution-time/${id}/edit`);
  revalidatePath("/resolution-time", "layout");
  return { id };
}

export async function deleteResolutionDashboard(id: string) {
  applyDeleteResolutionDashboard(id);
  revalidatePath("/resolution-time", "layout");
}

export async function setResolutionFavorite(id: string, favorite: boolean) {
  applySetResolutionFavorite(id, favorite);
  revalidatePath("/resolution-time", "layout");
}
