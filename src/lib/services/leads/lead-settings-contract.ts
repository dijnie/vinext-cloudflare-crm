import { z } from "zod";
const id = z.string().trim().min(1).max(100);
const label = z.string().trim().min(1).max(100);
const revision = z.number().int().nonnegative();
const kind = z.enum(["source", "status"]);
const row = z.object({ id, label: label.nullable(), labelKey: z.string(), position: z.number().int(), archivedAt: z.iso.datetime().nullable() });
export const leadSettingsOutputSchema = z.object({ revision, canManage: z.boolean(), defaultSourceId: z.literal("manual"), defaultStatusId: z.literal("new"), sources: z.array(row), statuses: z.array(row.extend({ meaning: z.enum(["working", "rejected", "converted"]), requiresReason: z.boolean() })) });
export const leadSettingsMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), revision, kind, label, meaning: z.enum(["working", "rejected"]).optional(), requiresReason: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("relabel"), revision, kind, id, label: label.nullable() }).strict(),
  z.object({ action: z.literal("reorder"), revision, kind, id, beforeId: id.nullable() }).strict(),
  z.object({ action: z.literal("archive"), revision, kind, id }).strict(),
  z.object({ action: z.literal("restore"), revision, kind, id }).strict(),
  z.object({ action: z.literal("reason"), revision, kind: z.literal("status"), id, requiresReason: z.boolean() }).strict(),
]);
export type LeadSettings = z.infer<typeof leadSettingsOutputSchema>;
export type LeadSettingsMutation = z.infer<typeof leadSettingsMutationSchema>;
