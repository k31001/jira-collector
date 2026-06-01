"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { customFacets, customFacetValues } from "@/lib/db/schema";
import { parseJql } from "@/lib/jql-eval";

/* -------------------------------------------------------------------------- */
/*  Facets                                                                     */
/* -------------------------------------------------------------------------- */

const facetCreateInput = z.object({
  name: z.string().trim().min(1, "이름이 필요합니다").max(60),
});

const facetUpdateInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  displayOrder: z.number().int().optional(),
});

export type CreateFacetInput = z.infer<typeof facetCreateInput>;

export async function createCustomFacet(input: CreateFacetInput) {
  const data = facetCreateInput.parse(input);
  const id = nanoid();
  const last = db
    .select({ v: max(customFacets.displayOrder) })
    .from(customFacets)
    .get();
  const order = (last?.v ?? -1) + 1;
  db.insert(customFacets)
    .values({ id, name: data.name, displayOrder: order })
    .run();
  revalidatePath("/settings/smart-filters");
  revalidatePath("/resolution-time", "layout");
  return { id };
}

export async function updateCustomFacet(
  id: string,
  input: z.infer<typeof facetUpdateInput>,
) {
  const data = facetUpdateInput.parse(input);
  const update: Partial<typeof customFacets.$inferInsert> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.displayOrder !== undefined) update.displayOrder = data.displayOrder;
  if (Object.keys(update).length === 0) return;
  update.updatedAt = Math.floor(Date.now() / 1000);
  db.update(customFacets).set(update).where(eq(customFacets.id, id)).run();
  revalidatePath("/settings/smart-filters");
  revalidatePath("/resolution-time", "layout");
}

export async function deleteCustomFacet(id: string) {
  db.delete(customFacets).where(eq(customFacets.id, id)).run();
  revalidatePath("/settings/smart-filters");
  revalidatePath("/resolution-time", "layout");
}

/* -------------------------------------------------------------------------- */
/*  Facet values                                                               */
/* -------------------------------------------------------------------------- */

const valueCreateInput = z.object({
  facetId: z.string().min(1),
  name: z.string().trim().min(1, "이름이 필요합니다").max(60),
  jql: z.string().trim().min(1, "JQL이 필요합니다").max(500),
});

const valueUpdateInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  jql: z.string().trim().min(1).max(500).optional(),
  displayOrder: z.number().int().optional(),
});

export type CreateFacetValueInput = z.infer<typeof valueCreateInput>;

function validateJqlOrThrow(jql: string) {
  try {
    parseJql(jql);
  } catch (err) {
    throw new Error(
      `JQL 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function createCustomFacetValue(input: CreateFacetValueInput) {
  const data = valueCreateInput.parse(input);
  validateJqlOrThrow(data.jql);
  const last = db
    .select({ v: max(customFacetValues.displayOrder) })
    .from(customFacetValues)
    .where(eq(customFacetValues.facetId, data.facetId))
    .get();
  const order = (last?.v ?? -1) + 1;
  const id = nanoid();
  db.insert(customFacetValues)
    .values({
      id,
      facetId: data.facetId,
      name: data.name,
      jql: data.jql,
      displayOrder: order,
    })
    .run();
  revalidatePath("/settings/smart-filters");
  revalidatePath("/resolution-time", "layout");
  return { id };
}

export async function updateCustomFacetValue(
  id: string,
  input: z.infer<typeof valueUpdateInput>,
) {
  const data = valueUpdateInput.parse(input);
  if (data.jql !== undefined) validateJqlOrThrow(data.jql);
  const update: Partial<typeof customFacetValues.$inferInsert> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.jql !== undefined) update.jql = data.jql;
  if (data.displayOrder !== undefined) update.displayOrder = data.displayOrder;
  if (Object.keys(update).length === 0) return;
  db.update(customFacetValues)
    .set(update)
    .where(eq(customFacetValues.id, id))
    .run();
  revalidatePath("/settings/smart-filters");
  revalidatePath("/resolution-time", "layout");
}

export async function deleteCustomFacetValue(id: string) {
  db.delete(customFacetValues).where(eq(customFacetValues.id, id)).run();
  revalidatePath("/settings/smart-filters");
  revalidatePath("/resolution-time", "layout");
}
