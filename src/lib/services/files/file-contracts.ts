import { z } from "zod";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FIELD_FILES = 10;
export const fileMetadataSchema = z.object({ id: z.string(), name: z.string(), size: z.number().int().nonnegative(), uploadedAt: z.string().datetime() });
export type FileMetadata = z.infer<typeof fileMetadataSchema>;
export const fileUploadInputSchema = z.object({ entity: z.enum(["company", "contact", "deal", "lead", "product"]), recordId: z.string().min(1).max(100), fieldId: z.string().min(1).max(100), draftId: z.string().uuid().optional() }).refine(input => !input.draftId || input.draftId === input.recordId, { message: "Draft and record identifiers must match", path: ["draftId"] });
export type FileUploadInput = z.infer<typeof fileUploadInputSchema>;
