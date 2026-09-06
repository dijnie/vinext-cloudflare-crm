import { z } from "zod";

export const DEAL_STAGE_IDS = [
  "demo-booked",
  "qualified-to-buy",
  "unqualified-to-buy",
  "decision-maker-bought-in",
  "contract-sent",
  "closed-won",
  "closed-lost",
] as const;
export const dealStageSchema = z.union([z.enum(DEAL_STAGE_IDS), z.uuid()]);
export const dealStageClosedStateSchema = z.enum(["open", "won", "lost"]);
const labelSchema = z.string().trim().min(1).max(100);
export const dealStageOutputSchema = z.object({
  id: dealStageSchema,
  label: labelSchema.nullable(),
  labelKey: z.string(),
  closedState: dealStageClosedStateSchema,
  position: z.number().int(),
  archivedAt: z.iso.datetime().nullable(),
});
export const dealStageCatalogSchema = z.object({
  revision: z.number().int().nonnegative(),
  canManage: z.boolean(),
  defaultStageId: z.literal("demo-booked"),
  stages: z.array(dealStageOutputSchema),
});
const revision = z.number().int().nonnegative();
export const dealStageMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), revision, label: labelSchema, closedState: dealStageClosedStateSchema }).strict(),
  z.object({ action: z.literal("relabel"), revision, id: dealStageSchema, label: labelSchema.nullable() }).strict(),
  z.object({ action: z.literal("reorder"), revision, id: dealStageSchema, beforeId: dealStageSchema.nullable() }).strict(),
  z.object({ action: z.literal("archive"), revision, id: dealStageSchema }).strict(),
  z.object({ action: z.literal("restore"), revision, id: dealStageSchema }).strict(),
]);
export type DealStage = z.infer<typeof dealStageOutputSchema>;
export type DealStageCatalog = z.infer<typeof dealStageCatalogSchema>;
export type DealStageMutation = z.infer<typeof dealStageMutationSchema>;
export const stageMutationSchema = dealStageMutationSchema;
export type StageMutation = DealStageMutation;
