import { z } from "zod";
import { fieldDefinitionSchema, fieldEntitySchema } from "../custom-fields/field-contracts";

export const layoutSurfaceSchema = z.enum(["create", "edit", "detail"]);
export type LayoutSurface = z.infer<typeof layoutSurfaceSchema>;
export const layoutEntrySchema = z.object({ key: z.string().min(1).max(100), kind: z.enum(["builtin", "custom"]), visible: z.boolean() }).strict();
export type LayoutEntry = z.infer<typeof layoutEntrySchema>;
export const layoutFieldSchema = layoutEntrySchema.extend({ required: z.boolean(), readOnly: z.boolean(), surfaces: z.array(layoutSurfaceSchema), label: z.string().optional() });
export type LayoutField = z.infer<typeof layoutFieldSchema>;
export const layoutQuerySchema = z.object({ entity: fieldEntitySchema }).strict();
export const layoutUpdateSchema = layoutQuerySchema.extend({ revision: z.number().int().nonnegative(), fields: z.array(layoutEntrySchema).max(500) }).strict();
export type LayoutUpdate = z.infer<typeof layoutUpdateSchema>;
export const layoutSettingsSchema = layoutQuerySchema.extend({ revision: z.number().int().nonnegative(), canManage: z.boolean(), configured: z.boolean(), fields: z.array(layoutFieldSchema), definitions: z.array(fieldDefinitionSchema) });
export type LayoutSettings = z.infer<typeof layoutSettingsSchema>;
export function layoutIdentity(entry: Pick<LayoutEntry, "kind" | "key">) { return `${entry.kind}:${entry.key}`; }
