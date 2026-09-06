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

export const dealStage = sqliteTable(
  "deal_stage",
  {
    id: text("id").primaryKey(),
    labelKey: text("label_key").notNull(),
    label: text("label"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    position: integer("position").notNull(),
    closedState: text("closed_state", {
      enum: ["open", "won", "lost"],
    })
      .default("open")
      .notNull(),
  },
  (table) => [
    uniqueIndex("deal_stage_position_unique").on(table.position),
    check(
      "deal_stage_closed_state_check",
      sql`${table.closedState} in ('open', 'won', 'lost')`,
    ),
  ],
);

export const company = sqliteTable(
  "company",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    website: text("website"),
    description: text("description"),
    industry: text("industry"),
    city: text("city"),
    countryCode: text("country_code"),
    phone: text("phone"),
    email: text("email"),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("company_name_idx").on(table.name),
    index("company_owner_idx").on(table.ownerMembershipId),
    index("company_last_activity_idx").on(table.lastActivityAt),
    index("company_archived_idx").on(table.archivedAt),
    uniqueIndex("company_active_domain_unique")
      .on(table.domain)
      .where(sql`${table.archivedAt} is null and ${table.domain} is not null`),
  ],
);

export const contact = sqliteTable(
  "contact",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    normalizedPhone: text("normalized_phone"),
    title: text("title"),
    birthDate: text("birth_date"),
    gender: text("gender", { enum: ["female", "male", "nonbinary", "other", "undisclosed"] }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "set null",
    }),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("contact_name_idx").on(table.firstName, table.lastName),
    index("contact_company_idx").on(table.companyId),
    index("contact_owner_idx").on(table.ownerMembershipId),
    index("contact_last_activity_idx").on(table.lastActivityAt),
    index("contact_archived_idx").on(table.archivedAt),
    index("contact_normalized_phone_idx").on(table.normalizedPhone),
    uniqueIndex("contact_active_email_unique")
      .on(table.email)
      .where(sql`${table.archivedAt} is null and ${table.email} is not null`),
  ],
);

export const deal = sqliteTable(
  "deal",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "set null",
    }),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    stageId: text("stage_id")
      .notNull()
      .references(() => dealStage.id, { onDelete: "restrict" }),
    stageChangedAt: integer("stage_changed_at", {
      mode: "timestamp_ms",
    }).notNull(),
    amountMinor: integer("amount_minor"),
    moneyRevision: integer("money_revision").default(0).notNull(),
    currency: text("currency").default("USD").notNull(),
    expectedCloseAt: integer("expected_close_at", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    closedReason: text("closed_reason"),
    baseAmountMinor: integer("base_amount_minor"),
    baseCurrency: text("base_currency"),
    fxRateScaled: integer("fx_rate_scaled"),
    fxRateAt: integer("fx_rate_at", { mode: "timestamp_ms" }),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("deal_company_idx").on(table.companyId),
    index("deal_owner_idx").on(table.ownerMembershipId),
    index("deal_stage_idx").on(table.stageId),
    index("deal_close_idx").on(table.expectedCloseAt),
    index("deal_last_activity_idx").on(table.lastActivityAt),
    index("deal_currency_idx").on(table.currency),
    index("deal_archived_idx").on(table.archivedAt),
    check(
      "deal_amount_minor_check",
      sql`${table.amountMinor} is null or ${table.amountMinor} >= 0`,
    ),
    check("deal_currency_check", sql`length(${table.currency}) = 3`),
  ],
);

export const dealContact = sqliteTable(
  "deal_contact",
  {
    dealId: text("deal_id")
      .notNull()
      .references(() => deal.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    role: text("role"),
  },
  (table) => [
    primaryKey({ columns: [table.dealId, table.contactId] }),
    index("deal_contact_contact_idx").on(table.contactId),
  ],
);

export const activity = sqliteTable(
  "activity",
  {
    orderId: text("order_id").references(() => salesOrder.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => lead.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    type: text("type", {
      enum: ["note", "call", "meeting", "task", "stage_change"],
    }).notNull(),
    subject: text("subject"),
    content: text("content"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "cascade",
    }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "cascade",
    }),
    dealId: text("deal_id").references(() => deal.id, {
      onDelete: "cascade",
    }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    metadataJson: text("metadata_json"),
    ...timestamps,
  },
  (table) => [
    index("activity_order_created_idx").on(table.orderId, table.createdAt, table.id),
    index("activity_product_created_idx").on(table.productId, table.createdAt, table.id),
    index("activity_lead_created_idx").on(table.leadId, table.createdAt, table.id),
    index("activity_company_created_idx").on(table.companyId, table.createdAt, table.id),
    index("activity_contact_created_idx").on(table.contactId, table.createdAt, table.id),
    index("activity_deal_created_idx").on(table.dealId, table.createdAt, table.id),
    index("activity_due_idx").on(table.dueAt),
    index("activity_author_idx").on(table.authorUserId),
    check(
      "activity_type_check",
      sql`${table.type} in ('note', 'call', 'meeting', 'task', 'stage_change')`,
    ),
    check(
      "activity_anchor_check",
      sql`((${table.companyId} is not null) + (${table.contactId} is not null) + (${table.dealId} is not null) + (${table.leadId} is not null) + (${table.productId} is not null) + (${table.orderId} is not null)) >= 1`,
    ),
    check(
      "activity_metadata_json_check",
      sql`${table.metadataJson} is null or json_valid(${table.metadataJson})`,
    ),
  ],
);

export const activityVisibility = sqliteTable(
  "activity_visibility",
  {
    activityId: text("activity_id")
      .notNull()
      .references(() => activity.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.membershipId] }),
    index("activity_visibility_member_idx").on(table.membershipId),
  ],
);

export const memberOperationGuard = sqliteTable(
  "member_operation_guard",
  {
    id: text("id").primaryKey(),
    authorized: integer("authorized").notNull(),
  },
  (table) => [
    check("member_operation_guard_authorized_check", sql`${table.authorized} = 1`),
  ],
);

export const fieldConfigurationRevision = sqliteTable("field_configuration_revision", {
  entity: text("entity", { enum: ["company", "contact", "deal", "lead", "product", "order"] }).primaryKey().notNull(),
  revision: integer("revision").default(0).notNull(),
});

export const customFieldDefinition = sqliteTable(
  "custom_field_definition",
  {
    id: text("id").primaryKey(),
    entity: text("entity", { enum: ["company", "contact", "deal", "lead", "product", "order"] }).notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type", {
      enum: [
        "text",
        "long_text",
        "number",
        "date",
        "checkbox",
        "select",
        "url",
        "email",
        "phone",
        "user", "money", "multiselect", "multivalue", "rating", "customer", "formula", "file",
      ],
    }).notNull(),
    configJson: text("config_json"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    required: integer("required", { mode: "boolean" }).default(false).notNull(),
    showOnSheet: integer("show_on_sheet", { mode: "boolean" })
      .default(true)
      .notNull(),
    showOnTable: integer("show_on_table", { mode: "boolean" })
      .default(false)
      .notNull(),
    showOnFilter: integer("show_on_filter", { mode: "boolean" })
      .default(false)
      .notNull(),
    position: integer("position").notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("custom_field_entity_key_unique").on(table.entity, table.key),
    index("custom_field_entity_position_idx").on(table.entity, table.position),
    check(
      "custom_field_entity_check",
      sql`${table.entity} in ('company', 'contact', 'deal', 'lead', 'product', 'order')`,
    ),
    check(
      "custom_field_type_check",
      sql`${table.type} in ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer', 'formula', 'file')`,
    ),
    check(
      "custom_field_config_json_check",
      sql`${table.configJson} is null or json_valid(${table.configJson})`,
    ),
  ],
);

export const customFieldOption = sqliteTable(
  "custom_field_option",
  {
    id: text("id").primaryKey(),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFieldDefinition.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("custom_field_option_position_idx").on(table.fieldId, table.position)],
);

export const customFieldValue = sqliteTable(
  "custom_field_value",
  {
    orderId: text("order_id").references(() => salesOrder.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => lead.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFieldDefinition.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "cascade",
    }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "cascade",
    }),
    dealId: text("deal_id").references(() => deal.id, { onDelete: "cascade" }),
    jsonValue: text("json_value"),
    customerReferenceId: text("customer_reference_id").references(() => contact.id, { onDelete: "restrict" }),
    textValue: text("text_value"),
    numberValue: integer("number_value"),
    dateValue: integer("date_value", { mode: "timestamp_ms" }),
    booleanValue: integer("boolean_value", { mode: "boolean" }),
    optionId: text("option_id").references(() => customFieldOption.id, {
      onDelete: "set null",
    }),
    userMembershipId: text("user_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("custom_field_company_unique").on(table.fieldId, table.companyId),
    uniqueIndex("custom_field_contact_unique").on(table.fieldId, table.contactId),
    uniqueIndex("custom_field_deal_unique").on(table.fieldId, table.dealId),
    uniqueIndex("custom_field_lead_unique").on(table.fieldId, table.leadId),
    uniqueIndex("custom_field_order_unique").on(table.fieldId, table.orderId),
    uniqueIndex("custom_field_product_unique").on(table.fieldId, table.productId),
    index("custom_field_value_text_idx").on(table.fieldId, table.textValue),
    index("custom_field_value_number_idx").on(table.fieldId, table.numberValue),
    index("custom_field_value_date_idx").on(table.fieldId, table.dateValue),
    index("custom_field_value_user_idx").on(table.userMembershipId),
    index("custom_field_value_customer_idx").on(table.customerReferenceId),
    check("custom_field_json_value_check", sql`${table.jsonValue} is null or json_valid(${table.jsonValue})`),
    check(
      "custom_field_value_one_record_check",
      sql`((${table.companyId} is not null) + (${table.contactId} is not null) + (${table.dealId} is not null) + (${table.leadId} is not null) + (${table.productId} is not null) + (${table.orderId} is not null)) = 1`,
    ),
  ],
);

export const savedView = sqliteTable(
  "saved_view",
  {
    id: text("id").primaryKey(),
    entity: text("entity", { enum: ["company", "contact", "deal", "lead", "product", "order"] }).notNull(),
    name: text("name").notNull(),
    shared: integer("shared", { mode: "boolean" }).default(false).notNull(),
    stateJson: text("state_json").notNull(),
    creatorUserId: text("creator_user_id").references(() => user.id, { onDelete: "set null" }),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("saved_view_creator_name_unique").on(table.entity, table.creatorUserId, table.name),
    uniqueIndex("saved_view_owner_name_unique").on(
      table.entity,
      table.ownerMembershipId,
      table.name,
    ),
    index("saved_view_entity_shared_idx").on(table.entity, table.shared),
    check(
      "saved_view_entity_check",
      sql`${table.entity} in ('company', 'contact', 'deal', 'lead', 'product', 'order')`,
    ),
    check("saved_view_state_json_check", sql`json_valid(${table.stateJson})`),
  ],
);

export const savedViewDefault = sqliteTable("saved_view_default", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  entity: text("entity", { enum: ["company", "contact", "deal", "lead", "product", "order"] }).notNull(),
  viewId: text("view_id").notNull().references(() => savedView.id, { onDelete: "cascade" }),
}, table => [
  primaryKey({ columns: [table.userId, table.entity] }),
  index("saved_view_default_view_idx").on(table.viewId),
  check("saved_view_default_entity_check", sql`${table.entity} in ('company','contact','deal','lead','product','order')`),
]);

export const exchangeRate = sqliteTable(
  "exchange_rate",
  {
    id: text("id").primaryKey(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: text("rate").notNull(),
    asOf: integer("as_of", { mode: "timestamp_ms" }).notNull(),
    source: text("source", { enum: ["fetched", "manual"] }).notNull(),
    provider: text("provider"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("exchange_rate_pair_source_unique").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.source,
    ),
    index("exchange_rate_pair_idx").on(table.baseCurrency, table.quoteCurrency),
    check("exchange_rate_value_check", sql`length(${table.rate}) between 1 and 21`),
    check(
      "exchange_rate_source_check",
      sql`${table.source} in ('fetched', 'manual')`,
    ),
    check(
      "exchange_rate_currency_check",
      sql`length(${table.baseCurrency}) = 3 and length(${table.quoteCurrency}) = 3`,
    ),
  ],
);

export const crmSetting = sqliteTable(
  "crm_setting",
  {
    id: text("id").primaryKey(),
    reportingCurrency: text("reporting_currency").default("USD").notNull(),
    timeZone: text("time_zone").default("Asia/Ho_Chi_Minh").notNull(),
    countryCode: text("country_code").default("VN").notNull(),
    calendarRevision: integer("calendar_revision").default(0).notNull(),
    activeConversionVersion: text("active_conversion_version").default("initial").notNull(),
    pendingJobId: text("pending_job_id"),
    ratesRevision: integer("rates_revision").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    check("crm_setting_singleton_check", sql`${table.id} = 'settings'`),
    check(
      "crm_setting_currency_check",
      sql`length(${table.reportingCurrency}) = 3`,
    ),
  ],
);

export const fieldValueRevision = sqliteTable("field_value_revision", {
  fieldId: text("field_id").primaryKey().references(() => customFieldDefinition.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(0),
});

export const fieldConversionPreview = sqliteTable("field_conversion_preview", {
  id: text("id").primaryKey(),
  fieldId: text("field_id").notNull().references(() => customFieldDefinition.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  targetType: text("target_type").notNull(),
  configJson: text("config_json").notNull(),
  configurationRevision: integer("configuration_revision").notNull(),
  valueRevision: integer("value_revision").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [uniqueIndex("field_conversion_preview_owner_idx").on(table.fieldId, table.userId), index("field_conversion_preview_expiry_idx").on(table.expiresAt), check("field_conversion_preview_json_check", sql`json_valid(${table.configJson})`)]);

export const fieldConversionGuard = sqliteTable("field_conversion_guard", {
  fieldId: text("field_id").primaryKey().references(() => customFieldDefinition.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  targetType: text("target_type").notNull(),
});

export const currencyJob = sqliteTable("currency_job", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["rerate", "fill_missing"] }).notNull(),
  targetCurrency: text("target_currency").notNull(),
  expectedVersion: text("expected_version").notNull(),
  targetVersion: text("target_version").notNull(),
  ratesJson: text("rates_json").notNull(),
  cursor: text("cursor"),
  total: integer("total").notNull(),
  processed: integer("processed").default(0).notNull(),
  converted: integer("converted").default(0).notNull(),
  missing: integer("missing").default(0).notNull(),
  status: text("status", { enum: ["pending", "running", "completed", "cancelled"] }).notNull(),
  ...timestamps,
});

export const dealConversion = sqliteTable("deal_conversion", {
  version: text("version").notNull(),
  dealId: text("deal_id").notNull().references(() => deal.id, { onDelete: "cascade" }),
  moneyRevision: integer("money_revision").notNull(),
  amountMinor: integer("amount_minor"),
  currency: text("currency").notNull(),
  baseAmountMinor: integer("base_amount_minor"),
  baseCurrency: text("base_currency"),
  fxRate: text("fx_rate"),
  fxRateAt: integer("fx_rate_at", { mode: "timestamp_ms" }),
  rateSource: text("rate_source", { enum: ["identity", "manual", "fetched"] }),
}, table => [primaryKey({ columns: [table.version, table.dealId] }), index("deal_conversion_amount_idx").on(table.version, table.baseAmountMinor, table.dealId)]);

// Metadata deliberately has no foreign keys: object keys survive record and account deletion.
export const crmFile = sqliteTable("crm_file", {
  id: text("id").primaryKey(),
  objectKey: text("object_key").notNull(),
  entity: text("entity", { enum: ["company", "contact", "deal", "lead", "product", "order"] }).notNull(),
  recordId: text("record_id").notNull(),
  fieldId: text("field_id").notNull(),
  uploaderId: text("uploader_id").notNull(),
  fileName: text("file_name").notNull(),
  size: integer("size").notNull(),
  status: text("status", { enum: ["pending", "ready", "failed", "cleaning"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  readyAt: integer("ready_at", { mode: "timestamp_ms" }),
  cleanupAttemptedAt: integer("cleanup_attempted_at", { mode: "timestamp_ms" }),
}, table => [
  uniqueIndex("crm_file_object_key_unique").on(table.objectKey),
  index("crm_file_anchor_idx").on(table.entity, table.recordId, table.fieldId),
  index("crm_file_cleanup_idx").on(table.status, table.createdAt),
  check("crm_file_entity_check", sql`${table.entity} in ('company','contact','deal','lead','product','order')`),
  check("crm_file_status_check", sql`${table.status} in ('pending','ready','failed','cleaning')`),
  check("crm_file_name_check", sql`length(${table.fileName}) between 1 and 255`),
  check("crm_file_size_check", sql`typeof(${table.size}) = 'integer' and ${table.size} between 0 and 10485760`),
  check("crm_file_ready_check", sql`(${table.status} = 'ready' and ${table.readyAt} is not null) or (${table.status} != 'ready' and ${table.readyAt} is null)`),
]);

export const moduleSetting = sqliteTable("module_setting", {
  entity: text("entity", { enum: ["company", "contact", "deal", "lead", "product", "order", "contract", "review"] }).primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  revision: integer("revision").default(0).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, table => [
  check("module_setting_entity_check", sql`${table.entity} in ('company','contact','deal','lead','product','order','contract','review')`),
  check("module_setting_enabled_check", sql`${table.enabled} in (0,1)`),
  check("module_setting_revision_check", sql`typeof(${table.revision}) = 'integer' and ${table.revision} >= 0`),
]);

export const recordLayout = sqliteTable("record_layout", {
  entity: text("entity", { enum: ["company", "contact", "deal", "lead", "product", "order"] }).primaryKey(),
  revision: integer("revision").notNull().default(0),
  fieldsJson: text("fields_json").notNull().default("null"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, table => [check("record_layout_entity", sql`${table.entity} in ('company','contact','deal','lead','product','order')`), check("record_layout_revision", sql`${table.revision} >= 0`), check("record_layout_json", sql`json_valid(${table.fieldsJson})`)]);

export const recordDraft = sqliteTable("record_draft", {
  id: text("id").primaryKey(),
  entity: text("entity", { enum: ["company", "contact", "deal", "lead", "product", "order"] }).notNull(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, table => [check("record_draft_entity", sql`${table.entity} in ('company','contact','deal','lead','product','order')`), check("record_draft_expiry", sql`${table.expiresAt} > ${table.createdAt}`)]);

export const dealStageCatalogRevision = sqliteTable("deal_stage_catalog_revision", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
}, table => [check("deal_stage_catalog_singleton", sql`${table.id} = 'stages'`), check("deal_stage_catalog_revision_nonnegative", sql`${table.revision} >= 0`)]);


export const leadSource = sqliteTable("lead_source", {
  id: text("id").primaryKey().notNull(), label: text("label"), labelKey: text("label_key").notNull(),
  position: integer("position").notNull().unique(), archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
});
export const leadStatus = sqliteTable("lead_status", {
  id: text("id").primaryKey().notNull(), label: text("label"), labelKey: text("label_key").notNull(),
  position: integer("position").notNull().unique(), archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  meaning: text("meaning", { enum: ["working", "rejected", "converted"] }).notNull(),
  requiresReason: integer("requires_reason", { mode: "boolean" }).notNull().default(false),
}, table => [check("lead_status_meaning", sql`${table.meaning} in ('working','rejected','converted')`), check("lead_converted_status", sql`(${table.meaning} = 'converted') = (${table.id} = 'converted')`), check("lead_requires_reason", sql`${table.requiresReason} in (0,1)`)]);
export const leadSettingsRevision = sqliteTable("lead_settings_revision", {
  id: text("id", { enum: ["settings"] }).primaryKey().notNull(), revision: integer("revision").notNull().default(0),
}, table => [check("lead_settings_singleton", sql`${table.id} = 'settings'`), check("lead_settings_revision", sql`${table.revision} >= 0`)]);
export const lead = sqliteTable("lead", {
  id: text("id").primaryKey().notNull(), firstName: text("first_name").notNull(), lastName: text("last_name"),
  email: text("email"), phone: text("phone"), normalizedEmail: text("normalized_email"), normalizedPhone: text("normalized_phone"),
  title: text("title"), description: text("description"), companyId: text("company_id").references(() => company.id, { onDelete: "set null" }),
  sourceId: text("source_id").notNull().default("manual").references(() => leadSource.id, { onDelete: "restrict" }),
  statusId: text("status_id").notNull().default("new").references(() => leadStatus.id, { onDelete: "restrict" }), rejectionReason: text("rejection_reason"),
  ownerMembershipId: text("owner_membership_id").references(() => singletonMembership.userId, { onDelete: "set null" }),
  creatorUserId: text("creator_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull().default(0), lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }), convertedAt: integer("converted_at", { mode: "timestamp_ms" }),
  convertedContactId: text("converted_contact_id").references(() => contact.id, { onDelete: "restrict" }), ...timestamps,
}, table => [
  index("lead_source_idx").on(table.sourceId), index("lead_status_idx").on(table.statusId), index("lead_owner_idx").on(table.ownerMembershipId),
  index("lead_email_idx").on(table.normalizedEmail), index("lead_phone_idx").on(table.normalizedPhone), index("lead_created_idx").on(table.createdAt, table.id),
  check("lead_revision", sql`${table.revision} >= 0`),
  check("lead_conversion_state", sql`(${table.convertedAt} is null and ${table.convertedContactId} is null and ${table.statusId} != 'converted') or (${table.convertedAt} is not null and ${table.convertedContactId} is not null and ${table.statusId} = 'converted')`),
]);
export const leadCollaborator = sqliteTable("lead_collaborator", {
  leadId: text("lead_id").notNull().references(() => lead.id, { onDelete: "cascade" }),
  membershipId: text("membership_id").notNull().references(() => singletonMembership.userId, { onDelete: "cascade" }),
}, table => [primaryKey({ columns: [table.leadId, table.membershipId] }), index("lead_collaborator_member_idx").on(table.membershipId, table.leadId)]);
export const leadMapping = sqliteTable("lead_mapping", {
  id: text("id", { enum: ["contact"] }).primaryKey().notNull(), revision: integer("revision").notNull().default(0),
  mappingsJson: text("mappings_json").notNull().default("[]"), autoOrder: integer("auto_order", { mode: "boolean" }).notNull().default(false),
  autoDeal: integer("auto_deal", { mode: "boolean" }).notNull().default(false), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, table => [check("lead_mapping_singleton", sql`${table.id} = 'contact'`), check("lead_mapping_revision", sql`${table.revision} >= 0`), check("lead_mapping_json", sql`json_valid(${table.mappingsJson})`), check("lead_mapping_order_boolean", sql`${table.autoOrder} in (0,1)`), check("lead_mapping_deal_boolean", sql`${table.autoDeal} in (0,1)`)]);
export const leadConversion = sqliteTable("lead_conversion", {
  id: text("id").primaryKey().notNull(), leadId: text("lead_id").notNull().unique().references(() => lead.id, { onDelete: "restrict" }),
  operationKey: text("operation_key").notNull().unique(), fingerprint: text("fingerprint").notNull(),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  contactId: text("contact_id").notNull().references(() => contact.id, { onDelete: "restrict" }), mode: text("mode", { enum: ["create", "link"] }).notNull(),
  leadRevision: integer("lead_revision").notNull(), mappingRevision: integer("mapping_revision").notNull(),
  snapshotJson: text("snapshot_json").notNull(), resultJson: text("result_json").notNull(), completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("lead_conversion_contact_completed_idx").on(table.contactId, sql`${table.completedAt} desc`, table.leadId), check("lead_conversion_mode", sql`${table.mode} in ('create','link')`), check("lead_conversion_snapshot_json", sql`json_valid(${table.snapshotJson})`), check("lead_conversion_result_json", sql`json_valid(${table.resultJson})`)]);


export const productCategory = sqliteTable("product_category", {
 id:text("id").primaryKey().notNull(),label:text("label").notNull(),position:integer("position").notNull().unique(),
 archivedAt:integer("archived_at",{mode:"timestamp_ms"}),revision:integer("revision").notNull().default(0),
},table=>[check("product_category_label",sql`length(trim(${table.label})) between 1 and 120`),check("product_category_revision",sql`${table.revision}>=0`)]);
export const productCategoryRevision = sqliteTable("product_category_revision", {
 id:text("id",{enum:["categories"]}).primaryKey().notNull(),revision:integer("revision").notNull().default(0),
},table=>[check("product_category_singleton",sql`${table.id}='categories'`),check("product_category_catalog_revision",sql`${table.revision}>=0`)]);
export const product = sqliteTable("product", {
 id:text("id").primaryKey().notNull(),kind:text("kind",{enum:["product","service","package"]}).notNull(),name:text("name").notNull(),description:text("description"),
 categoryId:text("category_id").references(()=>productCategory.id,{onDelete:"restrict"}),ownerMembershipId:text("owner_membership_id").references(()=>singletonMembership.userId,{onDelete:"set null"}),
 creatorUserId:text("creator_user_id").notNull().references(()=>user.id,{onDelete:"restrict"}),revision:integer("revision").notNull().default(0),
 archivedAt:integer("archived_at",{mode:"timestamp_ms"}),lastActivityAt:integer("last_activity_at",{mode:"timestamp_ms"}),...timestamps,
},table=>[index("product_category_idx").on(table.categoryId),index("product_owner_idx").on(table.ownerMembershipId),index("product_created_idx").on(table.createdAt,table.id),check("product_kind",sql`${table.kind} in ('product','service','package')`),check("product_name",sql`length(trim(${table.name})) between 1 and 200`),check("product_revision",sql`${table.revision}>=0`)]);
export const productVariant = sqliteTable("product_variant", {
 id:text("id").primaryKey().notNull(),productId:text("product_id").notNull().references(()=>product.id,{onDelete:"restrict"}),isDefault:integer("is_default",{mode:"boolean"}).notNull().default(false),
 sku:text("sku"),label:text("label").notNull(),priceMinor:integer("price_minor").notNull(),costMinor:integer("cost_minor"),currency:text("currency").notNull().default("USD"),
 durationMinutes:integer("duration_minutes"),attributesJson:text("attributes_json").notNull().default("{}"),revision:integer("revision").notNull().default(0),archivedAt:integer("archived_at",{mode:"timestamp_ms"}),...timestamps,
},table=>[uniqueIndex("product_default_variant_unique").on(table.productId).where(sql`${table.isDefault}=1`),index("product_variant_product_idx").on(table.productId,table.archivedAt,table.id),
 check("product_variant_default",sql`${table.isDefault} in (0,1)`),check("product_variant_sku",sql`${table.sku} is null or length(trim(${table.sku})) between 1 and 100`),check("product_variant_label",sql`length(trim(${table.label})) between 1 and 120`),
 check("product_variant_price",sql`typeof(${table.priceMinor})='integer' and ${table.priceMinor} between 0 and 99999999999999`),check("product_variant_cost",sql`${table.costMinor} is null or (typeof(${table.costMinor})='integer' and ${table.costMinor} between 0 and 99999999999999)`),check("product_variant_currency",sql`${table.currency} in ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND')`),
 check("product_variant_duration",sql`${table.durationMinutes} is null or (typeof(${table.durationMinutes})='integer' and ${table.durationMinutes} between 1 and 1000000)`),check("product_variant_attributes",sql`json_valid(${table.attributesJson}) and json_type(${table.attributesJson})='object'`),check("product_variant_revision",sql`${table.revision}>=0`)]);
export const productSku=sqliteTable("product_sku",{
 normalizedSku:text("normalized_sku").primaryKey().notNull(),variantId:text("variant_id").notNull().unique().references(()=>productVariant.id,{onDelete:"cascade"}),
});
export const productPackageComponent=sqliteTable("product_package_component",{
 packageProductId:text("package_product_id").notNull().references(()=>product.id,{onDelete:"restrict"}),componentVariantId:text("component_variant_id").notNull().references(()=>productVariant.id,{onDelete:"restrict"}),quantity:integer("quantity").notNull(),
},table=>[primaryKey({columns:[table.packageProductId,table.componentVariantId]}),index("package_component_variant_idx").on(table.componentVariantId),check("package_component_quantity",sql`typeof(${table.quantity})='integer' and ${table.quantity} between 1 and 1000000`)]);

export const salesOrder = sqliteTable("sales_order", {
 id:text("id").primaryKey().notNull(),number:integer("number").notNull().unique(),name:text("name").notNull(),contactId:text("contact_id").notNull().references(()=>contact.id,{onDelete:"restrict"}),
 companyId:text("company_id").references(()=>company.id,{onDelete:"restrict"}),leadId:text("lead_id").references(()=>lead.id,{onDelete:"restrict"}),dealId:text("deal_id").references(()=>deal.id,{onDelete:"restrict"}),
 ownerMembershipId:text("owner_membership_id").references(()=>singletonMembership.userId,{onDelete:"set null"}),creatorUserId:text("creator_user_id").notNull().references(()=>user.id,{onDelete:"restrict"}),
 currency:text("currency").notNull().default("USD"),state:text("state",{enum:["draft","confirmed","completed","cancelled"]}).notNull().default("draft"),source:text("source"),description:text("description"),
 revision:integer("revision").notNull().default(0),policyVersion:integer("policy_version").notNull().default(1),creationFingerprint:text("creation_fingerprint").notNull(),creationResultJson:text("creation_result_json").notNull(),linesJson:text("lines_json").notNull(),
 goodsMinor:integer("goods_minor").notNull(),discountMinor:integer("discount_minor").notNull().default(0),surchargeMinor:integer("surcharge_minor").notNull().default(0),taxMinor:integer("tax_minor").notNull().default(0),originalMinor:integer("original_minor").notNull(),
 goodsRemainingMinor:integer("goods_remaining_minor").notNull(),surchargeRemainingMinor:integer("surcharge_remaining_minor").notNull(),taxRemainingMinor:integer("tax_remaining_minor").notNull(),collectedMinor:integer("collected_minor").notNull().default(0),refundedMinor:integer("refunded_minor").notNull().default(0),
 confirmedAt:integer("confirmed_at",{mode:"timestamp_ms"}),completedAt:integer("completed_at",{mode:"timestamp_ms"}),cancelledAt:integer("cancelled_at",{mode:"timestamp_ms"}),confirmedDate:text("confirmed_date"),completedDate:text("completed_date"),cancelledDate:text("cancelled_date"),businessTimeZone:text("business_time_zone"),
 archivedAt:integer("archived_at",{mode:"timestamp_ms"}),lastActivityAt:integer("last_activity_at",{mode:"timestamp_ms"}),...timestamps,
},table=>[index("sales_order_contact_idx").on(table.contactId,table.createdAt),index("sales_order_owner_idx").on(table.ownerMembershipId),index("sales_order_state_idx").on(table.state,table.completedAt),
 check("sales_order_state",sql`${table.state} in ('draft','confirmed','completed','cancelled')`),check("sales_order_lines",sql`json_valid(${table.linesJson}) and json_type(${table.linesJson})='array'`),
 check("sales_order_money",sql`${table.goodsMinor}>=0 and ${table.discountMinor} between 0 and ${table.goodsMinor} and ${table.surchargeMinor}>=0 and ${table.taxMinor}>=0 and ${table.originalMinor}=${table.goodsMinor}-${table.discountMinor}+${table.surchargeMinor}+${table.taxMinor} and ${table.originalMinor}<=99999999999999`),
 check("sales_order_remaining",sql`${table.goodsRemainingMinor} between 0 and ${table.goodsMinor}-${table.discountMinor} and ${table.surchargeRemainingMinor} between 0 and ${table.surchargeMinor} and ${table.taxRemainingMinor} between 0 and ${table.taxMinor}`),
 check("sales_order_collection",sql`${table.collectedMinor} between 0 and 99999999999999 and ${table.refundedMinor} between 0 and ${table.collectedMinor}`)]);
export const orderSequence=sqliteTable("order_sequence",{id:text("id").primaryKey(),nextNumber:integer("next_number").notNull()});
export const orderOperation=sqliteTable("order_operation",{id:text("id").primaryKey().notNull(),orderId:text("order_id").notNull().references(()=>salesOrder.id,{onDelete:"restrict"}),action:text("action").notNull(),fingerprint:text("fingerprint").notNull(),resultJson:text("result_json").notNull(),actorId:text("actor_id").notNull().references(()=>user.id,{onDelete:"restrict"}),businessDate:text("business_date").notNull(),timeZone:text("time_zone").notNull(),reason:text("reason"),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},t=>[index("order_operation_order_idx").on(t.orderId,t.createdAt),check("order_operation_result",sql`json_valid(${t.resultJson})`)]);
export const orderPayment=sqliteTable("order_payment",{id:text("id").primaryKey().notNull(),orderId:text("order_id").notNull().references(()=>salesOrder.id,{onDelete:"restrict"}),operationId:text("operation_id").notNull().unique().references(()=>orderOperation.id,{onDelete:"restrict"}),kind:text("kind",{enum:["collection","refund"]}).notNull(),amountMinor:integer("amount_minor").notNull(),currency:text("currency").notNull(),method:text("method").notNull(),reference:text("reference"),actorId:text("actor_id").notNull(),businessDate:text("business_date").notNull(),timeZone:text("time_zone").notNull(),reason:text("reason"),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},t=>[index("order_payment_order_idx").on(t.orderId,t.createdAt),check("order_payment_amount",sql`typeof(${t.amountMinor})='integer' and ${t.amountMinor} between 1 and 99999999999999`),check("order_payment_kind",sql`${t.kind} in ('collection','refund')`)]);
export const orderAdjustment=sqliteTable("order_adjustment",{id:text("id").primaryKey().notNull(),orderId:text("order_id").notNull().references(()=>salesOrder.id,{onDelete:"restrict"}),operationId:text("operation_id").notNull().unique().references(()=>orderOperation.id,{onDelete:"restrict"}),goodsMinor:integer("goods_minor").notNull(),surchargeMinor:integer("surcharge_minor").notNull(),taxMinor:integer("tax_minor").notNull(),reason:text("reason").notNull(),businessDate:text("business_date").notNull(),timeZone:text("time_zone").notNull(),actorId:text("actor_id").notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()});
export const variantFulfillment=sqliteTable("variant_fulfillment",{variantId:text("variant_id").primaryKey().notNull().references(()=>productVariant.id,{onDelete:"restrict"}),stockTracked:integer("stock_tracked",{mode:"boolean"}).notNull().default(false),sessionUnits:integer("session_units").notNull().default(0),expiryDays:integer("expiry_days"),onHand:integer("on_hand").notNull().default(0),revision:integer("revision").notNull().default(0)},t=>[check("variant_fulfillment_stock",sql`${t.stockTracked} in (0,1)`),check("variant_fulfillment_units",sql`${t.sessionUnits} between 0 and 1000000`),check("variant_fulfillment_expiry",sql`${t.expiryDays} between 1 and 36500`),check("variant_fulfillment_balance",sql`typeof(${t.onHand})='integer' and ${t.onHand} between 0 and 1000000000000`)]);
export const inventoryMovement=sqliteTable("inventory_movement",{id:text("id").primaryKey().notNull(),variantId:text("variant_id").notNull().references(()=>productVariant.id,{onDelete:"restrict"}),orderId:text("order_id").references(()=>salesOrder.id,{onDelete:"restrict"}),kind:text("kind",{enum:["receipt","adjustment","sale","return"]}).notNull(),quantity:integer("quantity").notNull(),operationKey:text("operation_key").notNull(),fingerprint:text("fingerprint").notNull(),resultJson:text("result_json").notNull().default("{}"),actorId:text("actor_id").notNull(),reason:text("reason").notNull(),businessDate:text("business_date").notNull(),timeZone:text("time_zone").notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},t=>[uniqueIndex("inventory_operation_variant_unique").on(t.operationKey,t.variantId),index("inventory_variant_idx").on(t.variantId,t.createdAt)]);
export const serviceEntitlement=sqliteTable("service_entitlement",{id:text("id").primaryKey().notNull(),orderId:text("order_id").notNull().references(()=>salesOrder.id,{onDelete:"restrict"}),contactId:text("contact_id").notNull().references(()=>contact.id,{onDelete:"restrict"}),variantId:text("variant_id").notNull().references(()=>productVariant.id,{onDelete:"restrict"}),label:text("label").notNull(),granted:integer("granted").notNull(),remaining:integer("remaining").notNull(),used:integer("used").notNull().default(0),revoked:integer("revoked").notNull().default(0),revision:integer("revision").notNull().default(0),expiresAt:integer("expires_at",{mode:"timestamp_ms"}),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},t=>[uniqueIndex("entitlement_order_variant_unique").on(t.orderId,t.variantId),index("entitlement_contact_idx").on(t.contactId),check("entitlement_balance",sql`${t.granted}>0 and ${t.remaining}>=0 and ${t.used}>=0 and ${t.revoked}>=0 and ${t.granted}=${t.remaining}+${t.used}+${t.revoked}`)]);
export const entitlementMovement=sqliteTable("entitlement_movement",{id:text("id").primaryKey().notNull(),entitlementId:text("entitlement_id").notNull().references(()=>serviceEntitlement.id,{onDelete:"restrict"}),kind:text("kind",{enum:["grant","use","restore","revoke"]}).notNull(),quantity:integer("quantity").notNull(),operationKey:text("operation_key").notNull(),fingerprint:text("fingerprint").notNull(),resultJson:text("result_json").notNull().default("{}"),actorId:text("actor_id").notNull(),reason:text("reason").notNull(),businessDate:text("business_date").notNull(),timeZone:text("time_zone").notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},t=>[uniqueIndex("entitlement_operation_unique").on(t.operationKey,t.entitlementId)]);

export const taskRecord=sqliteTable("task_record",{activityId:text("activity_id").primaryKey().notNull().references(()=>activity.id,{onDelete:"cascade"}),assigneeMembershipId:text("assignee_membership_id").references(()=>singletonMembership.userId,{onDelete:"set null"}),currentCycle:integer("current_cycle").notNull().default(1),dueAt:integer("due_at",{mode:"timestamp_ms"}),completedAt:integer("completed_at",{mode:"timestamp_ms"}),overdueBreached:integer("overdue_breached",{mode:"boolean"}).notNull().default(false),revision:integer("revision").notNull().default(0),...timestamps},t=>[index("task_assignee_due_idx").on(t.assigneeMembershipId,t.completedAt,t.dueAt)]);
export const taskCycle=sqliteTable("task_cycle",{taskId:text("task_id").notNull().references(()=>taskRecord.activityId,{onDelete:"cascade"}),cycle:integer("cycle").notNull(),openedAt:integer("opened_at",{mode:"timestamp_ms"}).notNull(),openedBy:text("opened_by").notNull().references(()=>user.id,{onDelete:"restrict"}),dueAt:integer("due_at",{mode:"timestamp_ms"}),completedAt:integer("completed_at",{mode:"timestamp_ms"}),overdueBreached:integer("overdue_breached",{mode:"boolean"}).notNull().default(false),reopenReason:text("reopen_reason")},t=>[primaryKey({columns:[t.taskId,t.cycle]})]);
export const taskDeadlineHistory=sqliteTable("task_deadline_history",{id:text("id").primaryKey().notNull(),taskId:text("task_id").notNull().references(()=>taskRecord.activityId,{onDelete:"cascade"}),cycle:integer("cycle").notNull(),previousDueAt:integer("previous_due_at",{mode:"timestamp_ms"}),nextDueAt:integer("next_due_at",{mode:"timestamp_ms"}),reason:text("reason").notNull(),actorId:text("actor_id").notNull().references(()=>user.id,{onDelete:"restrict"}),operationKey:text("operation_key").notNull().unique(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()});
export const taskOperation=sqliteTable("task_operation",{id:text("id").primaryKey().notNull(),taskId:text("task_id").notNull().references(()=>taskRecord.activityId,{onDelete:"cascade"}),action:text("action",{enum:["complete","reopen","deadline","assign"]}).notNull(),fingerprint:text("fingerprint").notNull(),resultJson:text("result_json").notNull(),actorId:text("actor_id").notNull().references(()=>user.id,{onDelete:"restrict"}),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()});

export const appointment=sqliteTable("appointment",{id:text("id").primaryKey().notNull(),subject:text("subject").notNull(),description:text("description"),startsAt:integer("starts_at",{mode:"timestamp_ms"}).notNull(),endsAt:integer("ends_at",{mode:"timestamp_ms"}).notNull(),timeZone:text("time_zone").notNull(),contactId:text("contact_id").references(()=>contact.id,{onDelete:"set null"}),companyId:text("company_id").references(()=>company.id,{onDelete:"set null"}),serviceVariantId:text("service_variant_id").references(()=>productVariant.id,{onDelete:"set null"}),organizerMembershipId:text("organizer_membership_id").notNull().references(()=>singletonMembership.userId,{onDelete:"restrict"}),creatorUserId:text("creator_user_id").notNull().references(()=>user.id,{onDelete:"restrict"}),status:text("status",{enum:["scheduled","completed","cancelled"]}).notNull().default("scheduled"),reminderEnabled:integer("reminder_enabled",{mode:"boolean"}).notNull().default(true),reminderOffsetMinutes:integer("reminder_offset_minutes").notNull().default(15),conflictAcknowledgedAt:integer("conflict_acknowledged_at",{mode:"timestamp_ms"}),conflictAcknowledgedBy:text("conflict_acknowledged_by").references(()=>user.id,{onDelete:"restrict"}),revision:integer("revision").notNull().default(0),...timestamps},t=>[index("appointment_range_idx").on(t.startsAt,t.endsAt,t.status),index("appointment_organizer_idx").on(t.organizerMembershipId,t.startsAt)]);
export const appointmentParticipant=sqliteTable("appointment_participant",{appointmentId:text("appointment_id").notNull().references(()=>appointment.id,{onDelete:"cascade"}),membershipId:text("membership_id").notNull().references(()=>singletonMembership.userId,{onDelete:"restrict"})},t=>[primaryKey({columns:[t.appointmentId,t.membershipId]}),index("appointment_participant_member_idx").on(t.membershipId,t.appointmentId)]);
export const appointmentOperation=sqliteTable("appointment_operation",{id:text("id").primaryKey().notNull(),appointmentId:text("appointment_id").notNull().references(()=>appointment.id,{onDelete:"cascade"}),action:text("action",{enum:["create","update","complete","cancel"]}).notNull(),fingerprint:text("fingerprint").notNull(),resultJson:text("result_json").notNull(),actorId:text("actor_id").notNull().references(()=>user.id,{onDelete:"restrict"}),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()});

export const ticketSequence=sqliteTable("ticket_sequence",{id:text("id").primaryKey().notNull(),nextNumber:integer("next_number").notNull()});
export const ticket=sqliteTable("ticket",{id:text("id").primaryKey().notNull(),number:integer("number").notNull().unique(),subject:text("subject").notNull(),description:text("description"),priority:text("priority",{enum:["low","normal","high","urgent"]}).notNull(),category:text("category"),source:text("source").notNull(),contactId:text("contact_id").references(()=>contact.id,{onDelete:"set null"}),companyId:text("company_id").references(()=>company.id,{onDelete:"set null"}),assigneeMembershipId:text("assignee_membership_id").references(()=>singletonMembership.userId,{onDelete:"set null"}),creatorUserId:text("creator_user_id").notNull().references(()=>user.id,{onDelete:"restrict"}),status:text("status",{enum:["open","resolved"]}).notNull().default("open"),currentCycle:integer("current_cycle").notNull().default(1),dueAt:integer("due_at",{mode:"timestamp_ms"}),firstResponseAt:integer("first_response_at",{mode:"timestamp_ms"}),overdueBreached:integer("overdue_breached",{mode:"boolean"}).notNull().default(false),revision:integer("revision").notNull().default(0),...timestamps},t=>[index("ticket_status_due_idx").on(t.status,t.dueAt),index("ticket_assignee_idx").on(t.assigneeMembershipId,t.status,t.dueAt),index("ticket_contact_idx").on(t.contactId,t.createdAt)]);
export const ticketCollaborator=sqliteTable("ticket_collaborator",{ticketId:text("ticket_id").notNull().references(()=>ticket.id,{onDelete:"cascade"}),membershipId:text("membership_id").notNull().references(()=>singletonMembership.userId,{onDelete:"restrict"})},t=>[primaryKey({columns:[t.ticketId,t.membershipId]})]);
export const ticketCycle=sqliteTable("ticket_cycle",{ticketId:text("ticket_id").notNull().references(()=>ticket.id,{onDelete:"cascade"}),cycle:integer("cycle").notNull(),openedAt:integer("opened_at",{mode:"timestamp_ms"}).notNull(),openedBy:text("opened_by").notNull().references(()=>user.id,{onDelete:"restrict"}),dueAt:integer("due_at",{mode:"timestamp_ms"}),resolvedAt:integer("resolved_at",{mode:"timestamp_ms"}),overdueBreached:integer("overdue_breached",{mode:"boolean"}).notNull().default(false),reopenReason:text("reopen_reason"),firstResponseAt:integer("first_response_at",{mode:"timestamp_ms"})},t=>[primaryKey({columns:[t.ticketId,t.cycle]})]);
export const ticketEvent=sqliteTable("ticket_event",{id:text("id").primaryKey().notNull(),ticketId:text("ticket_id").notNull().references(()=>ticket.id,{onDelete:"cascade"}),cycle:integer("cycle").notNull(),action:text("action",{enum:["created","response","deadline","assign","resolve","reopen","collaborators"]}).notNull(),content:text("content"),previousDueAt:integer("previous_due_at",{mode:"timestamp_ms"}),nextDueAt:integer("next_due_at",{mode:"timestamp_ms"}),actorId:text("actor_id").notNull().references(()=>user.id,{onDelete:"restrict"}),operationKey:text("operation_key").notNull().unique(),fingerprint:text("fingerprint").notNull(),resultJson:text("result_json").notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},t=>[index("ticket_event_ticket_idx").on(t.ticketId,t.createdAt)]);

export const notificationPreference=sqliteTable("notification_preference",{membershipId:text("membership_id").primaryKey().notNull().references(()=>singletonMembership.userId,{onDelete:"cascade"}),inAppEnabled:integer("in_app_enabled",{mode:"boolean"}).notNull().default(true),browserEnabled:integer("browser_enabled",{mode:"boolean"}).notNull().default(false),appointmentOffsetMinutes:integer("appointment_offset_minutes").notNull().default(15),taskOffsetMinutes:integer("task_offset_minutes").notNull().default(0),ticketOffsetMinutes:integer("ticket_offset_minutes").notNull().default(0),contractOffsetMinutes:integer("contract_offset_minutes").notNull().default(10080),revision:integer("revision").notNull().default(0),updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull()});
export const notification=sqliteTable("notification",{id:text("id").primaryKey().notNull(),recipientMembershipId:text("recipient_membership_id").notNull().references(()=>singletonMembership.userId,{onDelete:"cascade"}),kind:text("kind",{enum:["appointment","task","ticket","contract"]}).notNull(),sourceId:text("source_id").notNull(),sourceRevision:integer("source_revision").notNull(),dueAt:integer("due_at",{mode:"timestamp_ms"}).notNull(),title:text("title").notNull(),body:text("body"),targetUrl:text("target_url").notNull(),dedupeKey:text("dedupe_key").notNull().unique(),state:text("state",{enum:["pending","delivered","failed","cancelled"]}).notNull().default("pending"),attempts:integer("attempts").notNull().default(0),nextAttemptAt:integer("next_attempt_at",{mode:"timestamp_ms"}),lastError:text("last_error"),browserDeliveredAt:integer("browser_delivered_at",{mode:"timestamp_ms"}),readAt:integer("read_at",{mode:"timestamp_ms"}),...timestamps},t=>[index("notification_recipient_due_idx").on(t.recipientMembershipId,t.state,t.dueAt)]);

export const contract=sqliteTable("contract",{id:text("id").primaryKey().notNull(),name:text("name").notNull(),companyId:text("company_id").notNull().references(()=>company.id,{onDelete:"restrict"}),contactId:text("contact_id").references(()=>contact.id,{onDelete:"restrict"}),dealId:text("deal_id").references(()=>deal.id,{onDelete:"restrict"}),orderId:text("order_id").references(()=>salesOrder.id,{onDelete:"restrict"}),valueMinor:integer("value_minor"),currency:text("currency").notNull(),effectiveAt:integer("effective_at",{mode:"timestamp_ms"}),expiresAt:integer("expires_at",{mode:"timestamp_ms"}),ownerMembershipId:text("owner_membership_id").notNull().references(()=>singletonMembership.userId,{onDelete:"restrict"}),creatorUserId:text("creator_user_id").notNull().references(()=>user.id,{onDelete:"restrict"}),status:text("status",{enum:["draft","active","completed","terminated","expired"]}).notNull().default("draft"),revision:integer("revision").notNull().default(0),archivedAt:integer("archived_at",{mode:"timestamp_ms"}),...timestamps},t=>[index("contract_company_idx").on(t.companyId,t.status,t.expiresAt),index("contract_owner_idx").on(t.ownerMembershipId,t.status,t.expiresAt)]);
export const contractParty=sqliteTable("contract_party",{contractId:text("contract_id").notNull().references(()=>contract.id,{onDelete:"restrict"}),partyId:text("party_id").notNull(),companyId:text("company_id").references(()=>company.id,{onDelete:"restrict"}),contactId:text("contact_id").references(()=>contact.id,{onDelete:"restrict"}),role:text("role").notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},t=>[primaryKey({columns:[t.contractId,t.partyId]})]);
export const contractVersion=sqliteTable("contract_version",{contractId:text("contract_id").notNull().references(()=>contract.id,{onDelete:"restrict"}),version:integer("version").notNull(),snapshotJson:text("snapshot_json").notNull(),reason:text("reason").notNull(),actorId:text("actor_id").notNull().references(()=>user.id,{onDelete:"restrict"}),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()},t=>[primaryKey({columns:[t.contractId,t.version]})]);
export const contractOperation=sqliteTable("contract_operation",{operationKey:text("operation_key").primaryKey().notNull(),contractId:text("contract_id").notNull().references(()=>contract.id,{onDelete:"restrict"}),fingerprint:text("fingerprint").notNull(),resultJson:text("result_json").notNull(),actorId:text("actor_id").notNull().references(()=>user.id,{onDelete:"restrict"}),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull()});
export const contractDocument=sqliteTable("contract_document",{id:text("id").primaryKey().notNull(),contractId:text("contract_id").notNull().references(()=>contract.id,{onDelete:"restrict"}),objectKey:text("object_key").notNull().unique(),fileName:text("file_name").notNull(),size:integer("size").notNull(),status:text("status",{enum:["pending","ready","failed","cleaning"]}).notNull(),uploaderId:text("uploader_id").notNull().references(()=>user.id,{onDelete:"restrict"}),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(),readyAt:integer("ready_at",{mode:"timestamp_ms"}),cleanupAttemptedAt:integer("cleanup_attempted_at",{mode:"timestamp_ms"})});
export const review=sqliteTable("review",{id:text("id").primaryKey().notNull(),source:text("source").notNull(),eventId:text("event_id").notNull(),companyId:text("company_id").references(()=>company.id,{onDelete:"restrict"}),contactId:text("contact_id").references(()=>contact.id,{onDelete:"restrict"}),content:text("content").notNull(),rating:integer("rating").notNull(),tagsJson:text("tags_json").notNull().default("[]"),creatorUserId:text("creator_user_id").notNull().references(()=>user.id,{onDelete:"restrict"}),fingerprint:text("fingerprint").notNull(),revision:integer("revision").notNull().default(0),archivedAt:integer("archived_at",{mode:"timestamp_ms"}),...timestamps},t=>[uniqueIndex("review_source_event_unique").on(t.source,t.eventId),index("review_customer_idx").on(t.companyId,t.contactId,t.createdAt)]);
export const reportingGoal=sqliteTable("reporting_goal",{id:text("id").primaryKey().notNull(),scopeKind:text("scope_kind",{enum:["workspace","member","branch"]}).notNull(),scopeId:text("scope_id").notNull().default(""),periodFrom:text("period_from").notNull(),periodTo:text("period_to").notNull(),currency:text("currency").notNull(),amountMinor:integer("amount_minor").notNull(),creatorUserId:text("creator_user_id").notNull().references(()=>user.id,{onDelete:"restrict"}),updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull()},t=>[uniqueIndex("reporting_goal_scope_unique").on(t.scopeKind,t.scopeId,t.periodFrom,t.periodTo,t.currency),index("reporting_goal_period_idx").on(t.periodFrom,t.periodTo,t.scopeKind,t.scopeId)]);
