import { z } from "zod";

import { HttpError } from "@/lib/http/http-errors";
import { customFieldSortSchema } from "@/lib/services/custom-fields/field-sort-contracts";

export const DEFAULT_PAGE_SIZE = 25;
export const facetOutputSchema = z.record(z.string(), z.array(z.object({ value: z.string(), label: z.string(), count: z.number().int().nonnegative() })));
export const MAX_PAGE_SIZE = 100;
export const MAX_BULK_IDS = 100;
export const customFieldFiltersSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), z.array(z.string().min(1).max(255)).max(100)).refine(value => Object.keys(value).length <= 20);
const customFieldQuerySchema = z.preprocess(value => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}, customFieldFiltersSchema).default({});

export const stableIdSchema = z.uuid();
export const membershipIdSchema = z.string().trim().min(1).max(255);
export const isoDateTimeSchema = z.iso.datetime();
export const nullableIsoDateTimeSchema = isoDateTimeSchema.nullable();
export const ownerReferenceSchema = z
  .object({
    membershipId: membershipIdSchema,
    name: z.string().nullable(),
    email: z.email().nullable(),
  })
  .strict();

const archivedQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export function listContract<TSort extends readonly [string, ...string[]]>(
  sortValues: TSort,
) {
  return z.object({
    fields: customFieldQuerySchema,
    q: z.string().trim().max(200).default(""),
    sort: z.union([z.enum(sortValues), customFieldSortSchema]).optional(),
    dir: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE),
    archived: archivedQuerySchema.default(false),
  });
}

export const bulkIdsSchema = z
  .array(stableIdSchema)
  .min(1)
  .max(MAX_BULK_IDS)
  .transform((ids) => [...new Set(ids)]);

export const bulkArchiveInputSchema = z
  .object({
    action: z.enum(["bulk-archive", "bulk-restore"]),
    ids: bulkIdsSchema,
  })
  .strict();

export const bulkResultSchema = z.object({
  requested: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export function parseSearchParams<T>(
  request: Request,
  schema: z.ZodType<T>,
  arrayKeys: readonly string[] = [],
): T {
  const url = new URL(request.url);
  const input: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    input[key] = arrayKeys.includes(key)
      ? url.searchParams
          .getAll(key)
          .flatMap((value) => ["industry", "title"].includes(key) ? [value] : value.split(","))
          .filter(Boolean)
      : (url.searchParams.get(key) ?? "");
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "validation_failed", "Query input is invalid");
  return parsed.data;
}

export function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
