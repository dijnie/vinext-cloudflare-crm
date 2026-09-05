PRAGMA foreign_keys = ON;

CREATE TABLE `user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `email_verified` integer DEFAULT false NOT NULL,
  `image` text,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);

CREATE TABLE `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expires_at` integer NOT NULL,
  `token` text NOT NULL,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `updated_at` integer NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `user_id` text NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);

CREATE TABLE `account` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `issuer` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE,
  `access_token` text,
  `refresh_token` text,
  `id_token` text,
  `access_token_expires_at` integer,
  `refresh_token_expires_at` integer,
  `scope` text,
  `password` text,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `account_issuer_account_id_unique` ON `account` (`issuer`, `account_id`);
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);

CREATE TABLE `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);

CREATE TABLE `rate_limit` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL,
  `count` integer NOT NULL,
  `last_request` integer NOT NULL
);
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);

CREATE TABLE `singleton_workspace` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `owner_user_id` text REFERENCES `user` (`id`) ON DELETE RESTRICT,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `singleton_membership` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE,
  `role` text NOT NULL CHECK (`role` IN ('owner', 'member')),
  `status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('active', 'revoked')),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `singleton_membership_status_idx` ON `singleton_membership` (`status`);

CREATE TABLE `deal_stage` (
  `id` text PRIMARY KEY NOT NULL,
  `label_key` text NOT NULL,
  `position` integer NOT NULL,
  `closed_state` text DEFAULT 'open' NOT NULL CHECK (`closed_state` IN ('open', 'won', 'lost'))
);
CREATE UNIQUE INDEX `deal_stage_position_unique` ON `deal_stage` (`position`);

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
  `owner_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `last_activity_at` integer,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `company_name_idx` ON `company` (`name`);
CREATE INDEX `company_owner_idx` ON `company` (`owner_membership_id`);
CREATE INDEX `company_last_activity_idx` ON `company` (`last_activity_at`);
CREATE INDEX `company_archived_idx` ON `company` (`archived_at`);
CREATE UNIQUE INDEX `company_active_domain_unique` ON `company` (`domain`) WHERE `archived_at` IS NULL AND `domain` IS NOT NULL;

CREATE TABLE `contact` (
  `id` text PRIMARY KEY NOT NULL,
  `first_name` text NOT NULL,
  `last_name` text,
  `email` text,
  `phone` text,
  `title` text,
  `company_id` text REFERENCES `company` (`id`) ON DELETE SET NULL,
  `owner_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `last_activity_at` integer,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `contact_name_idx` ON `contact` (`first_name`, `last_name`);
CREATE INDEX `contact_company_idx` ON `contact` (`company_id`);
CREATE INDEX `contact_owner_idx` ON `contact` (`owner_membership_id`);
CREATE INDEX `contact_last_activity_idx` ON `contact` (`last_activity_at`);
CREATE INDEX `contact_archived_idx` ON `contact` (`archived_at`);
CREATE UNIQUE INDEX `contact_active_email_unique` ON `contact` (`email`) WHERE `archived_at` IS NULL AND `email` IS NOT NULL;

CREATE TABLE `deal` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `company_id` text REFERENCES `company` (`id`) ON DELETE SET NULL,
  `owner_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `stage_id` text NOT NULL REFERENCES `deal_stage` (`id`) ON DELETE RESTRICT,
  `stage_changed_at` integer NOT NULL,
  `amount_minor` integer CHECK (`amount_minor` IS NULL OR `amount_minor` >= 0),
  `currency` text DEFAULT 'USD' NOT NULL CHECK (length(`currency`) = 3),
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
  `updated_at` integer NOT NULL
);
CREATE INDEX `deal_company_idx` ON `deal` (`company_id`);
CREATE INDEX `deal_owner_idx` ON `deal` (`owner_membership_id`);
CREATE INDEX `deal_stage_idx` ON `deal` (`stage_id`);
CREATE INDEX `deal_close_idx` ON `deal` (`expected_close_at`);
CREATE INDEX `deal_last_activity_idx` ON `deal` (`last_activity_at`);
CREATE INDEX `deal_currency_idx` ON `deal` (`currency`);
CREATE INDEX `deal_archived_idx` ON `deal` (`archived_at`);

CREATE TABLE `deal_contact` (
  `deal_id` text NOT NULL REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `contact_id` text NOT NULL REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `role` text,
  PRIMARY KEY (`deal_id`, `contact_id`)
);
CREATE INDEX `deal_contact_contact_idx` ON `deal_contact` (`contact_id`);

CREATE TABLE `activity` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('note', 'call', 'meeting', 'task', 'stage_change')),
  `subject` text,
  `content` text,
  `occurred_at` integer,
  `due_at` integer,
  `completed_at` integer,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `author_user_id` text NOT NULL REFERENCES `user` (`id`) ON DELETE RESTRICT,
  `metadata_json` text CHECK (`metadata_json` IS NULL OR json_valid(`metadata_json`)),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL)) = 1)
);
CREATE INDEX `activity_company_created_idx` ON `activity` (`company_id`, `created_at`);
CREATE INDEX `activity_contact_created_idx` ON `activity` (`contact_id`, `created_at`);
CREATE INDEX `activity_deal_created_idx` ON `activity` (`deal_id`, `created_at`);
CREATE INDEX `activity_due_idx` ON `activity` (`due_at`);
CREATE INDEX `activity_author_idx` ON `activity` (`author_user_id`);

CREATE TABLE `activity_visibility` (
  `activity_id` text NOT NULL REFERENCES `activity` (`id`) ON DELETE CASCADE,
  `membership_id` text NOT NULL REFERENCES `singleton_membership` (`user_id`) ON DELETE CASCADE,
  PRIMARY KEY (`activity_id`, `membership_id`)
);
CREATE INDEX `activity_visibility_member_idx` ON `activity_visibility` (`membership_id`);

CREATE TABLE `member_operation_guard` (
  `id` text PRIMARY KEY NOT NULL,
  `authorized` integer NOT NULL CHECK (`authorized` = 1)
);

CREATE TABLE `custom_field_definition` (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal')),
  `key` text NOT NULL,
  `label` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user')),
  `config_json` text CHECK (`config_json` IS NULL OR json_valid(`config_json`)),
  `required` integer DEFAULT false NOT NULL,
  `show_on_sheet` integer DEFAULT true NOT NULL,
  `show_on_table` integer DEFAULT false NOT NULL,
  `show_on_filter` integer DEFAULT false NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`, `key`);
CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`, `position`);

CREATE TABLE `custom_field_option` (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES `custom_field_definition` (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);
CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`, `position`);

CREATE TABLE `custom_field_value` (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES `custom_field_definition` (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES `custom_field_option` (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL)) = 1)
);
CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`, `company_id`);
CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`, `contact_id`);
CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`, `deal_id`);
CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`, `text_value`);
CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`, `number_value`);
CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`, `date_value`);
CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);

CREATE TABLE `saved_view` (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal')),
  `name` text NOT NULL,
  `shared` integer DEFAULT false NOT NULL,
  `state_json` text NOT NULL CHECK (json_valid(`state_json`)),
  `owner_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `saved_view_owner_name_unique` ON `saved_view` (`entity`, `owner_membership_id`, `name`);
CREATE INDEX `saved_view_entity_shared_idx` ON `saved_view` (`entity`, `shared`);

CREATE TABLE `exchange_rate` (
  `id` text PRIMARY KEY NOT NULL,
  `base_currency` text NOT NULL,
  `quote_currency` text NOT NULL,
  `rate_scaled` integer NOT NULL CHECK (`rate_scaled` > 0),
  `as_of` integer NOT NULL,
  `source` text NOT NULL CHECK (`source` IN ('fetched', 'manual')),
  `provider` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK (length(`base_currency`) = 3 AND length(`quote_currency`) = 3)
);
CREATE UNIQUE INDEX `exchange_rate_pair_source_unique` ON `exchange_rate` (`base_currency`, `quote_currency`, `source`);
CREATE INDEX `exchange_rate_pair_idx` ON `exchange_rate` (`base_currency`, `quote_currency`);

CREATE TABLE `crm_setting` (
  `id` text PRIMARY KEY NOT NULL CHECK (`id` = 'settings'),
  `reporting_currency` text DEFAULT 'USD' NOT NULL CHECK (length(`reporting_currency`) = 3),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TRIGGER `membership_keep_last_owner_on_role_change`
BEFORE UPDATE OF `role` ON `singleton_membership`
WHEN OLD.`role` = 'owner' AND OLD.`status` = 'active' AND NEW.`role` != 'owner'
  AND EXISTS (SELECT 1 FROM `singleton_workspace`)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM `singleton_membership` WHERE `role` = 'owner' AND `status` = 'active') <= 1
    THEN RAISE(ABORT, 'last owner protected') END);
END;

CREATE TRIGGER `membership_keep_last_owner_on_status_change`
BEFORE UPDATE OF `status` ON `singleton_membership`
WHEN OLD.`role` = 'owner' AND OLD.`status` = 'active' AND NEW.`status` != 'active'
  AND EXISTS (SELECT 1 FROM `singleton_workspace`)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM `singleton_membership` WHERE `role` = 'owner' AND `status` = 'active') <= 1
    THEN RAISE(ABORT, 'last owner protected') END);
END;

CREATE TRIGGER `membership_keep_last_owner_on_delete`
BEFORE DELETE ON `singleton_membership`
WHEN OLD.`role` = 'owner' AND OLD.`status` = 'active'
  AND EXISTS (SELECT 1 FROM `singleton_workspace`)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM `singleton_membership` WHERE `role` = 'owner' AND `status` = 'active') <= 1
    THEN RAISE(ABORT, 'last owner protected') END);
END;

CREATE TRIGGER `company_active_owner_insert`
BEFORE INSERT ON `company`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;
CREATE TRIGGER `company_active_owner_update`
BEFORE UPDATE OF `owner_membership_id` ON `company`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `contact_active_owner_insert`
BEFORE INSERT ON `contact`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;
CREATE TRIGGER `contact_active_owner_update`
BEFORE UPDATE OF `owner_membership_id` ON `contact`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `deal_active_owner_insert`
BEFORE INSERT ON `deal`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;
CREATE TRIGGER `deal_active_owner_update`
BEFORE UPDATE OF `owner_membership_id` ON `deal`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `saved_view_active_owner_insert`
BEFORE INSERT ON `saved_view`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'view owner membership is inactive') END);
END;
CREATE TRIGGER `saved_view_active_owner_update`
BEFORE UPDATE OF `owner_membership_id` ON `saved_view`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'view owner membership is inactive') END);
END;

CREATE TRIGGER `custom_field_active_user_insert`
BEFORE INSERT ON `custom_field_value`
WHEN NEW.`user_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`user_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'field user membership is inactive') END);
END;
CREATE TRIGGER `custom_field_active_user_update`
BEFORE UPDATE OF `user_membership_id` ON `custom_field_value`
WHEN NEW.`user_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`user_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'field user membership is inactive') END);
END;

CREATE TRIGGER `activity_visibility_active_member_insert`
BEFORE INSERT ON `activity_visibility`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'activity membership is inactive') END);
END;
CREATE TRIGGER `activity_visibility_active_member_update`
BEFORE UPDATE OF `membership_id` ON `activity_visibility`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'activity membership is inactive') END);
END;

CREATE TRIGGER `membership_requires_reference_cleanup`
BEFORE UPDATE OF `status` ON `singleton_membership`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'revoked'
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM `company` WHERE `owner_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `contact` WHERE `owner_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `deal` WHERE `owner_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `custom_field_value` WHERE `user_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `activity_visibility` WHERE `membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `saved_view` WHERE `owner_membership_id` = OLD.`user_id`)
    THEN RAISE(ABORT, 'membership references require cleanup') END);
END;

INSERT INTO `singleton_workspace` (`id`, `slug`, `created_at`, `updated_at`)
VALUES ('00000000-0000-4000-8000-000000000001', 'crm', unixepoch() * 1000, unixepoch() * 1000);

INSERT INTO `deal_stage` (`id`, `label_key`, `position`, `closed_state`) VALUES
  ('demo-booked', 'dealStage.demoBooked', 10, 'open'),
  ('qualified-to-buy', 'dealStage.qualifiedToBuy', 20, 'open'),
  ('unqualified-to-buy', 'dealStage.unqualifiedToBuy', 30, 'lost'),
  ('decision-maker-bought-in', 'dealStage.decisionMakerBoughtIn', 40, 'open'),
  ('contract-sent', 'dealStage.contractSent', 50, 'open'),
  ('closed-won', 'dealStage.closedWon', 60, 'won'),
  ('closed-lost', 'dealStage.closedLost', 70, 'lost');

INSERT INTO `crm_setting` (`id`, `reporting_currency`, `created_at`, `updated_at`)
VALUES ('settings', 'USD', unixepoch() * 1000, unixepoch() * 1000);
