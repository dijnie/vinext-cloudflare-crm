import { z } from "zod";
export const moduleEntitySchema = z.enum(["company", "contact", "deal", "lead"]);
export type ModuleEntity = z.infer<typeof moduleEntitySchema>;
export const moduleSettingSchema = z.object({ entity: moduleEntitySchema, enabled: z.boolean(), revision: z.number().int().nonnegative() });
export const moduleSettingsSchema = z.object({ canManage: z.boolean(), modules: moduleSettingSchema.array() });
export type ModuleSettings = z.infer<typeof moduleSettingsSchema>;
export const moduleUpdateInputSchema = moduleSettingSchema.strict();
export type ModuleUpdateInput = z.infer<typeof moduleUpdateInputSchema>;
