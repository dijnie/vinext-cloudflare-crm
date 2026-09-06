import { z } from "zod";

export const draftInputSchema = z.object({ entity: z.enum(["company", "contact", "deal", "lead", "product"]) });
export const draftSchema = draftInputSchema.extend({ id: z.string().uuid(), expiresAt: z.string().datetime() });
export type DraftEntity = z.infer<typeof draftInputSchema>["entity"];
