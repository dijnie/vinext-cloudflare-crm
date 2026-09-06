import { z } from "zod";
import { companyListInputSchema } from "../services/companies/company-contract";
import { contactListInputSchema } from "../services/contacts/contact-contract";
import { dealListInputSchema } from "../services/deals/deal-contract";
import { productListInputSchema } from "../services/catalog/product-contract";
import { leadListInputSchema } from "../services/leads/lead-contract";
import { stableIdSchema } from "./list-contract";

export const entityTypeSchema = z.enum(["company", "contact", "deal", "lead", "product"]);
export type EntityType = z.infer<typeof entityTypeSchema>;
export const entityPaths = { company: "companies", contact: "contacts", deal: "deals", lead: "leads", product: "products" } as const;
export const listSchemas = { company: companyListInputSchema, contact: contactListInputSchema, deal: dealListInputSchema, lead: leadListInputSchema, product: productListInputSchema };
export const entityColumns = {
  product: ["name", "kind", "sku", "priceMinor", "currency", "category", "owner", "createdAt"],
  lead: ["firstName", "lastName", "email", "phone", "source", "status", "company", "owner", "createdAt"],
  company: ["name", "domain", "industry", "owner", "createdAt"],
  contact: ["firstName", "lastName", "email", "title", "company", "owner", "createdAt"],
  deal: ["name", "company", "owner", "stage", "amount", "currency", "expectedCloseAt", "createdAt"],
} as const;
const navigationSchema = z.object({
  recordType: entityTypeSchema.optional(), recordId: stableIdSchema.optional(),
  tab: z.enum(["details", "activities", "fields"]).default("details"),
  columns: z.array(z.string()).optional(), view: stableIdSchema.optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.recordType) !== Boolean(value.recordId)) ctx.addIssue({ code: "custom", message: "Record type and ID must be paired" });
});
const navigationKeys = ["recordType", "recordId", "tab", "columns", "view"];
const arrayKeys = ["owner", "industry", "company", "title", "stage", "source", "status", "collaborator", "kind", "category"];
export function parseListState(entity: EntityType, search: URLSearchParams) {
  const query: Record<string, unknown> = {};
  const navigation: Record<string, unknown> = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    if (!arrayKeys.includes(key) && key !== "columns" && values.length > 1) throw new Error("Duplicate query parameter");
    const value = arrayKeys.includes(key) || key === "columns" ? values.flatMap(v => ["industry", "title"].includes(key) ? [v] : v.split(",")).filter(Boolean) : values[0];
    (navigationKeys.includes(key) ? navigation : query)[key] = value;
  }
  const list = listSchemas[entity].parse(query);
  const sheet = navigationSchema.parse(navigation);
  if (sheet.columns?.some(key => !(entityColumns[entity] as readonly string[]).includes(key) && !/^field:[a-z][a-z0-9_]{0,59}$/.test(key))) throw new Error("Invalid column");
  return { list, ...sheet };
}
export function listApiSearch(search: URLSearchParams): string {
  const result = new URLSearchParams(search);
  navigationKeys.forEach(key => result.delete(key));
  return result.toString();
}
export function changeListState(search: URLSearchParams, changes: Record<string, string | string[] | null>): string {
  const next = new URLSearchParams(search);
  for (const [key, value] of Object.entries(changes)) {
    if (Array.isArray(value)) { next.delete(key); value.forEach(item => next.append(key, item)); }
    else if (value === null || value === "") next.delete(key); else next.set(key, value);
  }
  if (Object.keys(changes).some(key => ["q", "sort", "dir", "archived", "owner", "industry", "company", "title", "stage", "source", "status", "collaborator", "kind", "category", "fields", "criteria", "view", "pageSize"].includes(key))) next.delete("page");
  return next.toString();
}
