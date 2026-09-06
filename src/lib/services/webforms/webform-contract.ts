import { z } from "zod";

const mappingSchema=z.record(z.string().trim().min(1).max(80),z.enum(["firstName","lastName","email","phone","title","description","subject","priority","category"]));
export const webformCreateSchema=z.object({name:z.string().trim().min(1).max(120),slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),entity:z.enum(["lead","ticket"]),mode:z.enum(["public","signed_system"]),source:z.string().trim().min(1).max(120),mapping:mappingSchema,allowMissingRequired:z.boolean().default(false),rateLimitHour:z.number().int().min(1).max(10_000).default(60)}).strict();
export const webformUpdateSchema=webformCreateSchema.extend({id:z.string().uuid(),expectedRevision:z.number().int().min(0),active:z.boolean()}).strict();
export const webformSubmissionSchema=z.record(z.string().trim().min(1).max(80),z.union([z.string().max(10_000),z.number(),z.boolean(),z.null()])).refine(value=>Object.keys(value).length<=50);
export type WebformCreate=z.infer<typeof webformCreateSchema>;
export type WebformUpdate=z.infer<typeof webformUpdateSchema>;

