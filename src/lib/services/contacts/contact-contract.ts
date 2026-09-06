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

export const contactListInputSchema = listContract([
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
    title: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  })
  .strict();

const nullableText = z.string().trim().max(2_000).nullable();

export const contactCreateInputSchema = z
  .object({
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().max(120).optional(),
    email: z.union([z.email(), z.literal("")]).optional(),
    phone: z.string().trim().max(80).optional(),
    title: z.string().trim().max(160).optional(),
    companyId: stableIdSchema.nullable().optional(),
    ownerMembershipId: membershipIdSchema.nullable().optional(),
  })
  .strict();

export const contactUpdateInputSchema = z
  .object({
    action: z.literal("update"),
    data: z
      .object({
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

export const contactMutationInputSchema = z.discriminatedUnion("action", [
  contactUpdateInputSchema,
  z.object({ action: z.literal("archive") }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
]);

export const contactBulkInputSchema = bulkArchiveInputSchema;
export const contactIdSchema = stableIdSchema;
const companyReferenceSchema = z.object({
  id: stableIdSchema,
  name: z.string().nullable(),
  domain: z.string().nullable(),
});
export const contactWriteOutputSchema = z.object({
  id: stableIdSchema,
  firstName: z.string(),
  lastName: z.string().nullable(),
});
export const contactArchiveOutputSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
  archivedAt: nullableIsoDateTimeSchema,
});
export const contactMutationOutputSchema = z.union([
  contactWriteOutputSchema,
  contactArchiveOutputSchema,
]);
const contactListRowOutputSchema = z.object({
  fields: fieldValuesSchema.default({}),
  id: stableIdSchema,
  firstName: z.string(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  companyId: stableIdSchema.nullable(),
  company: companyReferenceSchema.nullable(),
  ownerMembershipId: membershipIdSchema.nullable(),
  owner: ownerReferenceSchema.nullable(),
  lastActivityAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const contactListOutputSchema = z.object({
  customFields: z.array(fieldDefinitionSchema),
  fieldFacets: facetOutputSchema,
  fieldUserLabels: z.record(z.string(), z.string()),
  fieldFileLabels: z.record(z.string(), z.string()),
  fieldCustomerLabels: z.record(z.string(), z.string()),
  facets: facetOutputSchema,
  total: z.number().int().nonnegative(),
  rows: z.array(contactListRowOutputSchema),
});
export const contactDetailOutputSchema = contactListRowOutputSchema.extend({
  deals: z.array(
    z.object({
      id: stableIdSchema,
      name: z.string(),
      stageId: z.string(),
      role: z.string().nullable(),
      amountMinor: z.number().int().nullable(),
      currency: z.string(),
      archivedAt: nullableIsoDateTimeSchema,
    }),
  ),
});
export { bulkResultSchema as contactBulkOutputSchema };
export type ContactListInput = z.infer<typeof contactListInputSchema>;
export type ContactCreateInput = z.infer<typeof contactCreateInputSchema>;
export type ContactUpdateData = z.infer<
  typeof contactUpdateInputSchema
>["data"];
