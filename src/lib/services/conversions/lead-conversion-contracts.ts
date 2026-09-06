import { z } from "zod";
import { contactCreateInputSchema } from "../contacts/contact-contract";
import { fieldDefinitionSchema } from "../custom-fields/field-contracts";
import { orderCreateInputSchema, orderPreviewOutputSchema } from "../orders/order-contract";
import { dealCreateInputSchema } from "../deals/deal-contract";

export const mappingIdentitySchema = z.string().regex(/^(?:builtin:[a-zA-Z][a-zA-Z0-9]*|custom:[0-9a-f-]{36})$/);
export const leadMappingPairSchema = z.object({ source: mappingIdentitySchema, target: mappingIdentitySchema, options: z.record(z.uuid(), z.uuid()).optional() }).strict();
export const leadMappingUpdateSchema = z.object({ revision: z.number().int().nonnegative(), mappings: z.array(leadMappingPairSchema).max(100), autoOrder: z.boolean().default(false), autoDeal: z.boolean().default(false) }).strict();
export const leadMappingOutputSchema = leadMappingUpdateSchema.extend({ canManage: z.boolean(), leadFieldRevision: z.number().int(), contactFieldRevision: z.number().int(), leadFields: z.array(fieldDefinitionSchema), contactFields: z.array(fieldDefinitionSchema) });
export const automaticOrderInputSchema = orderCreateInputSchema.omit({ contactId: true, leadId: true }).extend({ draftId: z.uuid().optional() }).strict();
export const automaticDealInputSchema = dealCreateInputSchema.extend({ draftId: z.uuid().optional() }).strict();
export const leadConversionRequestSchema = z.object({
  operationKey: z.uuid(), expectedLeadRevision: z.number().int().nonnegative(), expectedMappingRevision: z.number().int().nonnegative(), expectedLeadValueRevision: z.number().int().nonnegative(),
  expectedLeadFieldRevision: z.number().int().nonnegative().optional(), expectedContactFieldRevision: z.number().int().nonnegative().optional(),
  target: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("create"), contact: contactCreateInputSchema, draftId: z.uuid().optional() }).strict(),
    z.object({ mode: z.literal("link"), contactId: z.uuid() }).strict(),
  ]),
  order: automaticOrderInputSchema.optional(),
  deal: automaticDealInputSchema.optional(),
}).strict();
export const leadConversionResultSchema = z.object({ operationKey: z.uuid(), leadId: z.uuid(), contactId: z.uuid(), dealId: z.uuid().nullable().default(null), orderId: z.uuid().nullable().default(null), mode: z.enum(["create", "link"]), convertedAt: z.iso.datetime() });
export const leadConversionPreviewInputSchema = z.object({ contact: contactCreateInputSchema.partial().optional(), deal: automaticDealInputSchema.optional(), order: automaticOrderInputSchema.optional() }).strict();
export const leadConversionPreviewSchema = z.object({
  leadRevision: z.number().int(), mappingRevision: z.number().int(), leadValueRevision: z.number().int(), leadFieldRevision: z.number().int(), contactFieldRevision: z.number().int(), calendarRevision: z.number().int(),
  proposedContact: z.record(z.string(), z.unknown()), candidates: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), reasons: z.array(z.enum(["email", "phone"])) })),
  autoOrder: z.boolean(), autoDeal: z.boolean(), orderPreview: orderPreviewOutputSchema.nullable(), errors: z.array(z.object({ field: z.string(), message: z.string() })), conversion: leadConversionResultSchema.nullable(),
});
export type LeadMappingPair = z.infer<typeof leadMappingPairSchema>;
export type LeadMappingUpdate = z.infer<typeof leadMappingUpdateSchema>;
export type LeadConversionRequest = z.infer<typeof leadConversionRequestSchema>;
export type LeadConversionResult = z.infer<typeof leadConversionResultSchema>;
export type LeadConversionPreviewInput = z.infer<typeof leadConversionPreviewInputSchema>;
