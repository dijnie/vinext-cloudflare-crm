import { z } from "zod";
import { fieldConfigSchema, fieldTypeSchema } from "./field-contracts";

export const conversionInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), type: fieldTypeSchema, config: fieldConfigSchema.default({}) }).strict(),
  z.object({ action: z.literal("apply"), token: z.string().uuid() }).strict(),
]);
export const conversionPreviewSchema = z.object({
  token: z.string().nullable(), total: z.number(), convertible: z.number(), rejected: z.number(),
  reasons: z.array(z.string()), examples: z.array(z.object({ recordId: z.string(), reason: z.string() })),
});
export type ConversionPreview = z.infer<typeof conversionPreviewSchema>;
