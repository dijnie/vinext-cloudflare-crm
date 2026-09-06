import { recordFieldsShape } from "../shared/record-fields-contract";
import { z } from "zod";
import { fieldDefinitionSchema, fieldValuesSchema } from "@/lib/services/custom-fields/field-contracts";

import {
  bulkArchiveInputSchema,
  bulkResultSchema,
  facetOutputSchema,
  isoDateTimeSchema,
  listContract,
  membershipIdSchema,
  nullableIsoDateTimeSchema,
  ownerReferenceSchema,
  stableIdSchema,
} from "../../listing/list-contract";

export const leadListInputSchema = listContract([
  "firstName",
  "lastName",
  "email",
  "title",
  "createdAt",
  "lastActivityAt",
  "archivedAt",
] as const)
  .extend({
    owner: z.array(membershipIdSchema).max(100).default([]),
    company: z.array(stableIdSchema).max(100).default([]),
    source: z.array(z.string().min(1).max(100)).max(100).default([]),
    status: z.array(z.string().min(1).max(100)).max(100).default([]),
    collaborator: z.array(membershipIdSchema).max(100).default([]),
  })
  .strict();

export const leadChoiceIdSchema = z.string().trim().min(1).max(100);
const nullableText = z.string().trim().max(2_000).nullable();

export const leadCreateInputSchema = z
  .object({
    ...recordFieldsShape,
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().max(120).optional(),
    email: z.union([z.email(), z.literal("")]).optional(),
    phone: z.string().trim().max(80).optional(),
    title: z.string().trim().max(160).optional(),
    description: z.string().trim().max(10000).optional(),
    sourceId: leadChoiceIdSchema.optional(),
    statusId: leadChoiceIdSchema.optional(),
    rejectionReason: z.string().trim().max(2000).nullable().optional(),
    collaboratorMembershipIds: z.array(membershipIdSchema).max(100).transform(ids => [...new Set(ids)]).optional(),
    companyId: stableIdSchema.nullable().optional(),
    ownerMembershipId: membershipIdSchema.nullable().optional(),
  })
  .strict();

export const leadUpdateInputSchema = z
  .object({
    action: z.literal("update"),
    data: z
      .object({
        ...recordFieldsShape,
        expectedRevision: z.number().int().nonnegative(),
        description: z.string().trim().max(10000).nullable().optional(),
        sourceId: leadChoiceIdSchema.optional(),
        statusId: leadChoiceIdSchema.optional(),
        rejectionReason: z.string().trim().max(2000).nullable().optional(),
        collaboratorMembershipIds: z.array(membershipIdSchema).max(100).transform(ids => [...new Set(ids)]).optional(),
        firstName: z.string().trim().min(1).max(120).optional(),
        lastName: nullableText.optional(),
        email: z.union([z.email(), z.literal(""), z.null()]).optional(),
        phone: nullableText.optional(),
        title: nullableText.optional(),
        companyId: stableIdSchema.nullable().optional(),
        ownerMembershipId: membershipIdSchema.nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const leadMutationInputSchema = z.discriminatedUnion("action", [
  leadUpdateInputSchema,
  z.object({ action: z.literal("archive") }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
]);

export const leadBulkInputSchema = bulkArchiveInputSchema;
export const leadIdSchema = stableIdSchema;
const companyReferenceSchema = z.object({
  id: stableIdSchema,
  name: z.string().nullable(),
  domain: z.string().nullable(),
});
export const leadWriteOutputSchema = z.object({
  id: stableIdSchema,
  firstName: z.string(),
  lastName: z.string().nullable(),
});
export const leadArchiveOutputSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
  archivedAt: nullableIsoDateTimeSchema,
});
export const leadMutationOutputSchema = z.union([
  leadWriteOutputSchema,
  leadArchiveOutputSchema,
]);
const leadListRowOutputSchema = z.object({
  fields: fieldValuesSchema.default({}),
  id: stableIdSchema,
  firstName: z.string(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  sourceId: leadChoiceIdSchema,
  sourceLabel: z.string().nullable(),
  sourceLabelKey: z.string(),
  statusId: leadChoiceIdSchema,
  statusLabel: z.string().nullable(),
  statusLabelKey: z.string(),
  statusMeaning: z.enum(["working", "rejected", "converted"]),
  rejectionReason: z.string().nullable(),
  collaboratorMembershipIds: z.array(membershipIdSchema),
  collaboratorLabels: z.record(z.string(), z.string()),
  creatorUserId: z.string(),
  revision: z.number().int().nonnegative(),
  convertedAt: nullableIsoDateTimeSchema,
  convertedContactId: stableIdSchema.nullable(),
  companyId: stableIdSchema.nullable(),
  company: companyReferenceSchema.nullable(),
  ownerMembershipId: membershipIdSchema.nullable(),
  owner: ownerReferenceSchema.nullable(),
  lastActivityAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const leadListOutputSchema = z.object({
  customFields: z.array(fieldDefinitionSchema),
  fieldFacets: facetOutputSchema,
  fieldUserLabels: z.record(z.string(), z.string()),
  fieldFileLabels: z.record(z.string(), z.string()),
  fieldCustomerLabels: z.record(z.string(), z.string()),
  facets: facetOutputSchema,
  total: z.number().int().nonnegative(),
  rows: z.array(leadListRowOutputSchema),
});
export const leadDetailOutputSchema = leadListRowOutputSchema;
export { bulkResultSchema as leadBulkOutputSchema };
export type LeadListInput = z.infer<typeof leadListInputSchema>;
export type LeadCreateInput = z.infer<typeof leadCreateInputSchema>;
export type LeadUpdateData = z.infer<
  typeof leadUpdateInputSchema
>["data"];
