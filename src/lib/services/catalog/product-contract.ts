import { z } from "zod";
import { recordFieldsShape } from "../shared/record-fields-contract";
import { currencyCodeSchema } from "../currencies/currency-contracts";
import { fieldDefinitionSchema, fieldValuesSchema } from "../custom-fields/field-contracts";
import { bulkArchiveInputSchema, bulkResultSchema, facetOutputSchema, listContract, membershipIdSchema, ownerReferenceSchema, stableIdSchema } from "@/lib/listing/list-contract";
export const productKindSchema = z.enum(["product", "service", "package"]);
const revision = z.number().int().nonnegative();
const money = z.number().int().min(0).max(99_999_999_999_999);
const attributes = z.record(z.string().trim().min(1).max(100), z.string().trim().max(500)).refine(value => Object.keys(value).length <= 30);
const variantShape = {
  label: z.string().trim().min(1).max(120),
  sku: z.string().max(100).nullable().optional(),
  priceMinor: money,
  costMinor: money.nullable().optional(),
  currency: currencyCodeSchema.default("USD"),
  durationMinutes: z.number().int().min(1).max(525_600).nullable().optional(),
  attributes: attributes.optional(),
};
export const productVariantCreateInputSchema = z.object(variantShape).strict();
export const productVariantUpdateInputSchema = productVariantCreateInputSchema.partial().extend({ currency: currencyCodeSchema.optional(), expectedRevision: revision }).strict();
export const productVariantMutationInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), data: productVariantUpdateInputSchema }).strict(),
  z.object({ action: z.enum(["archive", "restore"]), expectedRevision: revision }).strict(),
]);
export const productPackageComponentInputSchema = z.object({ componentVariantId: stableIdSchema, quantity: z.number().int().min(1).max(1_000_000) }).strict();
const components = z.array(productPackageComponentInputSchema).max(100).refine(rows => new Set(rows.map(row => row.componentVariantId)).size === rows.length);
const metadata = { name: z.string().trim().min(1).max(200), description: z.string().trim().max(10_000).nullable().optional(), categoryId: stableIdSchema.nullable().optional(), ownerMembershipId: membershipIdSchema.nullable().optional() };
export const productCreateInputSchema = z.object({ ...recordFieldsShape, ...metadata, kind: productKindSchema, initialVariant: productVariantCreateInputSchema, packageComponents: components.optional() }).strict();
export const productUpdateInputSchema = z.object({ action: z.literal("update"), data: z.object({ ...recordFieldsShape, ...z.object(metadata).partial().shape, expectedRevision: revision, packageComponents: components.optional() }).strict() }).strict();
export const productMutationInputSchema = z.discriminatedUnion("action", [productUpdateInputSchema, z.object({ action: z.literal("archive") }).strict(), z.object({ action: z.literal("restore") }).strict()]);
export const productListInputSchema = listContract(["name", "createdAt", "updatedAt", "lastActivityAt", "archivedAt"] as const).extend({ owner: z.array(membershipIdSchema).max(100).default([]), category: z.array(stableIdSchema).max(100).default([]), kind: z.array(productKindSchema).max(3).default([]) }).strict();
export const productIdSchema = stableIdSchema;
export const productBulkInputSchema = bulkArchiveInputSchema;
export const productBulkOutputSchema = bulkResultSchema;
export const productWriteOutputSchema = z.object({ id: stableIdSchema, name: z.string(), revision });
export const productArchiveOutputSchema = z.object({ id: stableIdSchema, name: z.string(), archivedAt: z.iso.datetime().nullable() });
export const productMutationOutputSchema = z.union([productWriteOutputSchema, productArchiveOutputSchema]);
export const productVariantOutputSchema = z.object({ id: stableIdSchema, productId: stableIdSchema, isDefault: z.boolean(), label: z.string(), sku: z.string().nullable(), priceMinor: money, costMinor: money.nullable(), currency: currencyCodeSchema, durationMinutes: z.number().int().nullable(), attributes, revision, archivedAt: z.iso.datetime().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
const row = z.object({ id: stableIdSchema, kind: productKindSchema, name: z.string(), description: z.string().nullable(), categoryId: stableIdSchema.nullable(), categoryLabel: z.string().nullable(), ownerMembershipId: membershipIdSchema.nullable(), owner: ownerReferenceSchema.nullable(), creatorUserId: z.string(), revision, archivedAt: z.iso.datetime().nullable(), lastActivityAt: z.iso.datetime().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), sku: z.string().nullable(), priceMinor: money, costMinor: money.nullable(), currency: currencyCodeSchema, durationMinutes: z.number().int().nullable(), fields: fieldValuesSchema.default({}) });
export const productDetailOutputSchema = row.extend({ variants: z.array(productVariantOutputSchema), packageComponents: z.array(productPackageComponentInputSchema.extend({ productId: stableIdSchema, productName: z.string(), variantLabel: z.string(), archivedAt: z.iso.datetime().nullable(), productArchivedAt: z.iso.datetime().nullable() })) });
export const productListOutputSchema = z.object({ rows: z.array(row), total: z.number().int().nonnegative(), facets: facetOutputSchema, customFields: z.array(fieldDefinitionSchema), fieldFacets: facetOutputSchema, fieldUserLabels: z.record(z.string(), z.string()), fieldFileLabels: z.record(z.string(), z.string()), fieldCustomerLabels: z.record(z.string(), z.string()) });
export type ProductCreateInput = z.infer<typeof productCreateInputSchema>;
export type ProductUpdateData = z.infer<typeof productUpdateInputSchema>["data"];
export type ProductListInput = z.infer<typeof productListInputSchema>;
export type ProductVariantCreateInput = z.infer<typeof productVariantCreateInputSchema>;
export type ProductVariantUpdateInput = z.infer<typeof productVariantUpdateInputSchema>;
export type ProductPackageComponentInput = z.infer<typeof productPackageComponentInputSchema>;
export const productVariantLookupInputSchema = z.object({ q: z.string().trim().max(200).default(""), pageSize: z.coerce.number().int().min(1).max(100).default(30) }).strict();
export const productVariantLookupOutputSchema = z.object({ rows: z.array(productVariantOutputSchema.extend({ productName: z.string(), kind: productKindSchema })) });
