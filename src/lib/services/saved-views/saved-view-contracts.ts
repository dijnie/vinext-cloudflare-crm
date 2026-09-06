import { z } from "zod";
import { entityTypeSchema, parseListState, type EntityType } from "@/lib/listing/list-state";

export const savedViewStateSchema = z.object({ version: z.literal(1), query: z.string().max(12000) }).strict();
export const savedViewCreateSchema = z.object({ entity: entityTypeSchema, name: z.string().trim().min(1).max(120), shared: z.boolean().default(false), state: savedViewStateSchema }).strict();
export const savedViewUpdateSchema = savedViewCreateSchema.omit({ entity: true }).partial().refine(value => Object.keys(value).length > 0);
export const savedViewOutputSchema = savedViewCreateSchema.extend({ id: z.uuid(), mine: z.boolean(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export type SavedView = z.infer<typeof savedViewOutputSchema>;
export type SavedViewState = z.infer<typeof savedViewStateSchema>;

export function validateSavedViewState(entity: EntityType, value: unknown): SavedViewState {
  const state = savedViewStateSchema.parse(value);
  const search = new URLSearchParams(state.query);
  if (["recordType", "recordId", "tab", "view", "page"].some(key => search.has(key))) throw new Error("Saved views cannot contain record navigation or page state");
  parseListState(entity, search);
  search.sort();
  return { version: 1, query: search.toString() };
}

export function captureSavedViewState(entity: EntityType, search: URLSearchParams): SavedViewState {
  const next = new URLSearchParams(search);
  ["recordType", "recordId", "tab", "view", "page"].forEach(key => next.delete(key));
  return validateSavedViewState(entity, { version: 1, query: next.toString() });
}
