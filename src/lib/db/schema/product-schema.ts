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

import { singletonMembership, user } from "./auth-schema";

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
