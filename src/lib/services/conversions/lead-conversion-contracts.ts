import { z } from "zod";
import { contactCreateInputSchema } from "../contacts/contact-contract";
import { fieldDefinitionSchema } from "../custom-fields/field-contracts";

export const mappingIdentitySchema = z.string().regex(/^(?:builtin:[a-zA-Z][a-zA-Z0-9]*|custom:[0-9a-f-]{36})$/);
export const leadMappingPairSchema = z.object({ source: mappingIdentitySchema, target: mappingIdentitySchema, options: z.record(z.uuid(), z.uuid()).optional() }).strict();
export const leadMappingUpdateSchema = z.object({ revision: z.number().int().nonnegative(), mappings: z.array(leadMappingPairSchema).max(100), autoOrder: z.literal(false).default(false), autoDeal: z.literal(false).default(false) }).strict();
export const leadMappingOutputSchema = leadMappingUpdateSchema.extend({ canManage: z.boolean(), leadFieldRevision: z.number().int(), contactFieldRevision: z.number().int(), leadFields: z.array(fieldDefinitionSchema), contactFields: z.array(fieldDefinitionSchema) });
export const leadConversionRequestSchema = z.object({
  operationKey: z.uuid(), expectedLeadRevision: z.number().int().nonnegative(), expectedMappingRevision: z.number().int().nonnegative(), expectedLeadValueRevision: z.number().int().nonnegative(),
  expectedLeadFieldRevision: z.number().int().nonnegative().optional(), expectedContactFieldRevision: z.number().int().nonnegative().optional(),
  target: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("create"), contact: contactCreateInputSchema, draftId: z.uuid().optional() }).strict(),
    z.object({ mode: z.literal("link"), contactId: z.uuid() }).strict(),
  ]),
}).strict();
export const leadConversionResultSchema = z.object({ operationKey: z.uuid(), leadId: z.uuid(), contactId: z.uuid(), mode: z.enum(["create", "link"]), convertedAt: z.iso.datetime() });
export const leadConversionPreviewInputSchema = z.object({ contact: contactCreateInputSchema.partial().optional() }).strict();
export const leadConversionPreviewSchema = z.object({
  leadRevision: z.number().int(), mappingRevision: z.number().int(), leadValueRevision: z.number().int(), leadFieldRevision: z.number().int(), contactFieldRevision: z.number().int(), calendarRevision: z.number().int(),
  proposedContact: z.record(z.string(), z.unknown()), candidates: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), reasons: z.array(z.enum(["email", "phone"])) })),
  errors: z.array(z.object({ field: z.string(), message: z.string() })), conversion: leadConversionResultSchema.nullable(),
});
export type LeadMappingPair = z.infer<typeof leadMappingPairSchema>;
export type LeadMappingUpdate = z.infer<typeof leadMappingUpdateSchema>;
export type LeadConversionRequest = z.infer<typeof leadConversionRequestSchema>;
export type LeadConversionResult = z.infer<typeof leadConversionResultSchema>;
export type LeadConversionPreviewInput = z.infer<typeof leadConversionPreviewInputSchema>;
