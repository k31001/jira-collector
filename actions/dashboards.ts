"use server";

import { revalidatePath } from "next/cache";
import {
  applyCloneDashboard,
  applyCreateDashboard,
  applyDeleteDashboard,
  applyDeleteNotesForDashboard,
  applySetFavorite,
  applyUpdateDashboard,
  type DashboardInput,
  type DashboardUpdate,
} from "@/lib/db/dashboard-mutations";

export async function createDashboard(input: DashboardInput) {
  const result = applyCreateDashboard(input);
  revalidatePath("/dashboards", "layout");
  return result;
}

export async function updateDashboard(id: string, input: DashboardUpdate) {
  applyUpdateDashboard(id, input);
  revalidatePath(`/dashboards/${id}`);
  revalidatePath(`/dashboards/${id}/edit`);
  revalidatePath("/dashboards", "layout");
  return { id };
}

export async function deleteDashboard(id: string) {
  applyDeleteDashboard(id);
  revalidatePath("/dashboards", "layout");
}

export async function cloneDashboard(id: string) {
  const result = applyCloneDashboard(id);
  revalidatePath("/dashboards", "layout");
  return result;
}

export async function setFavorite(id: string, favorite: boolean) {
  applySetFavorite(id, favorite);
  revalidatePath("/dashboards", "layout");
}

export async function deleteNotesForDashboard(id: string) {
  applyDeleteNotesForDashboard(id);
  revalidatePath(`/dashboards/${id}`);
}
