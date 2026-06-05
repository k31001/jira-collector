"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { ratioConfigs } from "@/lib/db/schema";
import { applyReplaceRatioDashboards } from "@/lib/db/resolution-mutations";
import { parseJql } from "@/lib/jql-eval";

const basisEnum = z.enum(["created", "resolved"]);

const createInput = z.object({
  name: z.string().trim().min(1, "이름이 필요합니다").max(60),
  numeratorJql: z.string().trim().min(1, "분자 JQL이 필요합니다").max(500),
  denominatorJql: z.string().trim().max(500).optional().default(""),
  basis: basisEnum.optional().default("created"),
  /** Resolution dashboards this ratio appears on. */
  dashboardIds: z.array(z.string()).optional().default([]),
});

const updateInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  numeratorJql: z.string().trim().min(1).max(500).optional(),
  denominatorJql: z.string().trim().max(500).optional(),
  basis: basisEnum.optional(),
  displayOrder: z.number().int().optional(),
  // `undefined` = leave dashboard attachments untouched; `[]` = detach all.
  dashboardIds: z.array(z.string()).optional(),
});

export type CreateRatioInput = z.infer<typeof createInput>;

function validateJqlOrThrow(jql: string, which: string) {
  if (jql.trim() === "") return; // empty denominator = all issues
  try {
    parseJql(jql);
  } catch (err) {
    throw new Error(
      `${which} JQL 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function createRatioConfig(input: CreateRatioInput) {
  const data = createInput.parse(input);
  validateJqlOrThrow(data.numeratorJql, "분자");
  validateJqlOrThrow(data.denominatorJql, "분모");
  const last = db
    .select({ v: max(ratioConfigs.displayOrder) })
    .from(ratioConfigs)
    .get();
  const id = nanoid();
  db.insert(ratioConfigs)
    .values({
      id,
      name: data.name,
      numeratorJql: data.numeratorJql,
      denominatorJql: data.denominatorJql,
      basis: data.basis,
      displayOrder: (last?.v ?? -1) + 1,
    })
    .run();
  applyReplaceRatioDashboards(id, data.dashboardIds);
  revalidatePath("/settings/ratio-analysis");
  revalidatePath("/resolution-time", "layout");
  return { id };
}

export async function updateRatioConfig(
  id: string,
  input: z.infer<typeof updateInput>,
) {
  const data = updateInput.parse(input);
  if (data.numeratorJql !== undefined)
    validateJqlOrThrow(data.numeratorJql, "분자");
  if (data.denominatorJql !== undefined)
    validateJqlOrThrow(data.denominatorJql, "분모");
  const update: Partial<typeof ratioConfigs.$inferInsert> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.numeratorJql !== undefined) update.numeratorJql = data.numeratorJql;
  if (data.denominatorJql !== undefined)
    update.denominatorJql = data.denominatorJql;
  if (data.basis !== undefined) update.basis = data.basis;
  if (data.displayOrder !== undefined) update.displayOrder = data.displayOrder;
  if (Object.keys(update).length > 0) {
    update.updatedAt = Math.floor(Date.now() / 1000);
    db.update(ratioConfigs).set(update).where(eq(ratioConfigs.id, id)).run();
  }
  if (data.dashboardIds !== undefined) {
    applyReplaceRatioDashboards(id, data.dashboardIds);
  }
  revalidatePath("/settings/ratio-analysis");
  revalidatePath("/resolution-time", "layout");
}

export async function deleteRatioConfig(id: string) {
  db.delete(ratioConfigs).where(eq(ratioConfigs.id, id)).run();
  revalidatePath("/settings/ratio-analysis");
  revalidatePath("/resolution-time", "layout");
}
