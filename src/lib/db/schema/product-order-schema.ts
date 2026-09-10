import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { company } from "./company-schema";
import { contact } from "./contact-schema";
import { deal } from "./deal-schema";
import { singletonMembership, user } from "./auth-schema";
import { lead } from "./lead-schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const productCategory = sqliteTable(
  "product_category",
  {
    id: text("id").primaryKey().notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull().unique(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    revision: integer("revision").notNull().default(0),
  },
  (table) => [
    check(
      "product_category_label",
      sql`length(trim(${table.label})) between 1 and 120`,
    ),
    check("product_category_revision", sql`${table.revision}>=0`),
  ],
);
export const productCategoryRevision = sqliteTable(
  "product_category_revision",
  {
    id: text("id", { enum: ["categories"] })
      .primaryKey()
      .notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (table) => [
    check("product_category_singleton", sql`${table.id}='categories'`),
    check("product_category_catalog_revision", sql`${table.revision}>=0`),
  ],
);
export const product = sqliteTable(
  "product",
  {
    id: text("id").primaryKey().notNull(),
    kind: text("kind", { enum: ["product", "service", "package"] }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: text("category_id").references(() => productCategory.id, {
      onDelete: "restrict",
    }),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("product_category_idx").on(table.categoryId),
    index("product_owner_idx").on(table.ownerMembershipId),
    index("product_created_idx").on(table.createdAt, table.id),
    check(
      "product_kind",
      sql`${table.kind} in ('product','service','package')`,
    ),
    check("product_name", sql`length(trim(${table.name})) between 1 and 200`),
    check("product_revision", sql`${table.revision}>=0`),
  ],
);
export const productVariant = sqliteTable(
  "product_variant",
  {
    id: text("id").primaryKey().notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "restrict" }),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    sku: text("sku"),
    label: text("label").notNull(),
    priceMinor: integer("price_minor").notNull(),
    costMinor: integer("cost_minor"),
    currency: text("currency").notNull().default("USD"),
    durationMinutes: integer("duration_minutes"),
    attributesJson: text("attributes_json").notNull().default("{}"),
    revision: integer("revision").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_default_variant_unique")
      .on(table.productId)
      .where(sql`${table.isDefault}=1`),
    index("product_variant_product_idx").on(
      table.productId,
      table.archivedAt,
      table.id,
    ),
    check("product_variant_default", sql`${table.isDefault} in (0,1)`),
    check(
      "product_variant_sku",
      sql`${table.sku} is null or length(trim(${table.sku})) between 1 and 100`,
    ),
    check(
      "product_variant_label",
      sql`length(trim(${table.label})) between 1 and 120`,
    ),
    check(
      "product_variant_price",
      sql`typeof(${table.priceMinor})='integer' and ${table.priceMinor} between 0 and 99999999999999`,
    ),
    check(
      "product_variant_cost",
      sql`${table.costMinor} is null or (typeof(${table.costMinor})='integer' and ${table.costMinor} between 0 and 99999999999999)`,
    ),
    check(
      "product_variant_currency",
      sql`${table.currency} in ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND')`,
    ),
    check(
      "product_variant_duration",
      sql`${table.durationMinutes} is null or (typeof(${table.durationMinutes})='integer' and ${table.durationMinutes} between 1 and 1000000)`,
    ),
    check(
      "product_variant_attributes",
      sql`json_valid(${table.attributesJson}) and json_type(${table.attributesJson})='object'`,
    ),
    check("product_variant_revision", sql`${table.revision}>=0`),
  ],
);
export const productSku = sqliteTable("product_sku", {
  normalizedSku: text("normalized_sku").primaryKey().notNull(),
  variantId: text("variant_id")
    .notNull()
    .unique()
    .references(() => productVariant.id, { onDelete: "cascade" }),
});
export const productPackageComponent = sqliteTable(
  "product_package_component",
  {
    packageProductId: text("package_product_id")
      .notNull()
      .references(() => product.id, { onDelete: "restrict" }),
    componentVariantId: text("component_variant_id")
      .notNull()
      .references(() => productVariant.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.packageProductId, table.componentVariantId] }),
    index("package_component_variant_idx").on(table.componentVariantId),
    check(
      "package_component_quantity",
      sql`typeof(${table.quantity})='integer' and ${table.quantity} between 1 and 1000000`,
    ),
  ],
);

export const salesOrder = sqliteTable(
  "sales_order",
  {
    id: text("id").primaryKey().notNull(),
    number: integer("number").notNull().unique(),
    name: text("name").notNull(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "restrict" }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "restrict",
    }),
    leadId: text("lead_id").references(() => lead.id, { onDelete: "restrict" }),
    dealId: text("deal_id").references(() => deal.id, { onDelete: "restrict" }),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    currency: text("currency").notNull().default("USD"),
    state: text("state", {
      enum: ["draft", "confirmed", "completed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    source: text("source"),
    description: text("description"),
    revision: integer("revision").notNull().default(0),
    policyVersion: integer("policy_version").notNull().default(1),
    creationFingerprint: text("creation_fingerprint").notNull(),
    creationResultJson: text("creation_result_json").notNull(),
    linesJson: text("lines_json").notNull(),
    goodsMinor: integer("goods_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    surchargeMinor: integer("surcharge_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    originalMinor: integer("original_minor").notNull(),
    goodsRemainingMinor: integer("goods_remaining_minor").notNull(),
    surchargeRemainingMinor: integer("surcharge_remaining_minor").notNull(),
    taxRemainingMinor: integer("tax_remaining_minor").notNull(),
    collectedMinor: integer("collected_minor").notNull().default(0),
    refundedMinor: integer("refunded_minor").notNull().default(0),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    confirmedDate: text("confirmed_date"),
    completedDate: text("completed_date"),
    cancelledDate: text("cancelled_date"),
    businessTimeZone: text("business_time_zone"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("sales_order_contact_idx").on(table.contactId, table.createdAt),
    index("sales_order_owner_idx").on(table.ownerMembershipId),
    index("sales_order_state_idx").on(table.state, table.completedAt),
    check(
      "sales_order_state",
      sql`${table.state} in ('draft','confirmed','completed','cancelled')`,
    ),
    check(
      "sales_order_lines",
      sql`json_valid(${table.linesJson}) and json_type(${table.linesJson})='array'`,
    ),
    check(
      "sales_order_money",
      sql`${table.goodsMinor}>=0 and ${table.discountMinor} between 0 and ${table.goodsMinor} and ${table.surchargeMinor}>=0 and ${table.taxMinor}>=0 and ${table.originalMinor}=${table.goodsMinor}-${table.discountMinor}+${table.surchargeMinor}+${table.taxMinor} and ${table.originalMinor}<=99999999999999`,
    ),
    check(
      "sales_order_remaining",
      sql`${table.goodsRemainingMinor} between 0 and ${table.goodsMinor}-${table.discountMinor} and ${table.surchargeRemainingMinor} between 0 and ${table.surchargeMinor} and ${table.taxRemainingMinor} between 0 and ${table.taxMinor}`,
    ),
    check(
      "sales_order_collection",
      sql`${table.collectedMinor} between 0 and 99999999999999 and ${table.refundedMinor} between 0 and ${table.collectedMinor}`,
    ),
  ],
);
export const orderSequence = sqliteTable("order_sequence", {
  id: text("id").primaryKey(),
  nextNumber: integer("next_number").notNull(),
});
export const orderOperation = sqliteTable(
  "order_operation",
  {
    id: text("id").primaryKey().notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => salesOrder.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    fingerprint: text("fingerprint").notNull(),
    resultJson: text("result_json").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    businessDate: text("business_date").notNull(),
    timeZone: text("time_zone").notNull(),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("order_operation_order_idx").on(t.orderId, t.createdAt),
    check("order_operation_result", sql`json_valid(${t.resultJson})`),
  ],
);
export const orderPayment = sqliteTable(
  "order_payment",
  {
    id: text("id").primaryKey().notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => salesOrder.id, { onDelete: "restrict" }),
    operationId: text("operation_id")
      .notNull()
      .unique()
      .references(() => orderOperation.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["collection", "refund"] }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    actorId: text("actor_id").notNull(),
    businessDate: text("business_date").notNull(),
    timeZone: text("time_zone").notNull(),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("order_payment_order_idx").on(t.orderId, t.createdAt),
    check(
      "order_payment_amount",
      sql`typeof(${t.amountMinor})='integer' and ${t.amountMinor} between 1 and 99999999999999`,
    ),
    check("order_payment_kind", sql`${t.kind} in ('collection','refund')`),
  ],
);
export const orderAdjustment = sqliteTable("order_adjustment", {
  id: text("id").primaryKey().notNull(),
  orderId: text("order_id")
    .notNull()
    .references(() => salesOrder.id, { onDelete: "restrict" }),
  operationId: text("operation_id")
    .notNull()
    .unique()
    .references(() => orderOperation.id, { onDelete: "restrict" }),
  goodsMinor: integer("goods_minor").notNull(),
  surchargeMinor: integer("surcharge_minor").notNull(),
  taxMinor: integer("tax_minor").notNull(),
  reason: text("reason").notNull(),
  businessDate: text("business_date").notNull(),
  timeZone: text("time_zone").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
export const variantFulfillment = sqliteTable(
  "variant_fulfillment",
  {
    variantId: text("variant_id")
      .primaryKey()
      .notNull()
      .references(() => productVariant.id, { onDelete: "restrict" }),
    stockTracked: integer("stock_tracked", { mode: "boolean" })
      .notNull()
      .default(false),
    sessionUnits: integer("session_units").notNull().default(0),
    expiryDays: integer("expiry_days"),
    onHand: integer("on_hand").notNull().default(0),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [
    check("variant_fulfillment_stock", sql`${t.stockTracked} in (0,1)`),
    check(
      "variant_fulfillment_units",
      sql`${t.sessionUnits} between 0 and 1000000`,
    ),
    check(
      "variant_fulfillment_expiry",
      sql`${t.expiryDays} between 1 and 36500`,
    ),
    check(
      "variant_fulfillment_balance",
      sql`typeof(${t.onHand})='integer' and ${t.onHand} between 0 and 1000000000000`,
    ),
  ],
);
export const inventoryMovement = sqliteTable(
  "inventory_movement",
  {
    id: text("id").primaryKey().notNull(),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariant.id, { onDelete: "restrict" }),
    orderId: text("order_id").references(() => salesOrder.id, {
      onDelete: "restrict",
    }),
    kind: text("kind", {
      enum: ["receipt", "adjustment", "sale", "return"],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    operationKey: text("operation_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    resultJson: text("result_json").notNull().default("{}"),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    businessDate: text("business_date").notNull(),
    timeZone: text("time_zone").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("inventory_operation_variant_unique").on(
      t.operationKey,
      t.variantId,
    ),
    index("inventory_variant_idx").on(t.variantId, t.createdAt),
  ],
);
export const serviceEntitlement = sqliteTable(
  "service_entitlement",
  {
    id: text("id").primaryKey().notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => salesOrder.id, { onDelete: "restrict" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "restrict" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariant.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    granted: integer("granted").notNull(),
    remaining: integer("remaining").notNull(),
    used: integer("used").notNull().default(0),
    revoked: integer("revoked").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("entitlement_order_variant_unique").on(t.orderId, t.variantId),
    index("entitlement_contact_idx").on(t.contactId),
    check(
      "entitlement_balance",
      sql`${t.granted}>0 and ${t.remaining}>=0 and ${t.used}>=0 and ${t.revoked}>=0 and ${t.granted}=${t.remaining}+${t.used}+${t.revoked}`,
    ),
  ],
);
export const entitlementMovement = sqliteTable(
  "entitlement_movement",
  {
    id: text("id").primaryKey().notNull(),
    entitlementId: text("entitlement_id")
      .notNull()
      .references(() => serviceEntitlement.id, { onDelete: "restrict" }),
    kind: text("kind", {
      enum: ["grant", "use", "restore", "revoke"],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    operationKey: text("operation_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    resultJson: text("result_json").notNull().default("{}"),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    businessDate: text("business_date").notNull(),
    timeZone: text("time_zone").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("entitlement_operation_unique").on(
      t.operationKey,
      t.entitlementId,
    ),
  ],
);
