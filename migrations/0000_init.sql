CREATE TABLE `access_grant` (
	`profile_id` text NOT NULL,
	`permission` text NOT NULL,
	PRIMARY KEY(`profile_id`, `permission`),
	FOREIGN KEY (`profile_id`) REFERENCES `access_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `access_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_profile_name_unique` ON `access_profile` (`name`);--> statement-breakpoint
CREATE TABLE `action_operation_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`authorized` integer NOT NULL,
	CONSTRAINT "action_permission_required" CHECK("action_operation_guard"."authorized" = 1)
);
--> statement-breakpoint
CREATE TABLE `branch` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branch_active_name_unique` ON `branch` (`name`) WHERE "branch"."archived_at" IS NULL;--> statement-breakpoint
CREATE TABLE `branch_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`default_branch_id` text NOT NULL,
	FOREIGN KEY (`default_branch_id`) REFERENCES `branch`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "branch_setting_singleton" CHECK("branch_setting"."id" = 'settings')
);
--> statement-breakpoint
CREATE TABLE `member_branch` (
	`membership_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`membership_id`, `branch_id`),
	FOREIGN KEY (`membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `member_branch_branch_idx` ON `member_branch` (`branch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_branch_primary_unique` ON `member_branch` (`membership_id`) WHERE "member_branch"."is_primary" = 1;--> statement-breakpoint
CREATE TABLE `member_operation_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`authorized` integer NOT NULL,
	CONSTRAINT "member_operation_guard_authorized_check" CHECK("member_operation_guard"."authorized" = 1)
);
--> statement-breakpoint
CREATE TABLE `membership_access` (
	`membership_id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	FOREIGN KEY (`membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `access_profile`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `membership_access_profile_idx` ON `membership_access` (`profile_id`);--> statement-breakpoint
CREATE TABLE `operation_condition_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`authorized` integer NOT NULL,
	CONSTRAINT "operation_conflict" CHECK("operation_condition_guard"."authorized" = 1)
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`issuer` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_account_id_unique` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `singleton_membership` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "singleton_membership_role_check" CHECK("singleton_membership"."role" in ('owner', 'member')),
	CONSTRAINT "singleton_membership_status_check" CHECK("singleton_membership"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX `singleton_membership_status_idx` ON `singleton_membership` (`status`);--> statement-breakpoint
CREATE TABLE `singleton_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`owner_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `company` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`website` text,
	`description` text,
	`industry` text,
	`city` text,
	`country_code` text,
	`phone` text,
	`email` text,
	`owner_membership_id` text,
	`last_activity_at` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `company_name_idx` ON `company` (`name`);--> statement-breakpoint
CREATE INDEX `company_owner_idx` ON `company` (`owner_membership_id`);--> statement-breakpoint
CREATE INDEX `company_last_activity_idx` ON `company` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `company_archived_idx` ON `company` (`archived_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `company_active_domain_unique` ON `company` (`domain`) WHERE "company"."archived_at" is null and "company"."domain" is not null;--> statement-breakpoint
CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`email` text,
	`phone` text,
	`normalized_phone` text,
	`title` text,
	`birth_date` text,
	`gender` text,
	`company_id` text,
	`owner_membership_id` text,
	`last_activity_at` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contact_name_idx` ON `contact` (`first_name`,`last_name`);--> statement-breakpoint
CREATE INDEX `contact_company_idx` ON `contact` (`company_id`);--> statement-breakpoint
CREATE INDEX `contact_owner_idx` ON `contact` (`owner_membership_id`);--> statement-breakpoint
CREATE INDEX `contact_last_activity_idx` ON `contact` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `contact_archived_idx` ON `contact` (`archived_at`);--> statement-breakpoint
CREATE INDEX `contact_normalized_phone_idx` ON `contact` (`normalized_phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_active_email_unique` ON `contact` (`email`) WHERE "contact"."archived_at" is null and "contact"."email" is not null;--> statement-breakpoint
CREATE TABLE `deal` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`company_id` text,
	`owner_membership_id` text,
	`stage_id` text NOT NULL,
	`stage_changed_at` integer NOT NULL,
	`amount_minor` integer,
	`money_revision` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`expected_close_at` integer,
	`closed_at` integer,
	`closed_reason` text,
	`base_amount_minor` integer,
	`base_currency` text,
	`fx_rate_scaled` integer,
	`fx_rate_at` integer,
	`last_activity_at` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`stage_id`) REFERENCES `deal_stage`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "deal_amount_minor_check" CHECK("deal"."amount_minor" is null or "deal"."amount_minor" >= 0),
	CONSTRAINT "deal_currency_check" CHECK(length("deal"."currency") = 3)
);
--> statement-breakpoint
CREATE INDEX `deal_company_idx` ON `deal` (`company_id`);--> statement-breakpoint
CREATE INDEX `deal_owner_idx` ON `deal` (`owner_membership_id`);--> statement-breakpoint
CREATE INDEX `deal_stage_idx` ON `deal` (`stage_id`);--> statement-breakpoint
CREATE INDEX `deal_close_idx` ON `deal` (`expected_close_at`);--> statement-breakpoint
CREATE INDEX `deal_last_activity_idx` ON `deal` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `deal_currency_idx` ON `deal` (`currency`);--> statement-breakpoint
CREATE INDEX `deal_archived_idx` ON `deal` (`archived_at`);--> statement-breakpoint
CREATE TABLE `deal_contact` (
	`deal_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`role` text,
	PRIMARY KEY(`deal_id`, `contact_id`),
	FOREIGN KEY (`deal_id`) REFERENCES `deal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deal_contact_contact_idx` ON `deal_contact` (`contact_id`);--> statement-breakpoint
CREATE TABLE `deal_stage` (
	`id` text PRIMARY KEY NOT NULL,
	`label_key` text NOT NULL,
	`label` text,
	`archived_at` integer,
	`position` integer NOT NULL,
	`closed_state` text DEFAULT 'open' NOT NULL,
	CONSTRAINT "deal_stage_closed_state_check" CHECK("deal_stage"."closed_state" in ('open', 'won', 'lost'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deal_stage_position_unique` ON `deal_stage` (`position`);--> statement-breakpoint
CREATE TABLE `activity` (
	`order_id` text,
	`product_id` text,
	`lead_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`subject` text,
	`content` text,
	`occurred_at` integer,
	`due_at` integer,
	`completed_at` integer,
	`company_id` text,
	`contact_id` text,
	`deal_id` text,
	`author_user_id` text NOT NULL,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `sales_order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deal_id`) REFERENCES `deal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "activity_type_check" CHECK("activity"."type" in ('note', 'call', 'meeting', 'task', 'stage_change')),
	CONSTRAINT "activity_anchor_check" CHECK((("activity"."company_id" is not null) + ("activity"."contact_id" is not null) + ("activity"."deal_id" is not null) + ("activity"."lead_id" is not null) + ("activity"."product_id" is not null) + ("activity"."order_id" is not null)) >= 1),
	CONSTRAINT "activity_metadata_json_check" CHECK("activity"."metadata_json" is null or json_valid("activity"."metadata_json"))
);
--> statement-breakpoint
CREATE INDEX `activity_order_created_idx` ON `activity` (`order_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_product_created_idx` ON `activity` (`product_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_lead_created_idx` ON `activity` (`lead_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_company_created_idx` ON `activity` (`company_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_contact_created_idx` ON `activity` (`contact_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_deal_created_idx` ON `activity` (`deal_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_due_idx` ON `activity` (`due_at`);--> statement-breakpoint
CREATE INDEX `activity_author_idx` ON `activity` (`author_user_id`);--> statement-breakpoint
CREATE TABLE `activity_visibility` (
	`activity_id` text NOT NULL,
	`membership_id` text NOT NULL,
	PRIMARY KEY(`activity_id`, `membership_id`),
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_visibility_member_idx` ON `activity_visibility` (`membership_id`);--> statement-breakpoint
CREATE TABLE `crm_file` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`entity` text NOT NULL,
	`record_id` text NOT NULL,
	`field_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`file_name` text NOT NULL,
	`size` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`ready_at` integer,
	`cleanup_attempted_at` integer,
	CONSTRAINT "crm_file_entity_check" CHECK("crm_file"."entity" in ('company','contact','deal','lead','product','order')),
	CONSTRAINT "crm_file_status_check" CHECK("crm_file"."status" in ('pending','ready','failed','cleaning')),
	CONSTRAINT "crm_file_name_check" CHECK(length("crm_file"."file_name") between 1 and 255),
	CONSTRAINT "crm_file_size_check" CHECK(typeof("crm_file"."size") = 'integer' and "crm_file"."size" between 0 and 10485760),
	CONSTRAINT "crm_file_ready_check" CHECK(("crm_file"."status" = 'ready' and "crm_file"."ready_at" is not null) or ("crm_file"."status" != 'ready' and "crm_file"."ready_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_file_object_key_unique` ON `crm_file` (`object_key`);--> statement-breakpoint
CREATE INDEX `crm_file_anchor_idx` ON `crm_file` (`entity`,`record_id`,`field_id`);--> statement-breakpoint
CREATE INDEX `crm_file_cleanup_idx` ON `crm_file` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `crm_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`reporting_currency` text DEFAULT 'USD' NOT NULL,
	`time_zone` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`country_code` text DEFAULT 'VN' NOT NULL,
	`calendar_revision` integer DEFAULT 0 NOT NULL,
	`active_conversion_version` text DEFAULT 'initial' NOT NULL,
	`pending_job_id` text,
	`rates_revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "crm_setting_singleton_check" CHECK("crm_setting"."id" = 'settings'),
	CONSTRAINT "crm_setting_currency_check" CHECK(length("crm_setting"."reporting_currency") = 3)
);
--> statement-breakpoint
CREATE TABLE `currency_job` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target_currency` text NOT NULL,
	`expected_version` text NOT NULL,
	`target_version` text NOT NULL,
	`rates_json` text NOT NULL,
	`cursor` text,
	`total` integer NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`converted` integer DEFAULT 0 NOT NULL,
	`missing` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_field_definition` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`config_json` text,
	`deleted_at` integer,
	`required` integer DEFAULT false NOT NULL,
	`show_on_sheet` integer DEFAULT true NOT NULL,
	`show_on_table` integer DEFAULT false NOT NULL,
	`show_on_filter` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "custom_field_entity_check" CHECK("custom_field_definition"."entity" in ('company', 'contact', 'deal', 'lead', 'product', 'order')),
	CONSTRAINT "custom_field_type_check" CHECK("custom_field_definition"."type" in ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer', 'formula', 'file')),
	CONSTRAINT "custom_field_config_json_check" CHECK("custom_field_definition"."config_json" is null or json_valid("custom_field_definition"."config_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`,`key`);--> statement-breakpoint
CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`,`position`);--> statement-breakpoint
CREATE TABLE `custom_field_option` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`field_id`) REFERENCES `custom_field_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`,`position`);--> statement-breakpoint
CREATE TABLE `custom_field_value` (
	`order_id` text,
	`product_id` text,
	`lead_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`company_id` text,
	`contact_id` text,
	`deal_id` text,
	`json_value` text,
	`customer_reference_id` text,
	`text_value` text,
	`number_value` integer,
	`date_value` integer,
	`boolean_value` integer,
	`option_id` text,
	`user_membership_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `sales_order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `custom_field_definition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deal_id`) REFERENCES `deal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_reference_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`option_id`) REFERENCES `custom_field_option`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "custom_field_json_value_check" CHECK("custom_field_value"."json_value" is null or json_valid("custom_field_value"."json_value")),
	CONSTRAINT "custom_field_value_one_record_check" CHECK((("custom_field_value"."company_id" is not null) + ("custom_field_value"."contact_id" is not null) + ("custom_field_value"."deal_id" is not null) + ("custom_field_value"."lead_id" is not null) + ("custom_field_value"."product_id" is not null) + ("custom_field_value"."order_id" is not null)) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`,`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`,`contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`,`deal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_lead_unique` ON `custom_field_value` (`field_id`,`lead_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_order_unique` ON `custom_field_value` (`field_id`,`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_product_unique` ON `custom_field_value` (`field_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`,`text_value`);--> statement-breakpoint
CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`,`number_value`);--> statement-breakpoint
CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`,`date_value`);--> statement-breakpoint
CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);--> statement-breakpoint
CREATE INDEX `custom_field_value_customer_idx` ON `custom_field_value` (`customer_reference_id`);--> statement-breakpoint
CREATE TABLE `deal_conversion` (
	`version` text NOT NULL,
	`deal_id` text NOT NULL,
	`money_revision` integer NOT NULL,
	`amount_minor` integer,
	`currency` text NOT NULL,
	`base_amount_minor` integer,
	`base_currency` text,
	`fx_rate` text,
	`fx_rate_at` integer,
	`rate_source` text,
	PRIMARY KEY(`version`, `deal_id`),
	FOREIGN KEY (`deal_id`) REFERENCES `deal`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deal_conversion_amount_idx` ON `deal_conversion` (`version`,`base_amount_minor`,`deal_id`);--> statement-breakpoint
CREATE TABLE `deal_stage_catalog_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "deal_stage_catalog_singleton" CHECK("deal_stage_catalog_revision"."id" = 'stages'),
	CONSTRAINT "deal_stage_catalog_revision_nonnegative" CHECK("deal_stage_catalog_revision"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `exchange_rate` (
	`id` text PRIMARY KEY NOT NULL,
	`base_currency` text NOT NULL,
	`quote_currency` text NOT NULL,
	`rate` text NOT NULL,
	`as_of` integer NOT NULL,
	`source` text NOT NULL,
	`provider` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "exchange_rate_value_check" CHECK(length("exchange_rate"."rate") between 1 and 21),
	CONSTRAINT "exchange_rate_source_check" CHECK("exchange_rate"."source" in ('fetched', 'manual')),
	CONSTRAINT "exchange_rate_currency_check" CHECK(length("exchange_rate"."base_currency") = 3 and length("exchange_rate"."quote_currency") = 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rate_pair_source_unique` ON `exchange_rate` (`base_currency`,`quote_currency`,`source`);--> statement-breakpoint
CREATE INDEX `exchange_rate_pair_idx` ON `exchange_rate` (`base_currency`,`quote_currency`);--> statement-breakpoint
CREATE TABLE `field_configuration_revision` (
	`entity` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `field_conversion_guard` (
	`field_id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`target_type` text NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `custom_field_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `field_conversion_preview` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text NOT NULL,
	`target_type` text NOT NULL,
	`config_json` text NOT NULL,
	`configuration_revision` integer NOT NULL,
	`value_revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `custom_field_definition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "field_conversion_preview_json_check" CHECK(json_valid("field_conversion_preview"."config_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `field_conversion_preview_owner_idx` ON `field_conversion_preview` (`field_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `field_conversion_preview_expiry_idx` ON `field_conversion_preview` (`expires_at`);--> statement-breakpoint
CREATE TABLE `field_value_revision` (
	`field_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `custom_field_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `module_setting` (
	`entity` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "module_setting_entity_check" CHECK("module_setting"."entity" in ('company','contact','deal','lead','product','order','contract','review')),
	CONSTRAINT "module_setting_enabled_check" CHECK("module_setting"."enabled" in (0,1)),
	CONSTRAINT "module_setting_revision_check" CHECK(typeof("module_setting"."revision") = 'integer' and "module_setting"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `record_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "record_draft_entity" CHECK("record_draft"."entity" in ('company','contact','deal','lead','product','order')),
	CONSTRAINT "record_draft_expiry" CHECK("record_draft"."expires_at" > "record_draft"."created_at")
);
--> statement-breakpoint
CREATE TABLE `record_layout` (
	`entity` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`fields_json` text DEFAULT 'null' NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "record_layout_entity" CHECK("record_layout"."entity" in ('company','contact','deal','lead','product','order')),
	CONSTRAINT "record_layout_revision" CHECK("record_layout"."revision" >= 0),
	CONSTRAINT "record_layout_json" CHECK(json_valid("record_layout"."fields_json"))
);
--> statement-breakpoint
CREATE TABLE `saved_view` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`name` text NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`state_json` text NOT NULL,
	`creator_user_id` text,
	`owner_membership_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "saved_view_entity_check" CHECK("saved_view"."entity" in ('company', 'contact', 'deal', 'lead', 'product', 'order')),
	CONSTRAINT "saved_view_state_json_check" CHECK(json_valid("saved_view"."state_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_view_creator_name_unique` ON `saved_view` (`entity`,`creator_user_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `saved_view_owner_name_unique` ON `saved_view` (`entity`,`owner_membership_id`,`name`);--> statement-breakpoint
CREATE INDEX `saved_view_entity_shared_idx` ON `saved_view` (`entity`,`shared`);--> statement-breakpoint
CREATE TABLE `saved_view_default` (
	`user_id` text NOT NULL,
	`entity` text NOT NULL,
	`view_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `entity`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`view_id`) REFERENCES `saved_view`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "saved_view_default_entity_check" CHECK("saved_view_default"."entity" in ('company','contact','deal','lead','product','order'))
);
--> statement-breakpoint
CREATE INDEX `saved_view_default_view_idx` ON `saved_view_default` (`view_id`);--> statement-breakpoint
CREATE TABLE `lead` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`email` text,
	`phone` text,
	`normalized_email` text,
	`normalized_phone` text,
	`title` text,
	`description` text,
	`company_id` text,
	`source_id` text DEFAULT 'manual' NOT NULL,
	`status_id` text DEFAULT 'new' NOT NULL,
	`rejection_reason` text,
	`owner_membership_id` text,
	`creator_user_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`last_activity_at` integer,
	`archived_at` integer,
	`converted_at` integer,
	`converted_contact_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `lead_source`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`status_id`) REFERENCES `lead_status`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`converted_contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "lead_revision" CHECK("lead"."revision" >= 0),
	CONSTRAINT "lead_conversion_state" CHECK(("lead"."converted_at" is null and "lead"."converted_contact_id" is null and "lead"."status_id" != 'converted') or ("lead"."converted_at" is not null and "lead"."converted_contact_id" is not null and "lead"."status_id" = 'converted'))
);
--> statement-breakpoint
CREATE INDEX `lead_source_idx` ON `lead` (`source_id`);--> statement-breakpoint
CREATE INDEX `lead_status_idx` ON `lead` (`status_id`);--> statement-breakpoint
CREATE INDEX `lead_owner_idx` ON `lead` (`owner_membership_id`);--> statement-breakpoint
CREATE INDEX `lead_email_idx` ON `lead` (`normalized_email`);--> statement-breakpoint
CREATE INDEX `lead_phone_idx` ON `lead` (`normalized_phone`);--> statement-breakpoint
CREATE INDEX `lead_created_idx` ON `lead` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `lead_collaborator` (
	`lead_id` text NOT NULL,
	`membership_id` text NOT NULL,
	PRIMARY KEY(`lead_id`, `membership_id`),
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_collaborator_member_idx` ON `lead_collaborator` (`membership_id`,`lead_id`);--> statement-breakpoint
CREATE TABLE `lead_conversion` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`actor_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`mode` text NOT NULL,
	`lead_revision` integer NOT NULL,
	`mapping_revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`result_json` text NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "lead_conversion_mode" CHECK("lead_conversion"."mode" in ('create','link')),
	CONSTRAINT "lead_conversion_snapshot_json" CHECK(json_valid("lead_conversion"."snapshot_json")),
	CONSTRAINT "lead_conversion_result_json" CHECK(json_valid("lead_conversion"."result_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lead_conversion_lead_id_unique` ON `lead_conversion` (`lead_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lead_conversion_operation_key_unique` ON `lead_conversion` (`operation_key`);--> statement-breakpoint
CREATE INDEX `lead_conversion_contact_completed_idx` ON `lead_conversion` (`contact_id`,"completed_at" desc,`lead_id`);--> statement-breakpoint
CREATE TABLE `lead_mapping` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`mappings_json` text DEFAULT '[]' NOT NULL,
	`auto_order` integer DEFAULT false NOT NULL,
	`auto_deal` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "lead_mapping_singleton" CHECK("lead_mapping"."id" = 'contact'),
	CONSTRAINT "lead_mapping_revision" CHECK("lead_mapping"."revision" >= 0),
	CONSTRAINT "lead_mapping_json" CHECK(json_valid("lead_mapping"."mappings_json")),
	CONSTRAINT "lead_mapping_order_boolean" CHECK("lead_mapping"."auto_order" in (0,1)),
	CONSTRAINT "lead_mapping_deal_boolean" CHECK("lead_mapping"."auto_deal" in (0,1))
);
--> statement-breakpoint
CREATE TABLE `lead_settings_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lead_settings_singleton" CHECK("lead_settings_revision"."id" = 'settings'),
	CONSTRAINT "lead_settings_revision" CHECK("lead_settings_revision"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `lead_source` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text,
	`label_key` text NOT NULL,
	`position` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lead_source_position_unique` ON `lead_source` (`position`);--> statement-breakpoint
CREATE TABLE `lead_status` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text,
	`label_key` text NOT NULL,
	`position` integer NOT NULL,
	`archived_at` integer,
	`meaning` text NOT NULL,
	`requires_reason` integer DEFAULT false NOT NULL,
	CONSTRAINT "lead_status_meaning" CHECK("lead_status"."meaning" in ('working','rejected','converted')),
	CONSTRAINT "lead_converted_status" CHECK(("lead_status"."meaning" = 'converted') = ("lead_status"."id" = 'converted')),
	CONSTRAINT "lead_requires_reason" CHECK("lead_status"."requires_reason" in (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lead_status_position_unique` ON `lead_status` (`position`);--> statement-breakpoint
CREATE TABLE `product` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category_id` text,
	`owner_membership_id` text,
	`creator_user_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`last_activity_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `product_category`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "product_kind" CHECK("product"."kind" in ('product','service','package')),
	CONSTRAINT "product_name" CHECK(length(trim("product"."name")) between 1 and 200),
	CONSTRAINT "product_revision" CHECK("product"."revision">=0)
);
--> statement-breakpoint
CREATE INDEX `product_category_idx` ON `product` (`category_id`);--> statement-breakpoint
CREATE INDEX `product_owner_idx` ON `product` (`owner_membership_id`);--> statement-breakpoint
CREATE INDEX `product_created_idx` ON `product` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `product_category` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	`archived_at` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_category_label" CHECK(length(trim("product_category"."label")) between 1 and 120),
	CONSTRAINT "product_category_revision" CHECK("product_category"."revision">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_category_position_unique` ON `product_category` (`position`);--> statement-breakpoint
CREATE TABLE `product_category_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_category_singleton" CHECK("product_category_revision"."id"='categories'),
	CONSTRAINT "product_category_catalog_revision" CHECK("product_category_revision"."revision">=0)
);
--> statement-breakpoint
CREATE TABLE `product_package_component` (
	`package_product_id` text NOT NULL,
	`component_variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`package_product_id`, `component_variant_id`),
	FOREIGN KEY (`package_product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`component_variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "package_component_quantity" CHECK(typeof("product_package_component"."quantity")='integer' and "product_package_component"."quantity" between 1 and 1000000)
);
--> statement-breakpoint
CREATE INDEX `package_component_variant_idx` ON `product_package_component` (`component_variant_id`);--> statement-breakpoint
CREATE TABLE `product_sku` (
	`normalized_sku` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_sku_variant_id_unique` ON `product_sku` (`variant_id`);--> statement-breakpoint
CREATE TABLE `product_variant` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`sku` text,
	`label` text NOT NULL,
	`price_minor` integer NOT NULL,
	`cost_minor` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`duration_minutes` integer,
	`attributes_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "product_variant_default" CHECK("product_variant"."is_default" in (0,1)),
	CONSTRAINT "product_variant_sku" CHECK("product_variant"."sku" is null or length(trim("product_variant"."sku")) between 1 and 100),
	CONSTRAINT "product_variant_label" CHECK(length(trim("product_variant"."label")) between 1 and 120),
	CONSTRAINT "product_variant_price" CHECK(typeof("product_variant"."price_minor")='integer' and "product_variant"."price_minor" between 0 and 99999999999999),
	CONSTRAINT "product_variant_cost" CHECK("product_variant"."cost_minor" is null or (typeof("product_variant"."cost_minor")='integer' and "product_variant"."cost_minor" between 0 and 99999999999999)),
	CONSTRAINT "product_variant_currency" CHECK("product_variant"."currency" in ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND')),
	CONSTRAINT "product_variant_duration" CHECK("product_variant"."duration_minutes" is null or (typeof("product_variant"."duration_minutes")='integer' and "product_variant"."duration_minutes" between 1 and 1000000)),
	CONSTRAINT "product_variant_attributes" CHECK(json_valid("product_variant"."attributes_json") and json_type("product_variant"."attributes_json")='object'),
	CONSTRAINT "product_variant_revision" CHECK("product_variant"."revision">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_default_variant_unique` ON `product_variant` (`product_id`) WHERE "product_variant"."is_default"=1;--> statement-breakpoint
CREATE INDEX `product_variant_product_idx` ON `product_variant` (`product_id`,`archived_at`,`id`);--> statement-breakpoint
CREATE TABLE `variant_fulfillment` (
	`variant_id` text PRIMARY KEY NOT NULL,
	`stock_tracked` integer DEFAULT false NOT NULL,
	`session_units` integer DEFAULT 0 NOT NULL,
	`expiry_days` integer,
	`on_hand` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "variant_fulfillment_stock" CHECK("variant_fulfillment"."stock_tracked" in (0,1)),
	CONSTRAINT "variant_fulfillment_units" CHECK("variant_fulfillment"."session_units" between 0 and 1000000),
	CONSTRAINT "variant_fulfillment_expiry" CHECK("variant_fulfillment"."expiry_days" between 1 and 36500),
	CONSTRAINT "variant_fulfillment_balance" CHECK(typeof("variant_fulfillment"."on_hand")='integer' and "variant_fulfillment"."on_hand" between 0 and 1000000000000)
);
--> statement-breakpoint
CREATE TABLE `entitlement_movement` (
	`id` text PRIMARY KEY NOT NULL,
	`entitlement_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`operation_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text NOT NULL,
	`business_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entitlement_id`) REFERENCES `service_entitlement`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entitlement_operation_unique` ON `entitlement_movement` (`operation_key`,`entitlement_id`);--> statement-breakpoint
CREATE TABLE `inventory_movement` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`order_id` text,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`operation_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text NOT NULL,
	`business_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `sales_order`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_operation_variant_unique` ON `inventory_movement` (`operation_key`,`variant_id`);--> statement-breakpoint
CREATE INDEX `inventory_variant_idx` ON `inventory_movement` (`variant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_adjustment` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`goods_minor` integer NOT NULL,
	`surcharge_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`reason` text NOT NULL,
	`business_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `sales_order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`operation_id`) REFERENCES `order_operation`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_adjustment_operation_id_unique` ON `order_adjustment` (`operation_id`);--> statement-breakpoint
CREATE TABLE `order_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`action` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`business_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `sales_order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_operation_result" CHECK(json_valid("order_operation"."result_json"))
);
--> statement-breakpoint
CREATE INDEX `order_operation_order_idx` ON `order_operation` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`actor_id` text NOT NULL,
	`business_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `sales_order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`operation_id`) REFERENCES `order_operation`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_payment_amount" CHECK(typeof("order_payment"."amount_minor")='integer' and "order_payment"."amount_minor" between 1 and 99999999999999),
	CONSTRAINT "order_payment_kind" CHECK("order_payment"."kind" in ('collection','refund'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_payment_operation_id_unique` ON `order_payment` (`operation_id`);--> statement-breakpoint
CREATE INDEX `order_payment_order_idx` ON `order_payment` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_sequence` (
	`id` text PRIMARY KEY NOT NULL,
	`next_number` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales_order` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`contact_id` text NOT NULL,
	`company_id` text,
	`lead_id` text,
	`deal_id` text,
	`owner_membership_id` text,
	`creator_user_id` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`source` text,
	`description` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	`creation_fingerprint` text NOT NULL,
	`creation_result_json` text NOT NULL,
	`lines_json` text NOT NULL,
	`goods_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`surcharge_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`original_minor` integer NOT NULL,
	`goods_remaining_minor` integer NOT NULL,
	`surcharge_remaining_minor` integer NOT NULL,
	`tax_remaining_minor` integer NOT NULL,
	`collected_minor` integer DEFAULT 0 NOT NULL,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`confirmed_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	`confirmed_date` text,
	`completed_date` text,
	`cancelled_date` text,
	`business_time_zone` text,
	`archived_at` integer,
	`last_activity_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`deal_id`) REFERENCES `deal`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sales_order_state" CHECK("sales_order"."state" in ('draft','confirmed','completed','cancelled')),
	CONSTRAINT "sales_order_lines" CHECK(json_valid("sales_order"."lines_json") and json_type("sales_order"."lines_json")='array'),
	CONSTRAINT "sales_order_money" CHECK("sales_order"."goods_minor">=0 and "sales_order"."discount_minor" between 0 and "sales_order"."goods_minor" and "sales_order"."surcharge_minor">=0 and "sales_order"."tax_minor">=0 and "sales_order"."original_minor"="sales_order"."goods_minor"-"sales_order"."discount_minor"+"sales_order"."surcharge_minor"+"sales_order"."tax_minor" and "sales_order"."original_minor"<=99999999999999),
	CONSTRAINT "sales_order_remaining" CHECK("sales_order"."goods_remaining_minor" between 0 and "sales_order"."goods_minor"-"sales_order"."discount_minor" and "sales_order"."surcharge_remaining_minor" between 0 and "sales_order"."surcharge_minor" and "sales_order"."tax_remaining_minor" between 0 and "sales_order"."tax_minor"),
	CONSTRAINT "sales_order_collection" CHECK("sales_order"."collected_minor" between 0 and 99999999999999 and "sales_order"."refunded_minor" between 0 and "sales_order"."collected_minor")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_order_number_unique` ON `sales_order` (`number`);--> statement-breakpoint
CREATE INDEX `sales_order_contact_idx` ON `sales_order` (`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sales_order_owner_idx` ON `sales_order` (`owner_membership_id`);--> statement-breakpoint
CREATE INDEX `sales_order_state_idx` ON `sales_order` (`state`,`completed_at`);--> statement-breakpoint
CREATE TABLE `service_entitlement` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`label` text NOT NULL,
	`granted` integer NOT NULL,
	`remaining` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `sales_order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entitlement_balance" CHECK("service_entitlement"."granted">0 and "service_entitlement"."remaining">=0 and "service_entitlement"."used">=0 and "service_entitlement"."revoked">=0 and "service_entitlement"."granted"="service_entitlement"."remaining"+"service_entitlement"."used"+"service_entitlement"."revoked")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entitlement_order_variant_unique` ON `service_entitlement` (`order_id`,`variant_id`);--> statement-breakpoint
CREATE INDEX `entitlement_contact_idx` ON `service_entitlement` (`contact_id`);--> statement-breakpoint
CREATE TABLE `ai_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`provider` text,
	`monthly_budget_minor` integer DEFAULT 0 NOT NULL,
	`used_minor` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `appointment` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`description` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`time_zone` text NOT NULL,
	`contact_id` text,
	`company_id` text,
	`service_variant_id` text,
	`organizer_membership_id` text NOT NULL,
	`creator_user_id` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`reminder_enabled` integer DEFAULT true NOT NULL,
	`reminder_offset_minutes` integer DEFAULT 15 NOT NULL,
	`conflict_acknowledged_at` integer,
	`conflict_acknowledged_by` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`service_variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organizer_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conflict_acknowledged_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `appointment_range_idx` ON `appointment` (`starts_at`,`ends_at`,`status`);--> statement-breakpoint
CREATE INDEX `appointment_organizer_idx` ON `appointment` (`organizer_membership_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `appointment_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`action` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `appointment_participant` (
	`appointment_id` text NOT NULL,
	`membership_id` text NOT NULL,
	PRIMARY KEY(`appointment_id`, `membership_id`),
	FOREIGN KEY (`appointment_id`) REFERENCES `appointment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `appointment_participant_member_idx` ON `appointment_participant` (`membership_id`,`appointment_id`);--> statement-breakpoint
CREATE TABLE `automation_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`event_type` text NOT NULL,
	`condition_json` text NOT NULL,
	`action_json` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`authority_membership_id` text NOT NULL,
	`max_depth` integer DEFAULT 3 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`authority_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `automation_run` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`event_id` text NOT NULL,
	`depth` integer NOT NULL,
	`status` text NOT NULL,
	`result_json` text NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rule`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_run_event_unique` ON `automation_run` (`rule_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `configuration_copy_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`keys_json` text NOT NULL,
	`preview_json` text NOT NULL,
	`applied` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `contract` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`company_id` text NOT NULL,
	`contact_id` text,
	`deal_id` text,
	`order_id` text,
	`value_minor` integer,
	`currency` text NOT NULL,
	`effective_at` integer,
	`expires_at` integer,
	`owner_membership_id` text NOT NULL,
	`creator_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`deal_id`) REFERENCES `deal`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `sales_order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `contract_company_idx` ON `contract` (`company_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `contract_owner_idx` ON `contract` (`owner_membership_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `contract_document` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`size` integer NOT NULL,
	`status` text NOT NULL,
	`uploader_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`ready_at` integer,
	`cleanup_attempted_at` integer,
	FOREIGN KEY (`contract_id`) REFERENCES `contract`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_document_object_key_unique` ON `contract_document` (`object_key`);--> statement-breakpoint
CREATE TABLE `contract_operation` (
	`operation_key` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contract`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `contract_party` (
	`contract_id` text NOT NULL,
	`party_id` text NOT NULL,
	`company_id` text,
	`contact_id` text,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`contract_id`, `party_id`),
	FOREIGN KEY (`contract_id`) REFERENCES `contract`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `contract_version` (
	`contract_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`contract_id`, `version`),
	FOREIGN KEY (`contract_id`) REFERENCES `contract`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `customer_segment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`entity` text NOT NULL,
	`kind` text NOT NULL,
	`filter_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_segment_member` (
	`segment_id` text NOT NULL,
	`record_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`segment_id`, `record_id`),
	FOREIGN KEY (`segment_id`) REFERENCES `customer_segment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_template` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`required_variables_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integration_app` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_hint` text,
	`grants_json` text NOT NULL,
	`authority_membership_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`authority_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_app_token_hash_unique` ON `integration_app` (`token_hash`);--> statement-breakpoint
CREATE TABLE `integration_app_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`actor_membership_id` text NOT NULL,
	`action` text NOT NULL,
	`outcome` text DEFAULT 'success' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `integration_app`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `integration_app_audit_app_created_idx` ON `integration_app_audit` (`app_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_event` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text,
	`endpoint_id` text,
	`direction` text NOT NULL,
	`event_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`external_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`occurred_at` integer NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `integration_app`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoint`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_event_external_unique` ON `integration_event` (`app_id`,`direction`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_event_endpoint_unique` ON `integration_event` (`endpoint_id`,`direction`,`external_id`);--> statement-breakpoint
CREATE TABLE `integration_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`external_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_outbox_external_id_unique` ON `integration_outbox` (`external_id`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_membership_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`source_revision` integer NOT NULL,
	`due_at` integer NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`target_url` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`browser_delivered_at` integer,
	`read_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recipient_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_dedupe_key_unique` ON `notification` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notification_recipient_due_idx` ON `notification` (`recipient_membership_id`,`state`,`due_at`);--> statement-breakpoint
CREATE TABLE `notification_preference` (
	`membership_id` text PRIMARY KEY NOT NULL,
	`in_app_enabled` integer DEFAULT true NOT NULL,
	`browser_enabled` integer DEFAULT false NOT NULL,
	`appointment_offset_minutes` integer DEFAULT 15 NOT NULL,
	`task_offset_minutes` integer DEFAULT 0 NOT NULL,
	`ticket_offset_minutes` integer DEFAULT 0 NOT NULL,
	`contract_offset_minutes` integer DEFAULT 10080 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reporting_goal` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_id` text DEFAULT '' NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`creator_user_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reporting_goal_scope_unique` ON `reporting_goal` (`scope_kind`,`scope_id`,`period_from`,`period_to`,`currency`);--> statement-breakpoint
CREATE INDEX `reporting_goal_period_idx` ON `reporting_goal` (`period_from`,`period_to`,`scope_kind`,`scope_id`);--> statement-breakpoint
CREATE TABLE `review` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`event_id` text NOT NULL,
	`company_id` text,
	`contact_id` text,
	`content` text NOT NULL,
	`rating` integer NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`creator_user_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_source_event_unique` ON `review` (`source`,`event_id`);--> statement-breakpoint
CREATE INDEX `review_customer_idx` ON `review` (`company_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `scheduled_due_fence` (
	`outbox_id` text PRIMARY KEY NOT NULL,
	`fenced_at` integer NOT NULL,
	FOREIGN KEY (`outbox_id`) REFERENCES `integration_outbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_cycle` (
	`task_id` text NOT NULL,
	`cycle` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`opened_by` text NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`overdue_breached` integer DEFAULT false NOT NULL,
	`reopen_reason` text,
	PRIMARY KEY(`task_id`, `cycle`),
	FOREIGN KEY (`task_id`) REFERENCES `task_record`(`activity_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opened_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `task_deadline_history` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`cycle` integer NOT NULL,
	`previous_due_at` integer,
	`next_due_at` integer,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task_record`(`activity_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_deadline_history_operation_key_unique` ON `task_deadline_history` (`operation_key`);--> statement-breakpoint
CREATE TABLE `task_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`action` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task_record`(`activity_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `task_record` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`assignee_membership_id` text,
	`current_cycle` integer DEFAULT 1 NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`overdue_breached` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_assignee_due_idx` ON `task_record` (`assignee_membership_id`,`completed_at`,`due_at`);--> statement-breakpoint
CREATE TABLE `ticket` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`subject` text NOT NULL,
	`description` text,
	`priority` text NOT NULL,
	`category` text,
	`source` text NOT NULL,
	`contact_id` text,
	`company_id` text,
	`assignee_membership_id` text,
	`creator_user_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`current_cycle` integer DEFAULT 1 NOT NULL,
	`due_at` integer,
	`first_response_at` integer,
	`overdue_breached` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_number_unique` ON `ticket` (`number`);--> statement-breakpoint
CREATE INDEX `ticket_status_due_idx` ON `ticket` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `ticket_assignee_idx` ON `ticket` (`assignee_membership_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `ticket_contact_idx` ON `ticket` (`contact_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ticket_collaborator` (
	`ticket_id` text NOT NULL,
	`membership_id` text NOT NULL,
	PRIMARY KEY(`ticket_id`, `membership_id`),
	FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `ticket_cycle` (
	`ticket_id` text NOT NULL,
	`cycle` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`opened_by` text NOT NULL,
	`due_at` integer,
	`resolved_at` integer,
	`overdue_breached` integer DEFAULT false NOT NULL,
	`reopen_reason` text,
	`first_response_at` integer,
	PRIMARY KEY(`ticket_id`, `cycle`),
	FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opened_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `ticket_event` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`cycle` integer NOT NULL,
	`action` text NOT NULL,
	`content` text,
	`previous_due_at` integer,
	`next_due_at` integer,
	`actor_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_event_operation_key_unique` ON `ticket_event` (`operation_key`);--> statement-breakpoint
CREATE INDEX `ticket_event_ticket_idx` ON `ticket_event` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ticket_sequence` (
	`id` text PRIMARY KEY NOT NULL,
	`next_number` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webform_config` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`entity` text NOT NULL,
	`mode` text NOT NULL,
	`token_hash` text,
	`source` text NOT NULL,
	`authority_membership_id` text NOT NULL,
	`mapping_json` text NOT NULL,
	`allow_missing_required` integer DEFAULT false NOT NULL,
	`rate_limit_hour` integer DEFAULT 60 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`authority_membership_id`) REFERENCES `singleton_membership`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webform_config_slug_unique` ON `webform_config` (`slug`);--> statement-breakpoint
CREATE TABLE `webform_rate_bucket` (
	`form_id` text NOT NULL,
	`bucket` integer NOT NULL,
	`client_hash` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`form_id`, `bucket`, `client_hash`),
	FOREIGN KEY (`form_id`) REFERENCES `webform_config`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `webform_submission` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`submission_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`client_hash` text NOT NULL,
	`record_id` text NOT NULL,
	`missing_fields_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `webform_config`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webform_submission_unique` ON `webform_submission` (`form_id`,`submission_key`);--> statement-breakpoint
CREATE TABLE `webhook_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`events_json` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_deletion_object` (
	`object_key` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_deletion_request` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	`execute_after` integer NOT NULL,
	`quiesce_until` integer,
	`status` text NOT NULL,
	`cancelled_at` integer
);
--> statement-breakpoint
CREATE TABLE `workspace_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo_object_key` text,
	`logo_file_name` text,
	`logo_content_type` text,
	`logo_size` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
