import { company, contact, deal, lead, product, salesOrder } from "./schema";
import type { FieldEntity } from "../services/custom-fields/field-contracts";

export const recordTables = { company, contact, deal, lead, product, order: salesOrder } satisfies Record<FieldEntity, unknown>;
export const recordAnchorNames = { company: "company_id", contact: "contact_id", deal: "deal_id", lead: "lead_id", product: "product_id", order: "order_id" } as const satisfies Record<FieldEntity, string>;
export const recordAnchorKeys = { company: "companyId", contact: "contactId", deal: "dealId", lead: "leadId", product: "productId", order: "orderId" } as const satisfies Record<FieldEntity, string>;
