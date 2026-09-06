import { recordFieldsShape } from "../shared/record-fields-contract";
import { z } from "zod";
import { currencyCodeSchema, dealConversionOutputSchema } from "@/lib/services/currencies/currency-contracts";
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

export const DEAL_STAGE_IDS = [
  "demo-booked",
  "qualified-to-buy",
  "unqualified-to-buy",
  "decision-maker-bought-in",
  "contract-sent",
  "closed-won",
  "closed-lost",
] as const;
export const dealStageSchema = z.enum(DEAL_STAGE_IDS);
const currencySchema = currencyCodeSchema;
const amountSchema = z.number().int().min(0).max(99_999_999_999_999).nullable();

export const dealListInputSchema = listContract([
  "name",
  "stage",
  "amount",
  "expectedCloseAt",
  "createdAt",
  "lastActivityAt",
  "archivedAt",
] as const)
  .extend({
    owner: z.array(membershipIdSchema).max(100).default([]),
    stage: z.array(dealStageSchema).max(DEAL_STAGE_IDS.length).default([]),
    company: z.array(stableIdSchema).max(100).default([]),
  })
  .strict();

export const dealCreateInputSchema = z
  .object({
    ...recordFieldsShape,
    name: z.string().trim().min(1).max(200),
    companyId: stableIdSchema,
    ownerMembershipId: membershipIdSchema,
    stageId: dealStageSchema.default("demo-booked"),
    amountMinor: amountSchema.optional(),
    currency: currencySchema.default("USD"),
    expectedCloseAt: z.iso.datetime().nullable().optional(),
  })
  .strict();

export const dealUpdateInputSchema = z
  .object({
    action: z.literal("update"),
    data: z
      .object({
        ...recordFieldsShape,
        name: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(10_000).nullable().optional(),
        companyId: stableIdSchema.optional(),
        ownerMembershipId: membershipIdSchema.optional(),
        stageId: dealStageSchema.optional(),
        amountMinor: amountSchema.optional(),
        currency: currencySchema.optional(),
        expectedCloseAt: z.iso.datetime().nullable().optional(),
        closedReason: z.string().trim().max(2_000).nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const dealMutationInputSchema = z.discriminatedUnion("action", [
  dealUpdateInputSchema,
  z.object({ action: z.literal("archive") }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
]);

const roleSchema = z.string().trim().max(80).nullable();
export const attachDealContactInputSchema = z
  .object({ contactId: stableIdSchema, role: roleSchema.optional() })
  .strict();
export const updateDealContactInputSchema = z
  .object({ contactId: stableIdSchema, role: roleSchema })
  .strict();
export const detachDealContactInputSchema = z
  .object({ contactId: stableIdSchema })
  .strict();
export const dealBulkInputSchema = bulkArchiveInputSchema;
export const dealIdSchema = stableIdSchema;
const dealCompanyReferenceSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
  domain: z.string().nullable(),
});
const dealListRowOutputSchema = z.object({
  fields: fieldValuesSchema.default({}),
  id: stableIdSchema,
  name: z.string(),
  description: z.string().nullable(),
  companyId: stableIdSchema,
  company: dealCompanyReferenceSchema,
  ownerMembershipId: membershipIdSchema,
  owner: ownerReferenceSchema,
  stageId: dealStageSchema,
  stageLabelKey: z.string(),
  closedState: z.enum(["open", "won", "lost"]),
  amountMinor: z.number().int().nullable(),
  ...dealConversionOutputSchema.shape,
  currency: z.string().length(3),
  expectedCloseAt: nullableIsoDateTimeSchema,
  closedAt: nullableIsoDateTimeSchema,
  closedReason: z.string().nullable(),
  lastActivityAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const dealListOutputSchema = z.object({
  customFields: z.array(fieldDefinitionSchema),
  fieldFacets: facetOutputSchema,
  fieldUserLabels: z.record(z.string(), z.string()),
  fieldFileLabels: z.record(z.string(), z.string()),
  fieldCustomerLabels: z.record(z.string(), z.string()),
  facets: facetOutputSchema,
  total: z.number().int().nonnegative(),
  rows: z.array(dealListRowOutputSchema),
});
export const dealDetailOutputSchema = dealListRowOutputSchema.extend({
  stageChangedAt: isoDateTimeSchema,
  contacts: z.array(
    z.object({
      id: stableIdSchema,
      firstName: z.string(),
      lastName: z.string().nullable(),
      email: z.string().nullable(),
      title: z.string().nullable(),
      role: z.string().nullable(),
    }),
  ),
});
export const dealCreateOutputSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
  companyId: stableIdSchema,
});
export const dealUpdateOutputSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
});
export const dealArchiveOutputSchema = z.object({
  id: stableIdSchema,
  name: z.string(),
  archivedAt: nullableIsoDateTimeSchema,
});
export const dealMutationOutputSchema = z.union([
  dealArchiveOutputSchema,
  dealUpdateOutputSchema,
]);
export const dealContactOutputSchema = z.object({
  dealId: stableIdSchema,
  contactId: stableIdSchema,
  role: z.string().nullable(),
});
export { bulkResultSchema as dealBulkOutputSchema };
export type DealListInput = z.infer<typeof dealListInputSchema>;
export type DealCreateInput = z.infer<typeof dealCreateInputSchema>;
export type DealUpdateData = z.infer<typeof dealUpdateInputSchema>["data"];
