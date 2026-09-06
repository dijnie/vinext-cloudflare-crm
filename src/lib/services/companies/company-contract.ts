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

export const companyListInputSchema = listContract([
  "name",
  "domain",
  "industry",
  "createdAt",
  "lastActivityAt",
  "archivedAt",
] as const)
  .extend({
    owner: z.array(membershipIdSchema).max(100).default([]),
    industry: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  })
  .strict();

const nullableText = z.string().trim().max(2_000).nullable();
const optionalNullableText = nullableText.optional();

export const companyCreateInputSchema = z
  .object({
    ...recordFieldsShape,
    name: z.string().trim().min(1).max(200),
    domain: z.string().trim().max(255).optional(),
    ownerMembershipId: membershipIdSchema.nullable().optional(),
  })
  .strict();

export const companyUpdateInputSchema = z
  .object({
    action: z.literal("update"),
    data: z
      .object({
        ...recordFieldsShape,
        name: z.string().trim().min(1).max(200).optional(),
        domain: optionalNullableText,
        website: optionalNullableText,
        description: optionalNullableText,
        industry: optionalNullableText,
        city: optionalNullableText,
        countryCode: z
          .string()
          .trim()
          .length(2)
          .toUpperCase()
          .nullable()
          .optional(),
        phone: optionalNullableText,
        email: z.email().nullable().optional(),
        ownerMembershipId: membershipIdSchema.nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const companyMutationInputSchema = z.discriminatedUnion("action", [
  companyUpdateInputSchema,
  z.object({ action: z.literal("archive") }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
]);

export const companyBulkInputSchema = bulkArchiveInputSchema;
export const companyIdSchema = stableIdSchema;
export const companyWriteOutputSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
  domain: z.string().nullable(),
});
export const companyArchiveOutputSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
  archivedAt: nullableIsoDateTimeSchema,
});
export const companyMutationOutputSchema = z.union([
  companyWriteOutputSchema,
  companyArchiveOutputSchema,
]);
const companyListRowOutputSchema = z.object({
  fields: fieldValuesSchema.default({}),
  id: stableIdSchema,
  name: z.string(),
  domain: z.string().nullable(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  ownerMembershipId: membershipIdSchema.nullable(),
  owner: ownerReferenceSchema.nullable(),
  lastActivityAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  contactCount: z.number().int().nonnegative(),
  openDealCount: z.number().int().nonnegative(),
});
export const companyListOutputSchema = z.object({
  customFields: z.array(fieldDefinitionSchema),
  fieldFacets: facetOutputSchema,
  fieldUserLabels: z.record(z.string(), z.string()),
  fieldFileLabels: z.record(z.string(), z.string()),
  fieldCustomerLabels: z.record(z.string(), z.string()),
  facets: facetOutputSchema,
  total: z.number().int().nonnegative(),
  rows: z.array(companyListRowOutputSchema),
});
export const companyDetailOutputSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
  domain: z.string().nullable(),
  website: z.string().nullable(),
  description: z.string().nullable(),
  industry: z.string().nullable(),
  city: z.string().nullable(),
  countryCode: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  ownerMembershipId: membershipIdSchema.nullable(),
  owner: ownerReferenceSchema.nullable(),
  lastActivityAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  contacts: z.array(
    z.object({
      id: stableIdSchema,
      firstName: z.string(),
      lastName: z.string().nullable(),
      email: z.string().nullable(),
      title: z.string().nullable(),
    }),
  ),
  deals: z.array(
    z.object({
      id: stableIdSchema,
      name: z.string(),
      stageId: z.string(),
      amountMinor: z.number().int().nullable(),
      currency: z.string(),
      ownerMembershipId: membershipIdSchema.nullable(),
      archivedAt: nullableIsoDateTimeSchema,
    }),
  ),
});
export { bulkResultSchema as companyBulkOutputSchema };
export type CompanyListInput = z.infer<typeof companyListInputSchema>;
export type CompanyCreateInput = z.infer<typeof companyCreateInputSchema>;
export type CompanyUpdateData = z.infer<
  typeof companyUpdateInputSchema
>["data"];
