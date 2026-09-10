-- Migration number: 0001    2024-12-23T17:22:25.583Z
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    notes VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_customers_updated_at 
    AFTER UPDATE ON customers
    BEGIN
        UPDATE customers 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;
-- Migration number: 0002    2024-12-23T17:28:56.809Z
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS subscription_features;
DROP TABLE IF EXISTS features;

-- Main subscriptions table
CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Features table
CREATE TABLE features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for subscription-feature relationships
CREATE TABLE subscription_features (
    subscription_id INTEGER NOT NULL,
    feature_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (subscription_id, feature_id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE
);

-- Update triggers
CREATE TRIGGER update_subscriptions_updated_at 
    AFTER UPDATE ON subscriptions
    BEGIN
        UPDATE subscriptions 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;

CREATE TRIGGER update_features_updated_at 
    AFTER UPDATE ON features
    BEGIN
        UPDATE features 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;
-- Migration number: 0003    2024-12-23T17:29:51.921Z
DROP TABLE IF EXISTS customer_subscriptions;
CREATE TABLE customer_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    subscription_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'expired')),
    subscription_starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subscription_ends_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE RESTRICT
);

-- Create index for faster queries
CREATE INDEX idx_customer_subscriptions_customer_id ON customer_subscriptions(customer_id);
CREATE INDEX idx_customer_subscriptions_subscription_id ON customer_subscriptions(subscription_id);
CREATE INDEX idx_customer_subscriptions_status ON customer_subscriptions(status);
CREATE INDEX idx_customer_subscriptions_ends_at ON customer_subscriptions(subscription_ends_at);

-- Create trigger for updated_at
CREATE TRIGGER update_customer_subscriptions_updated_at 
    AFTER UPDATE ON customer_subscriptions
    BEGIN
        UPDATE customer_subscriptions 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;

-- Prevent duplicate active subscriptions for the same customer
CREATE UNIQUE INDEX idx_unique_active_subscription 
ON customer_subscriptions(customer_id) 
WHERE status = 'active';
-- Combined migration v1
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
CREATE TRIGGER `deal_required_relationships_insert`
BEFORE INSERT ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_required_relationships_update`
BEFORE UPDATE OF `company_id`, `owner_membership_id` ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_contact_company_insert`
BEFORE INSERT ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `deal_contact_company_update`
BEFORE UPDATE OF `deal_id`, `contact_id` ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `contact_company_preserves_deals`
BEFORE UPDATE OF `company_id` ON `contact`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `deal` ON `deal`.`id` = `deal_contact`.`deal_id`
     WHERE `deal_contact`.`contact_id` = OLD.`id`
       AND (NEW.`company_id` IS NULL OR NEW.`company_id` != `deal`.`company_id`)
  ) THEN RAISE(ABORT, 'contact company conflicts with a deal') END);
END;

CREATE TRIGGER `deal_company_preserves_contacts`
BEFORE UPDATE OF `company_id` ON `deal`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `contact` ON `contact`.`id` = `deal_contact`.`contact_id`
     WHERE `deal_contact`.`deal_id` = OLD.`id`
       AND (`contact`.`company_id` IS NULL OR `contact`.`company_id` != NEW.`company_id`)
  ) THEN RAISE(ABORT, 'deal company conflicts with a contact') END);
END;
CREATE TABLE activity_visibility_backup AS SELECT * FROM activity_visibility;
CREATE TABLE activity_replacement (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL CHECK (type IN ('note', 'call', 'meeting', 'task', 'stage_change')),
  subject text,
  content text,
  occurred_at integer,
  due_at integer,
  completed_at integer,
  company_id text REFERENCES company(id) ON DELETE CASCADE,
  contact_id text REFERENCES contact(id) ON DELETE CASCADE,
  deal_id text REFERENCES deal(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  metadata_json text CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  CHECK (((company_id IS NOT NULL) + (contact_id IS NOT NULL) + (deal_id IS NOT NULL)) >= 1)
);
INSERT INTO activity_replacement SELECT * FROM activity;
DROP TABLE activity;
ALTER TABLE activity_replacement RENAME TO activity;
CREATE INDEX activity_company_created_idx ON activity(company_id, created_at, id);
CREATE INDEX activity_contact_created_idx ON activity(contact_id, created_at, id);
CREATE INDEX activity_deal_created_idx ON activity(deal_id, created_at, id);
CREATE INDEX activity_due_idx ON activity(due_at);
CREATE INDEX activity_author_idx ON activity(author_user_id);
INSERT INTO activity_visibility SELECT * FROM activity_visibility_backup;
DROP TABLE activity_visibility_backup;

CREATE TRIGGER activity_compatible_anchors_insert
BEFORE INSERT ON activity
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id = NEW.author_user_id AND status = 'active')
    THEN RAISE(ABORT, 'author membership is inactive') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact WHERE id = NEW.contact_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.deal_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM deal WHERE id = NEW.deal_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.deal_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact JOIN deal ON contact.company_id = deal.company_id WHERE contact.id = NEW.contact_id AND deal.id = NEW.deal_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
END;

CREATE TRIGGER activity_history_immutable
BEFORE UPDATE ON activity
WHEN OLD.type != 'task' OR NEW.type != OLD.type OR NEW.id != OLD.id
  OR NEW.author_user_id != OLD.author_user_id OR NEW.created_at != OLD.created_at
  OR NEW.company_id IS NOT OLD.company_id OR NEW.contact_id IS NOT OLD.contact_id
  OR NEW.deal_id IS NOT OLD.deal_id OR NEW.subject IS NOT OLD.subject
  OR NEW.content IS NOT OLD.content OR NEW.occurred_at IS NOT OLD.occurred_at
  OR NEW.due_at IS NOT OLD.due_at OR NEW.metadata_json IS NOT OLD.metadata_json
BEGIN
  SELECT RAISE(ABORT, 'activity history is immutable');
END;
ALTER TABLE custom_field_definition ADD COLUMN deleted_at integer;
ALTER TABLE saved_view ADD COLUMN creator_user_id text REFERENCES user(id) ON DELETE SET NULL;
UPDATE saved_view SET creator_user_id = owner_membership_id;
CREATE UNIQUE INDEX saved_view_creator_name_unique ON saved_view(entity, creator_user_id, name);
CREATE TRIGGER saved_view_creator_immutable BEFORE UPDATE OF creator_user_id ON saved_view
WHEN NEW.creator_user_id IS NOT NULL AND NEW.creator_user_id IS NOT OLD.creator_user_id
BEGIN SELECT RAISE(ABORT, 'saved_view_creator_immutable'); END;
CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

-- Recheck retained ownership on ordinary edits, not only ownership changes.
CREATE TRIGGER saved_view_edit_active_owner BEFORE UPDATE ON saved_view
WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active'
)
BEGIN SELECT RAISE(ABORT, 'saved_view_owner_inactive'); END;

CREATE TRIGGER custom_field_position_insert BEFORE INSERT ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;
CREATE TRIGGER custom_field_position_update BEFORE UPDATE OF position ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;
CREATE TRIGGER custom_field_option_position_insert BEFORE INSERT ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;
CREATE TRIGGER custom_field_option_position_update BEFORE UPDATE OF position ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

-- Stable keys are reserved even while a definition is tombstoned.
CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;
CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;
CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;
CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type='select')
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;
CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type='select')
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;
CREATE TRIGGER custom_field_value_validate_insert BEFORE INSERT ON custom_field_value
BEGIN
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='number')))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
END;
CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='number')))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
END;
ALTER TABLE deal ADD COLUMN money_revision integer NOT NULL DEFAULT 0;
ALTER TABLE crm_setting ADD COLUMN active_conversion_version text NOT NULL DEFAULT 'initial';
ALTER TABLE crm_setting ADD COLUMN pending_job_id text;
ALTER TABLE crm_setting ADD COLUMN rates_revision integer NOT NULL DEFAULT 0;

ALTER TABLE exchange_rate RENAME TO exchange_rate_legacy;
CREATE TABLE exchange_rate (
  id text PRIMARY KEY NOT NULL, base_currency text NOT NULL, quote_currency text NOT NULL,
  rate text NOT NULL CHECK (length(rate) BETWEEN 1 AND 21 AND rate NOT GLOB '*[^0-9.]*' AND cast(rate AS numeric)>0
    AND length(rate)-length(replace(rate,'.','')) <= 1
    AND ((instr(rate,'.')=0 AND length(rate)<=10) OR (instr(rate,'.') BETWEEN 2 AND 11 AND length(rate)-instr(rate,'.') BETWEEN 1 AND 10))),
  as_of integer NOT NULL, source text NOT NULL CHECK(source IN ('manual','fetched')), provider text,
  created_at integer NOT NULL, updated_at integer NOT NULL
);
INSERT INTO exchange_rate SELECT id,base_currency,quote_currency,
  cast(rate_scaled / 10000000000 AS text) || CASE WHEN rate_scaled % 10000000000 = 0 THEN '' ELSE '.' || rtrim(printf('%010d',rate_scaled % 10000000000),'0') END,
  as_of,source,provider,created_at,updated_at FROM exchange_rate_legacy;
DROP TABLE exchange_rate_legacy;
CREATE UNIQUE INDEX exchange_rate_pair_source_unique ON exchange_rate(base_currency,quote_currency,source);
CREATE INDEX exchange_rate_pair_idx ON exchange_rate(base_currency,quote_currency);

CREATE TABLE currency_job (
 id text PRIMARY KEY NOT NULL, kind text NOT NULL CHECK(kind IN ('rerate','fill_missing')),
 target_currency text NOT NULL, expected_version text NOT NULL, target_version text NOT NULL,
 rates_json text NOT NULL CHECK(json_valid(rates_json)), cursor text,
 total integer NOT NULL, processed integer NOT NULL DEFAULT 0, converted integer NOT NULL DEFAULT 0, missing integer NOT NULL DEFAULT 0,
 status text NOT NULL CHECK(status IN ('pending','running','completed','cancelled')),
 created_at integer NOT NULL, updated_at integer NOT NULL
);
CREATE TABLE deal_conversion (
 version text NOT NULL, deal_id text NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
 money_revision integer NOT NULL, amount_minor integer, currency text NOT NULL,
 base_amount_minor integer CHECK(base_amount_minor IS NULL OR (typeof(base_amount_minor)='integer' AND base_amount_minor BETWEEN 0 AND 9007199254740991)),
 base_currency text, fx_rate text, fx_rate_at integer, rate_source text,
 PRIMARY KEY(version,deal_id),
 CHECK ((base_amount_minor IS NULL AND base_currency IS NULL AND fx_rate IS NULL AND fx_rate_at IS NULL AND rate_source IS NULL)
 OR (base_amount_minor IS NOT NULL AND base_currency IS NOT NULL AND fx_rate IS NOT NULL AND fx_rate_at IS NOT NULL AND rate_source IN ('identity','manual','fetched')))
);
CREATE INDEX deal_conversion_amount_idx ON deal_conversion(version,base_amount_minor,deal_id);

CREATE TRIGGER deal_currency_job_insert BEFORE INSERT ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;
CREATE TRIGGER deal_currency_job_money_update BEFORE UPDATE OF amount_minor,currency ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency)
 AND EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;
CREATE TRIGGER deal_currency_job_delete BEFORE DELETE ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;
CREATE TRIGGER deal_money_revision_update BEFORE UPDATE ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency) AND NEW.money_revision != OLD.money_revision + 1
BEGIN SELECT RAISE(ABORT,'deal_money_revision_conflict'); END;
CREATE TRIGGER exchange_rate_job_insert BEFORE INSERT ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;
CREATE TRIGGER exchange_rate_job_update BEFORE UPDATE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;
CREATE TRIGGER exchange_rate_job_delete BEFORE DELETE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;
CREATE TABLE access_profile (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX access_profile_name_unique ON access_profile(name);
CREATE TABLE access_grant (
  profile_id TEXT NOT NULL REFERENCES access_profile(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (profile_id, permission)
);
CREATE TABLE membership_access (
  membership_id TEXT PRIMARY KEY NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES access_profile(id) ON DELETE RESTRICT
);
CREATE INDEX membership_access_profile_idx ON membership_access(profile_id);
INSERT INTO access_profile VALUES ('standard-member', 'Standard member', 0, 0);
INSERT INTO access_grant (profile_id, permission) VALUES
('standard-member', 'company.create'),
('standard-member', 'company.update'),
('standard-member', 'company.archive'),
('standard-member', 'company.restore'),
('standard-member', 'company.assign'),
('standard-member', 'contact.create'),
('standard-member', 'contact.update'),
('standard-member', 'contact.archive'),
('standard-member', 'contact.restore'),
('standard-member', 'contact.assign'),
('standard-member', 'deal.create'),
('standard-member', 'deal.update'),
('standard-member', 'deal.archive'),
('standard-member', 'deal.restore'),
('standard-member', 'deal.assign'),
('standard-member', 'activity.create'),
('standard-member', 'activity.update'),
('standard-member', 'field.configure'),
('standard-member', 'view.create'),
('standard-member', 'view.update'),
('standard-member', 'view.delete');
INSERT INTO membership_access SELECT user_id, 'standard-member' FROM singleton_membership;
CREATE TRIGGER membership_default_profile AFTER INSERT ON singleton_membership
BEGIN
  INSERT INTO membership_access VALUES (NEW.user_id, 'standard-member');
END;
CREATE TABLE branch (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX branch_active_name_unique ON branch(name) WHERE archived_at IS NULL;
INSERT INTO branch VALUES ('default-branch', 'Chi nhánh mặc định', NULL, 0, 0);
CREATE TABLE branch_setting (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT branch_setting_singleton CHECK(id = 'settings'),
  default_branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT
);
INSERT INTO branch_setting VALUES ('settings', 'default-branch');
CREATE TABLE member_branch (
  membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  PRIMARY KEY (membership_id, branch_id)
);
CREATE INDEX member_branch_branch_idx ON member_branch(branch_id);
CREATE UNIQUE INDEX member_branch_primary_unique ON member_branch(membership_id) WHERE is_primary = 1;
CREATE TRIGGER member_branch_active_insert BEFORE INSERT ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;
CREATE TRIGGER member_branch_active_update BEFORE UPDATE ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;
CREATE TRIGGER branch_archive_in_use BEFORE UPDATE OF archived_at ON branch WHEN NEW.archived_at IS NOT NULL
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM branch_setting WHERE default_branch_id=OLD.id)
    OR EXISTS (SELECT 1 FROM member_branch WHERE branch_id=OLD.id)
    THEN RAISE(ABORT, 'branch_in_use') END);
END;
CREATE TRIGGER branch_default_active BEFORE UPDATE OF default_branch_id ON branch_setting
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.default_branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;
CREATE TRIGGER membership_clear_branches AFTER UPDATE OF status ON singleton_membership WHEN NEW.status='revoked'
BEGIN
  DELETE FROM member_branch WHERE membership_id=NEW.user_id;
END;
CREATE TABLE action_operation_guard (
  id TEXT PRIMARY KEY NOT NULL,
  authorized INTEGER NOT NULL CONSTRAINT action_permission_required CHECK (authorized = 1)
);
CREATE TABLE operation_condition_guard (
  id TEXT PRIMARY KEY NOT NULL,
  authorized INTEGER NOT NULL CONSTRAINT operation_conflict CHECK (authorized = 1)
);
ALTER TABLE crm_setting ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
ALTER TABLE crm_setting ADD COLUMN country_code TEXT NOT NULL DEFAULT 'VN' CHECK (length(country_code) = 2);
ALTER TABLE crm_setting ADD COLUMN calendar_revision INTEGER NOT NULL DEFAULT 0 CHECK (calendar_revision >= 0);
CREATE TABLE saved_view_default (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal')),
  view_id TEXT NOT NULL REFERENCES saved_view(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, entity)
);
CREATE INDEX saved_view_default_view_idx ON saved_view_default(view_id);
CREATE TRIGGER saved_view_default_visible_insert BEFORE INSERT ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;
CREATE TRIGGER saved_view_default_visible_update BEFORE UPDATE ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;
CREATE TRIGGER saved_view_default_unshare AFTER UPDATE OF shared ON saved_view
WHEN OLD.shared=1 AND NEW.shared=0
BEGIN DELETE FROM saved_view_default WHERE view_id=NEW.id AND user_id IS NOT NEW.creator_user_id; END;
-- Rebuild all dependent field tables together to preserve values and option IDs.

DROP TRIGGER custom_field_active_user_insert;

DROP TRIGGER custom_field_active_user_update;

DROP TRIGGER membership_requires_reference_cleanup;

DROP TRIGGER custom_field_position_insert;

DROP TRIGGER custom_field_position_update;

DROP TRIGGER custom_field_option_position_insert;

DROP TRIGGER custom_field_option_position_update;

DROP TRIGGER custom_field_identity_immutable;

DROP TRIGGER custom_field_type_with_values;

DROP TRIGGER custom_field_option_owner_immutable;

DROP TRIGGER custom_field_option_available_insert;

DROP TRIGGER custom_field_option_available_update;

DROP TRIGGER custom_field_value_validate_insert;

DROP TRIGGER custom_field_value_validate_update;

CREATE TABLE `custom_field_definition_next` (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal')),
  `key` text NOT NULL,
  `label` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer')),
  `config_json` text CHECK (`config_json` IS NULL OR json_valid(`config_json`)),
  `required` integer DEFAULT false NOT NULL,
  `show_on_sheet` integer DEFAULT true NOT NULL,
  `show_on_table` integer DEFAULT false NOT NULL,
  `show_on_filter` integer DEFAULT false NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, deleted_at integer);

INSERT INTO custom_field_definition_next (`id`, `entity`, `key`, `label`, `type`, `config_json`, `required`, `show_on_sheet`, `show_on_table`, `show_on_filter`, `position`, `archived_at`, `created_at`, `updated_at`, `deleted_at`) SELECT `id`, `entity`, `key`, `label`, `type`, `config_json`, `required`, `show_on_sheet`, `show_on_table`, `show_on_filter`, `position`, `archived_at`, `created_at`, `updated_at`, `deleted_at` FROM custom_field_definition;

CREATE TABLE `custom_field_option_next` (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES `custom_field_definition_next` (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);

INSERT INTO custom_field_option_next (`id`, `field_id`, `label`, `position`, `archived_at`) SELECT `id`, `field_id`, `label`, `position`, `archived_at` FROM custom_field_option;

CREATE TABLE `custom_field_value_next` (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES `custom_field_definition_next` (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES `custom_field_option_next` (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  json_value text CHECK (json_value IS NULL OR json_valid(json_value)),
  customer_reference_id text REFERENCES contact(id) ON DELETE RESTRICT,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL)) = 1)
);

INSERT INTO custom_field_value_next (`id`, `field_id`, `company_id`, `contact_id`, `deal_id`, `text_value`, `number_value`, `date_value`, `boolean_value`, `option_id`, `user_membership_id`, `updated_at`) SELECT `id`, `field_id`, `company_id`, `contact_id`, `deal_id`, `text_value`, `number_value`, `date_value`, `boolean_value`, `option_id`, `user_membership_id`, `updated_at` FROM custom_field_value;

DROP TABLE custom_field_value;

DROP TABLE custom_field_option;

DROP TABLE custom_field_definition;

ALTER TABLE custom_field_definition_next RENAME TO custom_field_definition;

ALTER TABLE custom_field_option_next RENAME TO custom_field_option;

ALTER TABLE custom_field_value_next RENAME TO custom_field_value;

CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`, `key`);

CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`, `position`);

CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`, `position`);

CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`, `company_id`);

CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`, `contact_id`);

CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`, `deal_id`);

CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`, `text_value`);

CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`, `number_value`);

CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`, `date_value`);

CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);

CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

CREATE INDEX custom_field_value_customer_idx ON custom_field_value(customer_reference_id);

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

CREATE TRIGGER custom_field_position_insert BEFORE INSERT ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_position_update BEFORE UPDATE OF position ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_insert BEFORE INSERT ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_update BEFORE UPDATE OF position ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;

CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;

CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_value_validate_insert BEFORE INSERT ON custom_field_value
BEGIN
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_rating_config_update BEFORE UPDATE OF config_json ON custom_field_definition
WHEN NEW.type='rating' AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=NEW.id AND number_value > coalesce(json_extract(NEW.config_json,'$.ratingMax'),5))
BEGIN SELECT RAISE(ABORT, 'field_rating_has_values'); END;
-- Preserve all field values while adding computed numeric definitions.

DROP TRIGGER custom_field_active_user_insert;

DROP TRIGGER custom_field_active_user_update;

DROP TRIGGER membership_requires_reference_cleanup;

DROP TRIGGER custom_field_position_insert;

DROP TRIGGER custom_field_position_update;

DROP TRIGGER custom_field_option_position_insert;

DROP TRIGGER custom_field_option_position_update;

DROP TRIGGER custom_field_identity_immutable;

DROP TRIGGER custom_field_type_with_values;

DROP TRIGGER custom_field_option_owner_immutable;

DROP TRIGGER custom_field_option_available_insert;

DROP TRIGGER custom_field_option_available_update;

DROP TRIGGER custom_field_value_validate_insert;

DROP TRIGGER custom_field_value_validate_update;

DROP TRIGGER custom_field_rating_config_update;

CREATE TABLE "custom_field_definition_next" (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal')),
  `key` text NOT NULL,
  `label` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer', 'formula')),
  `config_json` text CHECK (`config_json` IS NULL OR json_valid(`config_json`)),
  `required` integer DEFAULT false NOT NULL,
  `show_on_sheet` integer DEFAULT true NOT NULL,
  `show_on_table` integer DEFAULT false NOT NULL,
  `show_on_filter` integer DEFAULT false NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, deleted_at integer);

INSERT INTO custom_field_definition_next ("id", "entity", "key", "label", "type", "config_json", "required", "show_on_sheet", "show_on_table", "show_on_filter", "position", "archived_at", "created_at", "updated_at", "deleted_at") SELECT "id", "entity", "key", "label", "type", "config_json", "required", "show_on_sheet", "show_on_table", "show_on_filter", "position", "archived_at", "created_at", "updated_at", "deleted_at" FROM custom_field_definition;

CREATE TABLE "custom_field_option_next" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition_next" (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);

INSERT INTO custom_field_option_next ("id", "field_id", "label", "position", "archived_at") SELECT "id", "field_id", "label", "position", "archived_at" FROM custom_field_option;

CREATE TABLE "custom_field_value_next" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition_next" (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES "custom_field_option_next" (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  json_value text CHECK (json_value IS NULL OR json_valid(json_value)),
  customer_reference_id text REFERENCES contact(id) ON DELETE RESTRICT,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL)) = 1)
);

INSERT INTO custom_field_value_next ("id", "field_id", "company_id", "contact_id", "deal_id", "text_value", "number_value", "date_value", "boolean_value", "option_id", "user_membership_id", "updated_at", "json_value", "customer_reference_id") SELECT "id", "field_id", "company_id", "contact_id", "deal_id", "text_value", "number_value", "date_value", "boolean_value", "option_id", "user_membership_id", "updated_at", "json_value", "customer_reference_id" FROM custom_field_value;

DROP TABLE custom_field_value;

DROP TABLE custom_field_option;

DROP TABLE custom_field_definition;

ALTER TABLE custom_field_definition_next RENAME TO custom_field_definition;

ALTER TABLE custom_field_option_next RENAME TO custom_field_option;

ALTER TABLE custom_field_value_next RENAME TO custom_field_value;

CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`, `key`);

CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`, `position`);

CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`, `position`);

CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`, `company_id`);

CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`, `contact_id`);

CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`, `deal_id`);

CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`, `text_value`);

CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`, `number_value`);

CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`, `date_value`);

CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);

CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

CREATE INDEX custom_field_value_customer_idx ON custom_field_value(customer_reference_id);

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

CREATE TRIGGER custom_field_position_insert BEFORE INSERT ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_position_update BEFORE UPDATE OF position ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_insert BEFORE INSERT ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_update BEFORE UPDATE OF position ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;

CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;

CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_value_validate_insert BEFORE INSERT ON custom_field_value
BEGIN
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_rating_config_update BEFORE UPDATE OF config_json ON custom_field_definition
WHEN NEW.type='rating' AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=NEW.id AND number_value > coalesce(json_extract(NEW.config_json,'$.ratingMax'),5))
BEGIN SELECT RAISE(ABORT, 'field_rating_has_values'); END;

CREATE TABLE field_configuration_revision (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal')),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO field_configuration_revision(entity) VALUES ('company'),('contact'),('deal');

CREATE TRIGGER field_configuration_insert AFTER INSERT ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_update AFTER UPDATE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_delete AFTER DELETE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=OLD.entity; END;

CREATE TRIGGER formula_field_value_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_insert BEFORE INSERT ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER formula_field_value_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_update BEFORE UPDATE ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;
CREATE TABLE field_value_revision (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES custom_field_definition(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO field_value_revision(field_id) SELECT id FROM custom_field_definition;
CREATE TRIGGER field_value_revision_definition AFTER INSERT ON custom_field_definition
BEGIN INSERT INTO field_value_revision(field_id) VALUES(NEW.id); END;
CREATE TRIGGER field_value_revision_insert AFTER INSERT ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=NEW.field_id; END;
CREATE TRIGGER field_value_revision_update AFTER UPDATE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id IN (OLD.field_id,NEW.field_id); END;
CREATE TRIGGER field_value_revision_delete AFTER DELETE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=OLD.field_id; END;
CREATE TRIGGER field_option_revision_insert AFTER INSERT ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;
CREATE TRIGGER field_option_revision_update AFTER UPDATE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;
CREATE TRIGGER field_option_revision_delete AFTER DELETE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=OLD.field_id); END;
CREATE TABLE field_conversion_preview (
  id TEXT PRIMARY KEY NOT NULL,
  field_id TEXT NOT NULL REFERENCES custom_field_definition(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  configuration_revision INTEGER NOT NULL,
  value_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX field_conversion_preview_owner_idx ON field_conversion_preview(field_id,user_id);
CREATE INDEX field_conversion_preview_expiry_idx ON field_conversion_preview(expires_at);
CREATE TABLE field_conversion_guard (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES custom_field_definition(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL
);
DROP TRIGGER custom_field_type_with_values;
CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
AND NOT EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=OLD.id AND source_type=OLD.type AND target_type=NEW.type)
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

DROP TRIGGER custom_field_value_validate_update;
CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND (archived_at IS NULL OR (
      json_array_length(OLD.json_value)=1 AND json_extract(OLD.json_value,'$[0]')=NEW.option_id
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='multiselect' AND target_type='select')
    ))
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND (archived_at IS NULL OR (
      OLD.option_id=chosen.value AND json_array_length(NEW.json_value)=1
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='select' AND target_type='multiselect')
    ))
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;
-- Preserve the complete current field schema, including conversion tokens and revisions.

DROP TRIGGER "custom_field_active_user_insert";

DROP TRIGGER "custom_field_active_user_update";

DROP TRIGGER "membership_requires_reference_cleanup";

DROP TRIGGER "custom_field_position_insert";

DROP TRIGGER "custom_field_position_update";

DROP TRIGGER "custom_field_option_position_insert";

DROP TRIGGER "custom_field_option_position_update";

DROP TRIGGER "custom_field_identity_immutable";

DROP TRIGGER "custom_field_option_owner_immutable";

DROP TRIGGER "custom_field_option_available_insert";

DROP TRIGGER "custom_field_option_available_update";

DROP TRIGGER "custom_field_value_validate_insert";

DROP TRIGGER "custom_field_rating_config_update";

DROP TRIGGER "field_configuration_insert";

DROP TRIGGER "field_configuration_update";

DROP TRIGGER "field_configuration_delete";

DROP TRIGGER "formula_field_value_insert";

DROP TRIGGER "formula_field_config_insert";

DROP TRIGGER "formula_field_value_update";

DROP TRIGGER "formula_field_config_update";

DROP TRIGGER "field_value_revision_definition";

DROP TRIGGER "field_value_revision_insert";

DROP TRIGGER "field_value_revision_update";

DROP TRIGGER "field_value_revision_delete";

DROP TRIGGER "field_option_revision_insert";

DROP TRIGGER "field_option_revision_update";

DROP TRIGGER "field_option_revision_delete";

DROP TRIGGER "custom_field_type_with_values";

DROP TRIGGER "custom_field_value_validate_update";

CREATE TABLE "custom_field_definition_next" (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal')),
  `key` text NOT NULL,
  `label` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer', 'formula', 'file')),
  `config_json` text CHECK (`config_json` IS NULL OR json_valid(`config_json`)),
  `required` integer DEFAULT false NOT NULL,
  `show_on_sheet` integer DEFAULT true NOT NULL,
  `show_on_table` integer DEFAULT false NOT NULL,
  `show_on_filter` integer DEFAULT false NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, deleted_at integer);

INSERT INTO custom_field_definition_next SELECT * FROM custom_field_definition;

CREATE TABLE "custom_field_option_next" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition_next" (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);

INSERT INTO custom_field_option_next SELECT * FROM custom_field_option;

CREATE TABLE "custom_field_value_next" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition_next" (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES "custom_field_option_next" (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  json_value text CHECK (json_value IS NULL OR json_valid(json_value)),
  customer_reference_id text REFERENCES contact(id) ON DELETE RESTRICT,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL)) = 1)
);

INSERT INTO custom_field_value_next SELECT * FROM custom_field_value;

CREATE TABLE field_value_revision_next (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES custom_field_definition_next(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO field_value_revision_next SELECT * FROM field_value_revision;

CREATE TABLE field_conversion_preview_next (
  id TEXT PRIMARY KEY NOT NULL,
  field_id TEXT NOT NULL REFERENCES custom_field_definition_next(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  configuration_revision INTEGER NOT NULL,
  value_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO field_conversion_preview_next SELECT * FROM field_conversion_preview;

CREATE TABLE field_conversion_guard_next (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES custom_field_definition_next(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL
);

INSERT INTO field_conversion_guard_next SELECT * FROM field_conversion_guard;

DROP TABLE field_conversion_guard;

DROP TABLE field_conversion_preview;

DROP TABLE field_value_revision;

DROP TABLE custom_field_value;

DROP TABLE custom_field_option;

DROP TABLE custom_field_definition;

ALTER TABLE custom_field_definition_next RENAME TO custom_field_definition;

ALTER TABLE custom_field_option_next RENAME TO custom_field_option;

ALTER TABLE custom_field_value_next RENAME TO custom_field_value;

ALTER TABLE field_value_revision_next RENAME TO field_value_revision;

ALTER TABLE field_conversion_preview_next RENAME TO field_conversion_preview;

ALTER TABLE field_conversion_guard_next RENAME TO field_conversion_guard;

CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`, `key`);

CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`, `position`);

CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`, `position`);

CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`, `company_id`);

CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`, `contact_id`);

CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`, `deal_id`);

CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`, `text_value`);

CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`, `number_value`);

CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`, `date_value`);

CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);

CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

CREATE INDEX custom_field_value_customer_idx ON custom_field_value(customer_reference_id);

CREATE UNIQUE INDEX field_conversion_preview_owner_idx ON field_conversion_preview(field_id,user_id);

CREATE INDEX field_conversion_preview_expiry_idx ON field_conversion_preview(expires_at);

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

CREATE TRIGGER custom_field_position_insert BEFORE INSERT ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_position_update BEFORE UPDATE OF position ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_insert BEFORE INSERT ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_update BEFORE UPDATE OF position ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;

CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;

CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_value_validate_insert BEFORE INSERT ON custom_field_value
BEGIN
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_rating_config_update BEFORE UPDATE OF config_json ON custom_field_definition
WHEN NEW.type='rating' AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=NEW.id AND number_value > coalesce(json_extract(NEW.config_json,'$.ratingMax'),5))
BEGIN SELECT RAISE(ABORT, 'field_rating_has_values'); END;

CREATE TRIGGER field_configuration_insert AFTER INSERT ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_update AFTER UPDATE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_delete AFTER DELETE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=OLD.entity; END;

CREATE TRIGGER formula_field_value_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_insert BEFORE INSERT ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER formula_field_value_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_update BEFORE UPDATE ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER field_value_revision_definition AFTER INSERT ON custom_field_definition
BEGIN INSERT INTO field_value_revision(field_id) VALUES(NEW.id); END;

CREATE TRIGGER field_value_revision_insert AFTER INSERT ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=NEW.field_id; END;

CREATE TRIGGER field_value_revision_update AFTER UPDATE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id IN (OLD.field_id,NEW.field_id); END;

CREATE TRIGGER field_value_revision_delete AFTER DELETE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=OLD.field_id; END;

CREATE TRIGGER field_option_revision_insert AFTER INSERT ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_update AFTER UPDATE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_delete AFTER DELETE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=OLD.field_id); END;

CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
AND (OLD.type='file' OR NEW.type='file' OR NOT EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=OLD.id AND source_type=OLD.type AND target_type=NEW.type))
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND (archived_at IS NULL OR (
      json_array_length(OLD.json_value)=1 AND json_extract(OLD.json_value,'$[0]')=NEW.option_id
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='multiselect' AND target_type='select')
    ))
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND (archived_at IS NULL OR (
      OLD.option_id=chosen.value AND json_array_length(NEW.json_value)=1
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='select' AND target_type='multiselect')
    ))
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TABLE crm_file (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal')),
  record_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  size INTEGER NOT NULL CHECK(typeof(size)='integer' AND size BETWEEN 0 AND 10485760),
  status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','cleaning')),
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  cleanup_attempted_at INTEGER,
  CHECK((status='ready' AND ready_at IS NOT NULL) OR (status!='ready' AND ready_at IS NULL))
);
CREATE UNIQUE INDEX crm_file_object_key_unique ON crm_file(object_key);
CREATE INDEX crm_file_anchor_idx ON crm_file(entity,record_id,field_id);
CREATE INDEX crm_file_cleanup_idx ON crm_file(status,created_at);
CREATE TRIGGER crm_file_pending_insert BEFORE INSERT ON crm_file
WHEN NEW.status!='pending'
BEGIN SELECT RAISE(ABORT,'file_initial_status_invalid'); END;
CREATE TRIGGER crm_file_immutable_update BEFORE UPDATE ON crm_file
WHEN NEW.id IS NOT OLD.id OR NEW.object_key IS NOT OLD.object_key
 OR NEW.entity IS NOT OLD.entity OR NEW.record_id IS NOT OLD.record_id
 OR NEW.field_id IS NOT OLD.field_id OR NEW.uploader_id IS NOT OLD.uploader_id
 OR NEW.file_name IS NOT OLD.file_name OR NEW.size IS NOT OLD.size OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.status='ready' AND (NEW.status IS NOT OLD.status OR NEW.ready_at IS NOT OLD.ready_at))
 OR (OLD.status='cleaning' AND NEW.status!='cleaning')
 OR (OLD.status='failed' AND NEW.status NOT IN ('failed','cleaning'))
BEGIN SELECT RAISE(ABORT,'file_metadata_immutable'); END;
CREATE TRIGGER crm_file_preserve_key BEFORE DELETE ON crm_file
BEGIN SELECT RAISE(ABORT,'file_key_retained'); END;

CREATE TRIGGER custom_field_file_validate_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id))
  )
 );
END;

CREATE TRIGGER custom_field_file_validate_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id))
  )
 );
END;
CREATE TABLE module_setting (
  entity TEXT PRIMARY KEY NOT NULL CHECK (entity IN ('company','contact','deal')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision) = 'integer' AND revision >= 0),
  updated_at INTEGER NOT NULL
);
INSERT INTO module_setting (entity, enabled, revision, updated_at) VALUES
  ('company',1,0,0), ('contact',1,0,0), ('deal',1,0,0);
CREATE TRIGGER module_setting_entity_immutable
BEFORE UPDATE OF entity ON module_setting
WHEN NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'module entity is immutable'); END;
CREATE TRIGGER module_setting_preserve
BEFORE DELETE ON module_setting
BEGIN SELECT RAISE(ABORT, 'module settings must be retained'); END;
CREATE TABLE record_layout (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  fields_json TEXT NOT NULL DEFAULT 'null' CHECK(json_valid(fields_json)),
  updated_at INTEGER NOT NULL
);
INSERT INTO record_layout(entity, updated_at) VALUES ('company',0),('contact',0),('deal',0);
CREATE TRIGGER record_layout_identity BEFORE UPDATE OF entity ON record_layout
WHEN NEW.entity <> OLD.entity BEGIN SELECT RAISE(ABORT,'layout_identity_immutable'); END;
CREATE TRIGGER record_layout_delete BEFORE DELETE ON record_layout
BEGIN SELECT RAISE(ABORT,'layout_delete_forbidden'); END;
CREATE TABLE record_draft (
  id TEXT PRIMARY KEY NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal')),
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK(expires_at > created_at)
);
CREATE TRIGGER record_draft_identity BEFORE UPDATE ON record_draft
WHEN NEW.id <> OLD.id OR NEW.entity <> OLD.entity OR NEW.user_id <> OLD.user_id
  OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at
  OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS NOT OLD.consumed_at)
BEGIN SELECT RAISE(ABORT,'draft_identity_immutable'); END;
ALTER TABLE deal_stage ADD COLUMN label TEXT CHECK(label IS NULL OR length(trim(label)) BETWEEN 1 AND 100);
ALTER TABLE deal_stage ADD COLUMN archived_at INTEGER;
CREATE TABLE deal_stage_catalog_revision (
  id TEXT PRIMARY KEY NOT NULL CHECK(id='stages'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO deal_stage_catalog_revision(id, revision) VALUES ('stages',0);
CREATE TRIGGER deal_stage_identity BEFORE UPDATE ON deal_stage
WHEN NEW.id <> OLD.id OR NEW.label_key <> OLD.label_key OR NEW.closed_state <> OLD.closed_state
BEGIN SELECT RAISE(ABORT,'deal_stage_identity_immutable'); END;
CREATE TRIGGER deal_stage_default_available BEFORE UPDATE OF archived_at ON deal_stage
WHEN OLD.id='demo-booked' AND NEW.archived_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'deal_stage_default_required'); END;
CREATE TRIGGER deal_stage_keep_history BEFORE DELETE ON deal_stage
BEGIN SELECT RAISE(ABORT,'deal_stage_delete_forbidden'); END;
CREATE TRIGGER deal_stage_insert_revision AFTER INSERT ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;
CREATE TRIGGER deal_stage_update_revision AFTER UPDATE ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;
CREATE TRIGGER deal_active_stage_insert BEFORE INSERT ON deal
WHEN NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;
CREATE TRIGGER deal_active_stage_update BEFORE UPDATE OF stage_id ON deal
WHEN NEW.stage_id <> OLD.stage_id AND NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;
-- Preserve dependent rows before extending entity checks and polymorphic anchors.

DROP TRIGGER "membership_keep_last_owner_on_role_change";

DROP TRIGGER "membership_keep_last_owner_on_status_change";

DROP TRIGGER "membership_keep_last_owner_on_delete";

DROP TRIGGER "company_active_owner_insert";

DROP TRIGGER "company_active_owner_update";

DROP TRIGGER "contact_active_owner_insert";

DROP TRIGGER "contact_active_owner_update";

DROP TRIGGER "deal_active_owner_insert";

DROP TRIGGER "deal_active_owner_update";

DROP TRIGGER "saved_view_active_owner_insert";

DROP TRIGGER "saved_view_active_owner_update";

DROP TRIGGER "activity_visibility_active_member_insert";

DROP TRIGGER "activity_visibility_active_member_update";

DROP TRIGGER "deal_required_relationships_insert";

DROP TRIGGER "deal_required_relationships_update";

DROP TRIGGER "deal_contact_company_insert";

DROP TRIGGER "deal_contact_company_update";

DROP TRIGGER "contact_company_preserves_deals";

DROP TRIGGER "deal_company_preserves_contacts";

DROP TRIGGER "activity_compatible_anchors_insert";

DROP TRIGGER "activity_history_immutable";

DROP TRIGGER "saved_view_creator_immutable";

DROP TRIGGER "saved_view_edit_active_owner";

DROP TRIGGER "deal_currency_job_insert";

DROP TRIGGER "deal_currency_job_money_update";

DROP TRIGGER "deal_currency_job_delete";

DROP TRIGGER "deal_money_revision_update";

DROP TRIGGER "exchange_rate_job_insert";

DROP TRIGGER "exchange_rate_job_update";

DROP TRIGGER "exchange_rate_job_delete";

DROP TRIGGER "membership_default_profile";

DROP TRIGGER "member_branch_active_insert";

DROP TRIGGER "member_branch_active_update";

DROP TRIGGER "branch_archive_in_use";

DROP TRIGGER "branch_default_active";

DROP TRIGGER "membership_clear_branches";

DROP TRIGGER "saved_view_default_visible_insert";

DROP TRIGGER "saved_view_default_visible_update";

DROP TRIGGER "saved_view_default_unshare";

DROP TRIGGER "custom_field_active_user_insert";

DROP TRIGGER "custom_field_active_user_update";

DROP TRIGGER "membership_requires_reference_cleanup";

DROP TRIGGER "custom_field_position_insert";

DROP TRIGGER "custom_field_position_update";

DROP TRIGGER "custom_field_option_position_insert";

DROP TRIGGER "custom_field_option_position_update";

DROP TRIGGER "custom_field_identity_immutable";

DROP TRIGGER "custom_field_option_owner_immutable";

DROP TRIGGER "custom_field_option_available_insert";

DROP TRIGGER "custom_field_option_available_update";

DROP TRIGGER "custom_field_value_validate_insert";

DROP TRIGGER "custom_field_rating_config_update";

DROP TRIGGER "field_configuration_insert";

DROP TRIGGER "field_configuration_update";

DROP TRIGGER "field_configuration_delete";

DROP TRIGGER "formula_field_value_insert";

DROP TRIGGER "formula_field_config_insert";

DROP TRIGGER "formula_field_value_update";

DROP TRIGGER "formula_field_config_update";

DROP TRIGGER "field_value_revision_definition";

DROP TRIGGER "field_value_revision_insert";

DROP TRIGGER "field_value_revision_update";

DROP TRIGGER "field_value_revision_delete";

DROP TRIGGER "field_option_revision_insert";

DROP TRIGGER "field_option_revision_update";

DROP TRIGGER "field_option_revision_delete";

DROP TRIGGER "custom_field_type_with_values";

DROP TRIGGER "custom_field_value_validate_update";

DROP TRIGGER "crm_file_pending_insert";

DROP TRIGGER "crm_file_immutable_update";

DROP TRIGGER "crm_file_preserve_key";

DROP TRIGGER "custom_field_file_validate_insert";

DROP TRIGGER "custom_field_file_validate_update";

DROP TRIGGER "module_setting_entity_immutable";

DROP TRIGGER "module_setting_preserve";

DROP TRIGGER "record_layout_identity";

DROP TRIGGER "record_layout_delete";

DROP TRIGGER "record_draft_identity";

DROP TRIGGER "deal_stage_identity";

DROP TRIGGER "deal_stage_default_available";

DROP TRIGGER "deal_stage_keep_history";

DROP TRIGGER "deal_stage_insert_revision";

DROP TRIGGER "deal_stage_update_revision";

DROP TRIGGER "deal_active_stage_insert";

DROP TRIGGER "deal_active_stage_update";

CREATE TABLE lead_source(id TEXT PRIMARY KEY NOT NULL,label TEXT,label_key TEXT NOT NULL,position INTEGER NOT NULL UNIQUE,archived_at INTEGER);
CREATE TABLE lead_status(id TEXT PRIMARY KEY NOT NULL,label TEXT,label_key TEXT NOT NULL,position INTEGER NOT NULL UNIQUE,archived_at INTEGER,meaning TEXT NOT NULL CHECK(meaning IN ('working','rejected','converted')) CHECK((meaning='converted')=(id='converted')),requires_reason INTEGER NOT NULL DEFAULT 0 CHECK(requires_reason IN (0,1)));
CREATE TABLE lead_settings_revision(id TEXT PRIMARY KEY NOT NULL CHECK(id='settings'),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
INSERT INTO lead_settings_revision VALUES('settings',0);
INSERT INTO lead_source VALUES('manual',NULL,'leadSource.manual',10,NULL);
INSERT INTO lead_status VALUES('new',NULL,'leadStatus.new',10,NULL,'working',0),('contacted',NULL,'leadStatus.contacted',20,NULL,'working',0),('nurturing',NULL,'leadStatus.nurturing',30,NULL,'working',0),('unqualified',NULL,'leadStatus.unqualified',40,NULL,'rejected',0),('converted',NULL,'leadStatus.converted',50,NULL,'converted',0);
CREATE TABLE lead(
 id TEXT PRIMARY KEY NOT NULL,first_name TEXT NOT NULL,last_name TEXT,email TEXT,phone TEXT,normalized_email TEXT,normalized_phone TEXT,title TEXT,description TEXT,
 company_id TEXT REFERENCES company(id) ON DELETE SET NULL,source_id TEXT NOT NULL DEFAULT 'manual' REFERENCES lead_source(id) ON DELETE RESTRICT,status_id TEXT NOT NULL DEFAULT 'new' REFERENCES lead_status(id) ON DELETE RESTRICT,rejection_reason TEXT,
 owner_membership_id TEXT REFERENCES singleton_membership(user_id) ON DELETE SET NULL,creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),last_activity_at INTEGER,archived_at INTEGER,converted_at INTEGER,converted_contact_id TEXT REFERENCES contact(id) ON DELETE RESTRICT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 CHECK((converted_at IS NULL AND converted_contact_id IS NULL AND status_id!='converted') OR (converted_at IS NOT NULL AND converted_contact_id IS NOT NULL AND status_id='converted'))
);
CREATE INDEX lead_source_idx ON lead(source_id); CREATE INDEX lead_status_idx ON lead(status_id); CREATE INDEX lead_owner_idx ON lead(owner_membership_id); CREATE INDEX lead_email_idx ON lead(normalized_email); CREATE INDEX lead_phone_idx ON lead(normalized_phone); CREATE INDEX lead_created_idx ON lead(created_at,id);
CREATE TABLE lead_collaborator(lead_id TEXT NOT NULL REFERENCES lead(id) ON DELETE CASCADE,membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,PRIMARY KEY(lead_id,membership_id));
CREATE INDEX lead_collaborator_member_idx ON lead_collaborator(membership_id,lead_id);
CREATE TABLE lead_mapping(id TEXT PRIMARY KEY NOT NULL CHECK(id='contact'),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),mappings_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(mappings_json)),auto_order INTEGER NOT NULL DEFAULT 0 CHECK(auto_order=0),auto_deal INTEGER NOT NULL DEFAULT 0 CHECK(auto_deal=0),updated_at INTEGER NOT NULL);
INSERT INTO lead_mapping(id,mappings_json,updated_at) VALUES('contact','[{"source":"builtin:firstName","target":"builtin:firstName"},{"source":"builtin:lastName","target":"builtin:lastName"},{"source":"builtin:email","target":"builtin:email"},{"source":"builtin:phone","target":"builtin:phone"},{"source":"builtin:title","target":"builtin:title"},{"source":"builtin:companyId","target":"builtin:companyId"},{"source":"builtin:ownerMembershipId","target":"builtin:ownerMembershipId"}]',0);
CREATE TABLE lead_conversion(id TEXT PRIMARY KEY NOT NULL,lead_id TEXT NOT NULL UNIQUE REFERENCES lead(id) ON DELETE RESTRICT,operation_key TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,mode TEXT NOT NULL CHECK(mode IN ('create','link')),lead_revision INTEGER NOT NULL,mapping_revision INTEGER NOT NULL,snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),result_json TEXT NOT NULL CHECK(json_valid(result_json)),completed_at INTEGER NOT NULL);
ALTER TABLE contact ADD COLUMN normalized_phone TEXT;
CREATE INDEX contact_normalized_phone_idx ON contact(normalized_phone);
WITH RECURSIVE digits(id,rest,value,valid) AS (
 SELECT id,CASE WHEN substr(trim(coalesce(phone,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),1,1)='+' THEN substr(trim(coalesce(phone,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),2) ELSE trim(coalesce(phone,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) END,CASE WHEN substr(trim(coalesce(phone,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),1,1)='+' THEN '+' ELSE '' END,1 FROM contact
 UNION ALL SELECT id,substr(rest,2),value || CASE WHEN substr(rest,1,1) GLOB '[0-9]' THEN substr(rest,1,1) ELSE '' END,
 valid AND (substr(rest,1,1) GLOB '[0-9]' OR instr('().-' || char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279),substr(rest,1,1))>0) FROM digits WHERE length(rest)>0
) UPDATE contact SET normalized_phone=(SELECT CASE WHEN valid=0 OR value IN ('','+') THEN NULL ELSE value END FROM digits WHERE digits.id=contact.id AND rest='');


CREATE TABLE "activity_lead_backup" AS SELECT * FROM "activity";

CREATE TABLE "activity_visibility_lead_backup" AS SELECT * FROM "activity_visibility";

CREATE TABLE "crm_file_lead_backup" AS SELECT * FROM "crm_file";

CREATE TABLE "custom_field_definition_lead_backup" AS SELECT * FROM "custom_field_definition";

CREATE TABLE "custom_field_option_lead_backup" AS SELECT * FROM "custom_field_option";

CREATE TABLE "custom_field_value_lead_backup" AS SELECT * FROM "custom_field_value";

CREATE TABLE "field_configuration_revision_lead_backup" AS SELECT * FROM "field_configuration_revision";

CREATE TABLE "field_conversion_guard_lead_backup" AS SELECT * FROM "field_conversion_guard";

CREATE TABLE "field_conversion_preview_lead_backup" AS SELECT * FROM "field_conversion_preview";

CREATE TABLE "field_value_revision_lead_backup" AS SELECT * FROM "field_value_revision";

CREATE TABLE "module_setting_lead_backup" AS SELECT * FROM "module_setting";

CREATE TABLE "record_draft_lead_backup" AS SELECT * FROM "record_draft";

CREATE TABLE "record_layout_lead_backup" AS SELECT * FROM "record_layout";

CREATE TABLE "saved_view_lead_backup" AS SELECT * FROM "saved_view";

CREATE TABLE "saved_view_default_lead_backup" AS SELECT * FROM "saved_view_default";

DROP TABLE "saved_view_default";

DROP TABLE "saved_view";

DROP TABLE "record_layout";

DROP TABLE "record_draft";

DROP TABLE "module_setting";

DROP TABLE "field_value_revision";

DROP TABLE "field_conversion_preview";

DROP TABLE "field_conversion_guard";

DROP TABLE "field_configuration_revision";

DROP TABLE "custom_field_value";

DROP TABLE "custom_field_option";

DROP TABLE "custom_field_definition";

DROP TABLE "crm_file";

DROP TABLE "activity_visibility";

DROP TABLE "activity";

CREATE TABLE "activity" (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL CHECK (type IN ('note', 'call', 'meeting', 'task', 'stage_change')),
  subject text,
  content text,
  occurred_at integer,
  due_at integer,
  completed_at integer,
  company_id text REFERENCES company(id) ON DELETE CASCADE,
  contact_id text REFERENCES contact(id) ON DELETE CASCADE,
  deal_id text REFERENCES deal(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  metadata_json text CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  "lead_id" TEXT REFERENCES lead(id) ON DELETE CASCADE,
  CHECK (((company_id IS NOT NULL) + (contact_id IS NOT NULL) + (deal_id IS NOT NULL) + (lead_id IS NOT NULL)) >= 1)
);

INSERT INTO "activity"("id","type","subject","content","occurred_at","due_at","completed_at","company_id","contact_id","deal_id","author_user_id","metadata_json","created_at","updated_at") SELECT "id","type","subject","content","occurred_at","due_at","completed_at","company_id","contact_id","deal_id","author_user_id","metadata_json","created_at","updated_at" FROM "activity_lead_backup";

DROP TABLE "activity_lead_backup";

CREATE TABLE `activity_visibility` (
  `activity_id` text NOT NULL REFERENCES `activity` (`id`) ON DELETE CASCADE,
  `membership_id` text NOT NULL REFERENCES `singleton_membership` (`user_id`) ON DELETE CASCADE,
  PRIMARY KEY (`activity_id`, `membership_id`)
);

INSERT INTO "activity_visibility"("activity_id","membership_id") SELECT "activity_id","membership_id" FROM "activity_visibility_lead_backup";

DROP TABLE "activity_visibility_lead_backup";

CREATE TABLE crm_file (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  record_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  size INTEGER NOT NULL CHECK(typeof(size)='integer' AND size BETWEEN 0 AND 10485760),
  status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','cleaning')),
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  cleanup_attempted_at INTEGER,
  CHECK((status='ready' AND ready_at IS NOT NULL) OR (status!='ready' AND ready_at IS NULL))
);

INSERT INTO "crm_file"("id","object_key","entity","record_id","field_id","uploader_id","file_name","size","status","created_at","ready_at","cleanup_attempted_at") SELECT "id","object_key","entity","record_id","field_id","uploader_id","file_name","size","status","created_at","ready_at","cleanup_attempted_at" FROM "crm_file_lead_backup";

DROP TABLE "crm_file_lead_backup";

CREATE TABLE "custom_field_definition" (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal', 'lead')),
  `key` text NOT NULL,
  `label` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer', 'formula', 'file')),
  `config_json` text CHECK (`config_json` IS NULL OR json_valid(`config_json`)),
  `required` integer DEFAULT false NOT NULL,
  `show_on_sheet` integer DEFAULT true NOT NULL,
  `show_on_table` integer DEFAULT false NOT NULL,
  `show_on_filter` integer DEFAULT false NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, deleted_at integer);

INSERT INTO "custom_field_definition"("id","entity","key","label","type","config_json","required","show_on_sheet","show_on_table","show_on_filter","position","archived_at","created_at","updated_at","deleted_at") SELECT "id","entity","key","label","type","config_json","required","show_on_sheet","show_on_table","show_on_filter","position","archived_at","created_at","updated_at","deleted_at" FROM "custom_field_definition_lead_backup";

DROP TABLE "custom_field_definition_lead_backup";

CREATE TABLE "custom_field_option" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition" (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);

INSERT INTO "custom_field_option"("id","field_id","label","position","archived_at") SELECT "id","field_id","label","position","archived_at" FROM "custom_field_option_lead_backup";

DROP TABLE "custom_field_option_lead_backup";

CREATE TABLE "custom_field_value" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition" (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES "custom_field_option" (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  json_value text CHECK (json_value IS NULL OR json_valid(json_value)),
  customer_reference_id text REFERENCES contact(id) ON DELETE RESTRICT,
  "lead_id" TEXT REFERENCES lead(id) ON DELETE CASCADE,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL) + (`lead_id` IS NOT NULL)) = 1)
);

INSERT INTO "custom_field_value"("id","field_id","company_id","contact_id","deal_id","text_value","number_value","date_value","boolean_value","option_id","user_membership_id","updated_at","json_value","customer_reference_id") SELECT "id","field_id","company_id","contact_id","deal_id","text_value","number_value","date_value","boolean_value","option_id","user_membership_id","updated_at","json_value","customer_reference_id" FROM "custom_field_value_lead_backup";

DROP TABLE "custom_field_value_lead_backup";

CREATE TABLE field_configuration_revision (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "field_configuration_revision"("entity","revision") SELECT "entity","revision" FROM "field_configuration_revision_lead_backup";

DROP TABLE "field_configuration_revision_lead_backup";

CREATE TABLE "field_conversion_guard" (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL
);

INSERT INTO "field_conversion_guard"("field_id","source_type","target_type") SELECT "field_id","source_type","target_type" FROM "field_conversion_guard_lead_backup";

DROP TABLE "field_conversion_guard_lead_backup";

CREATE TABLE "field_conversion_preview" (
  id TEXT PRIMARY KEY NOT NULL,
  field_id TEXT NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  configuration_revision INTEGER NOT NULL,
  value_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO "field_conversion_preview"("id","field_id","user_id","source_type","target_type","config_json","configuration_revision","value_revision","expires_at") SELECT "id","field_id","user_id","source_type","target_type","config_json","configuration_revision","value_revision","expires_at" FROM "field_conversion_preview_lead_backup";

DROP TABLE "field_conversion_preview_lead_backup";

CREATE TABLE "field_value_revision" (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "field_value_revision"("field_id","revision") SELECT "field_id","revision" FROM "field_value_revision_lead_backup";

DROP TABLE "field_value_revision_lead_backup";

CREATE TABLE module_setting (
  entity TEXT PRIMARY KEY NOT NULL CHECK (entity IN ('company','contact','deal','lead')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision) = 'integer' AND revision >= 0),
  updated_at INTEGER NOT NULL
);

INSERT INTO "module_setting"("entity","enabled","revision","updated_at") SELECT "entity","enabled","revision","updated_at" FROM "module_setting_lead_backup";

DROP TABLE "module_setting_lead_backup";

CREATE TABLE record_draft (
  id TEXT PRIMARY KEY NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK(expires_at > created_at)
);

INSERT INTO "record_draft"("id","entity","user_id","expires_at","consumed_at","created_at") SELECT "id","entity","user_id","expires_at","consumed_at","created_at" FROM "record_draft_lead_backup";

DROP TABLE "record_draft_lead_backup";

CREATE TABLE record_layout (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  fields_json TEXT NOT NULL DEFAULT 'null' CHECK(json_valid(fields_json)),
  updated_at INTEGER NOT NULL
);

INSERT INTO "record_layout"("entity","revision","fields_json","updated_at") SELECT "entity","revision","fields_json","updated_at" FROM "record_layout_lead_backup";

DROP TABLE "record_layout_lead_backup";

CREATE TABLE `saved_view` (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal', 'lead')),
  `name` text NOT NULL,
  `shared` integer DEFAULT false NOT NULL,
  `state_json` text NOT NULL CHECK (json_valid(`state_json`)),
  `owner_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, creator_user_id text REFERENCES user(id) ON DELETE SET NULL);

INSERT INTO "saved_view"("id","entity","name","shared","state_json","owner_membership_id","created_at","updated_at","creator_user_id") SELECT "id","entity","name","shared","state_json","owner_membership_id","created_at","updated_at","creator_user_id" FROM "saved_view_lead_backup";

DROP TABLE "saved_view_lead_backup";

CREATE TABLE saved_view_default (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  view_id TEXT NOT NULL REFERENCES saved_view(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, entity)
);

INSERT INTO "saved_view_default"("user_id","entity","view_id") SELECT "user_id","entity","view_id" FROM "saved_view_default_lead_backup";

DROP TABLE "saved_view_default_lead_backup";

CREATE INDEX `activity_visibility_member_idx` ON `activity_visibility` (`membership_id`);

CREATE UNIQUE INDEX `saved_view_owner_name_unique` ON `saved_view` (`entity`, `owner_membership_id`, `name`);

CREATE INDEX `saved_view_entity_shared_idx` ON `saved_view` (`entity`, `shared`);

CREATE INDEX activity_company_created_idx ON activity(company_id, created_at, id);

CREATE INDEX activity_contact_created_idx ON activity(contact_id, created_at, id);

CREATE INDEX activity_deal_created_idx ON activity(deal_id, created_at, id);

CREATE INDEX activity_due_idx ON activity(due_at);

CREATE INDEX activity_author_idx ON activity(author_user_id);

CREATE UNIQUE INDEX saved_view_creator_name_unique ON saved_view(entity, creator_user_id, name);

CREATE INDEX saved_view_default_view_idx ON saved_view_default(view_id);

CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`, `key`);

CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`, `position`);

CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`, `position`);

CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`, `company_id`);

CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`, `contact_id`);

CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`, `deal_id`);

CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`, `text_value`);

CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`, `number_value`);

CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`, `date_value`);

CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);

CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

CREATE INDEX custom_field_value_customer_idx ON custom_field_value(customer_reference_id);

CREATE UNIQUE INDEX field_conversion_preview_owner_idx ON field_conversion_preview(field_id,user_id);

CREATE INDEX field_conversion_preview_expiry_idx ON field_conversion_preview(expires_at);

CREATE UNIQUE INDEX crm_file_object_key_unique ON crm_file(object_key);

CREATE INDEX crm_file_anchor_idx ON crm_file(entity,record_id,field_id);

CREATE INDEX crm_file_cleanup_idx ON crm_file(status,created_at);

CREATE UNIQUE INDEX custom_field_lead_unique ON custom_field_value(field_id,lead_id);

CREATE INDEX activity_lead_created_idx ON activity(lead_id,created_at,id);

INSERT INTO module_setting(entity,enabled,revision,updated_at) VALUES('lead',1,0,0);

INSERT INTO record_layout(entity,updated_at) VALUES('lead',0);

INSERT INTO field_configuration_revision(entity,revision) VALUES('lead',0);

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

CREATE TRIGGER `deal_required_relationships_insert`
BEFORE INSERT ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_required_relationships_update`
BEFORE UPDATE OF `company_id`, `owner_membership_id` ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_contact_company_insert`
BEFORE INSERT ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `deal_contact_company_update`
BEFORE UPDATE OF `deal_id`, `contact_id` ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `contact_company_preserves_deals`
BEFORE UPDATE OF `company_id` ON `contact`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `deal` ON `deal`.`id` = `deal_contact`.`deal_id`
     WHERE `deal_contact`.`contact_id` = OLD.`id`
       AND (NEW.`company_id` IS NULL OR NEW.`company_id` != `deal`.`company_id`)
  ) THEN RAISE(ABORT, 'contact company conflicts with a deal') END);
END;

CREATE TRIGGER `deal_company_preserves_contacts`
BEFORE UPDATE OF `company_id` ON `deal`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `contact` ON `contact`.`id` = `deal_contact`.`contact_id`
     WHERE `deal_contact`.`deal_id` = OLD.`id`
       AND (`contact`.`company_id` IS NULL OR `contact`.`company_id` != NEW.`company_id`)
  ) THEN RAISE(ABORT, 'deal company conflicts with a contact') END);
END;

CREATE TRIGGER activity_compatible_anchors_insert
BEFORE INSERT ON activity
BEGIN
 SELECT (CASE WHEN NEW.lead_id IS NOT NULL AND (NEW.company_id IS NOT NULL OR NEW.contact_id IS NOT NULL OR NEW.deal_id IS NOT NULL) THEN RAISE(ABORT,'activity anchor mismatch') END);
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id = NEW.author_user_id AND status = 'active')
    THEN RAISE(ABORT, 'author membership is inactive') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact WHERE id = NEW.contact_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.deal_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM deal WHERE id = NEW.deal_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.deal_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact JOIN deal ON contact.company_id = deal.company_id WHERE contact.id = NEW.contact_id AND deal.id = NEW.deal_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
END;

CREATE TRIGGER activity_history_immutable
BEFORE UPDATE ON activity
WHEN OLD.type != 'task' OR NEW.type != OLD.type OR NEW.id != OLD.id
  OR NEW.author_user_id != OLD.author_user_id OR NEW.created_at != OLD.created_at
  OR NEW.company_id IS NOT OLD.company_id OR NEW.contact_id IS NOT OLD.contact_id
  OR NEW.lead_id IS NOT OLD.lead_id OR NEW.deal_id IS NOT OLD.deal_id OR NEW.subject IS NOT OLD.subject
  OR NEW.content IS NOT OLD.content OR NEW.occurred_at IS NOT OLD.occurred_at
  OR NEW.due_at IS NOT OLD.due_at OR NEW.metadata_json IS NOT OLD.metadata_json
BEGIN
  SELECT RAISE(ABORT, 'activity history is immutable');
END;

CREATE TRIGGER saved_view_creator_immutable BEFORE UPDATE OF creator_user_id ON saved_view
WHEN NEW.creator_user_id IS NOT NULL AND NEW.creator_user_id IS NOT OLD.creator_user_id
BEGIN SELECT RAISE(ABORT, 'saved_view_creator_immutable'); END;

CREATE TRIGGER saved_view_edit_active_owner BEFORE UPDATE ON saved_view
WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active'
)
BEGIN SELECT RAISE(ABORT, 'saved_view_owner_inactive'); END;

CREATE TRIGGER deal_currency_job_insert BEFORE INSERT ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_currency_job_money_update BEFORE UPDATE OF amount_minor,currency ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency)
 AND EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_currency_job_delete BEFORE DELETE ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_money_revision_update BEFORE UPDATE ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency) AND NEW.money_revision != OLD.money_revision + 1
BEGIN SELECT RAISE(ABORT,'deal_money_revision_conflict'); END;

CREATE TRIGGER exchange_rate_job_insert BEFORE INSERT ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER exchange_rate_job_update BEFORE UPDATE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER exchange_rate_job_delete BEFORE DELETE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER membership_default_profile AFTER INSERT ON singleton_membership
BEGIN
  INSERT INTO membership_access VALUES (NEW.user_id, 'standard-member');
END;

CREATE TRIGGER member_branch_active_insert BEFORE INSERT ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER member_branch_active_update BEFORE UPDATE ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER branch_archive_in_use BEFORE UPDATE OF archived_at ON branch WHEN NEW.archived_at IS NOT NULL
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM branch_setting WHERE default_branch_id=OLD.id)
    OR EXISTS (SELECT 1 FROM member_branch WHERE branch_id=OLD.id)
    THEN RAISE(ABORT, 'branch_in_use') END);
END;

CREATE TRIGGER branch_default_active BEFORE UPDATE OF default_branch_id ON branch_setting
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.default_branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER membership_clear_branches AFTER UPDATE OF status ON singleton_membership WHEN NEW.status='revoked'
BEGIN
  DELETE FROM member_branch WHERE membership_id=NEW.user_id;
END;

CREATE TRIGGER saved_view_default_visible_insert BEFORE INSERT ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;

CREATE TRIGGER saved_view_default_visible_update BEFORE UPDATE ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;

CREATE TRIGGER saved_view_default_unshare AFTER UPDATE OF shared ON saved_view
WHEN OLD.shared=1 AND NEW.shared=0
BEGIN DELETE FROM saved_view_default WHERE view_id=NEW.id AND user_id IS NOT NEW.creator_user_id; END;

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
    OR EXISTS (SELECT 1 FROM lead WHERE owner_membership_id=OLD.user_id) OR EXISTS (SELECT 1 FROM lead_collaborator WHERE membership_id=OLD.user_id) THEN RAISE(ABORT, 'membership references require cleanup') END);
END;

CREATE TRIGGER custom_field_position_insert BEFORE INSERT ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_position_update BEFORE UPDATE OF position ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_insert BEFORE INSERT ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_update BEFORE UPDATE OF position ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;

CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;

CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_value_validate_insert BEFORE INSERT ON custom_field_value
BEGIN
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL) OR (f.entity = 'lead' AND NEW.lead_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_rating_config_update BEFORE UPDATE OF config_json ON custom_field_definition
WHEN NEW.type='rating' AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=NEW.id AND number_value > coalesce(json_extract(NEW.config_json,'$.ratingMax'),5))
BEGIN SELECT RAISE(ABORT, 'field_rating_has_values'); END;

CREATE TRIGGER field_configuration_insert AFTER INSERT ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_update AFTER UPDATE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_delete AFTER DELETE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=OLD.entity; END;

CREATE TRIGGER formula_field_value_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_insert BEFORE INSERT ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER formula_field_value_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_update BEFORE UPDATE ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER field_value_revision_definition AFTER INSERT ON custom_field_definition
BEGIN INSERT INTO field_value_revision(field_id) VALUES(NEW.id); END;

CREATE TRIGGER field_value_revision_insert AFTER INSERT ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=NEW.field_id; END;

CREATE TRIGGER field_value_revision_update AFTER UPDATE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id IN (OLD.field_id,NEW.field_id); END;

CREATE TRIGGER field_value_revision_delete AFTER DELETE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=OLD.field_id; END;

CREATE TRIGGER field_option_revision_insert AFTER INSERT ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_update AFTER UPDATE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_delete AFTER DELETE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=OLD.field_id); END;

CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
AND (OLD.type='file' OR NEW.type='file' OR NOT EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=OLD.id AND source_type=OLD.type AND target_type=NEW.type))
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id AND NEW.lead_id IS OLD.lead_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL) OR (f.entity = 'lead' AND NEW.lead_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND (archived_at IS NULL OR (
      json_array_length(OLD.json_value)=1 AND json_extract(OLD.json_value,'$[0]')=NEW.option_id
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='multiselect' AND target_type='select')
    ))
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND (archived_at IS NULL OR (
      OLD.option_id=chosen.value AND json_array_length(NEW.json_value)=1
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='select' AND target_type='multiselect')
    ))
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER crm_file_pending_insert BEFORE INSERT ON crm_file
WHEN NEW.status!='pending'
BEGIN SELECT RAISE(ABORT,'file_initial_status_invalid'); END;

CREATE TRIGGER crm_file_immutable_update BEFORE UPDATE ON crm_file
WHEN NEW.id IS NOT OLD.id OR NEW.object_key IS NOT OLD.object_key
 OR NEW.entity IS NOT OLD.entity OR NEW.record_id IS NOT OLD.record_id
 OR NEW.field_id IS NOT OLD.field_id OR NEW.uploader_id IS NOT OLD.uploader_id
 OR NEW.file_name IS NOT OLD.file_name OR NEW.size IS NOT OLD.size OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.status='ready' AND (NEW.status IS NOT OLD.status OR NEW.ready_at IS NOT OLD.ready_at))
 OR (OLD.status='cleaning' AND NEW.status!='cleaning')
 OR (OLD.status='failed' AND NEW.status NOT IN ('failed','cleaning'))
BEGIN SELECT RAISE(ABORT,'file_metadata_immutable'); END;

CREATE TRIGGER crm_file_preserve_key BEFORE DELETE ON crm_file
BEGIN SELECT RAISE(ABORT,'file_key_retained'); END;

CREATE TRIGGER custom_field_file_validate_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id) OR (f.entity='lead' AND f.record_id=NEW.lead_id))
  )
 );
END;

CREATE TRIGGER custom_field_file_validate_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id) OR (f.entity='lead' AND f.record_id=NEW.lead_id))
  )
 );
END;

CREATE TRIGGER module_setting_entity_immutable
BEFORE UPDATE OF entity ON module_setting
WHEN NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'module entity is immutable'); END;

CREATE TRIGGER module_setting_preserve
BEFORE DELETE ON module_setting
BEGIN SELECT RAISE(ABORT, 'module settings must be retained'); END;

CREATE TRIGGER record_layout_identity BEFORE UPDATE OF entity ON record_layout
WHEN NEW.entity <> OLD.entity BEGIN SELECT RAISE(ABORT,'layout_identity_immutable'); END;

CREATE TRIGGER record_layout_delete BEFORE DELETE ON record_layout
BEGIN SELECT RAISE(ABORT,'layout_delete_forbidden'); END;

CREATE TRIGGER record_draft_identity BEFORE UPDATE ON record_draft
WHEN NEW.id <> OLD.id OR NEW.entity <> OLD.entity OR NEW.user_id <> OLD.user_id
  OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at
  OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS NOT OLD.consumed_at)
BEGIN SELECT RAISE(ABORT,'draft_identity_immutable'); END;

CREATE TRIGGER deal_stage_identity BEFORE UPDATE ON deal_stage
WHEN NEW.id <> OLD.id OR NEW.label_key <> OLD.label_key OR NEW.closed_state <> OLD.closed_state
BEGIN SELECT RAISE(ABORT,'deal_stage_identity_immutable'); END;

CREATE TRIGGER deal_stage_default_available BEFORE UPDATE OF archived_at ON deal_stage
WHEN OLD.id='demo-booked' AND NEW.archived_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'deal_stage_default_required'); END;

CREATE TRIGGER deal_stage_keep_history BEFORE DELETE ON deal_stage
BEGIN SELECT RAISE(ABORT,'deal_stage_delete_forbidden'); END;

CREATE TRIGGER deal_stage_insert_revision AFTER INSERT ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;

CREATE TRIGGER deal_stage_update_revision AFTER UPDATE ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;

CREATE TRIGGER deal_active_stage_insert BEFORE INSERT ON deal
WHEN NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;

CREATE TRIGGER deal_active_stage_update BEFORE UPDATE OF stage_id ON deal
WHEN NEW.stage_id <> OLD.stage_id AND NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;

CREATE TRIGGER lead_source_identity BEFORE UPDATE ON lead_source WHEN NEW.id IS NOT OLD.id OR NEW.label_key IS NOT OLD.label_key BEGIN SELECT RAISE(ABORT,'lead_catalog_identity_immutable'); END;
CREATE TRIGGER lead_status_identity BEFORE UPDATE ON lead_status WHEN NEW.id IS NOT OLD.id OR NEW.label_key IS NOT OLD.label_key OR NEW.meaning IS NOT OLD.meaning BEGIN SELECT RAISE(ABORT,'lead_catalog_identity_immutable'); END;
CREATE TRIGGER lead_source_default BEFORE UPDATE ON lead_source WHEN OLD.id='manual' AND NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'lead_default_required'); END;
CREATE TRIGGER lead_status_default BEFORE UPDATE ON lead_status WHEN OLD.id IN ('new','converted') AND NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'lead_default_required'); END;
CREATE TRIGGER lead_source_preserve BEFORE DELETE ON lead_source BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;
CREATE TRIGGER lead_status_preserve BEFORE DELETE ON lead_status BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;
CREATE TRIGGER lead_source_insert_revision AFTER INSERT ON lead_source BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;
CREATE TRIGGER lead_source_update_revision AFTER UPDATE ON lead_source BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;
CREATE TRIGGER lead_status_insert_revision AFTER INSERT ON lead_status BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;
CREATE TRIGGER lead_status_update_revision AFTER UPDATE ON lead_status BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;
CREATE TRIGGER lead_identity BEFORE UPDATE ON lead WHEN NEW.id IS NOT OLD.id OR NEW.creator_user_id IS NOT OLD.creator_user_id OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'lead_identity_immutable'); END;
CREATE TRIGGER lead_converted_identity BEFORE UPDATE ON lead WHEN OLD.converted_at IS NOT NULL AND (NEW.converted_at IS NOT OLD.converted_at OR NEW.converted_contact_id IS NOT OLD.converted_contact_id OR NEW.status_id IS NOT OLD.status_id) BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;
CREATE TRIGGER lead_source_insert BEFORE INSERT ON lead WHEN NOT EXISTS(SELECT 1 FROM lead_source WHERE id=NEW.source_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_source_unavailable'); END;
CREATE TRIGGER lead_source_update BEFORE UPDATE OF source_id ON lead WHEN NEW.source_id IS NOT OLD.source_id AND NOT EXISTS(SELECT 1 FROM lead_source WHERE id=NEW.source_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_source_unavailable'); END;
CREATE TRIGGER lead_status_insert BEFORE INSERT ON lead WHEN NOT EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_status_unavailable'); END;
CREATE TRIGGER lead_status_update BEFORE UPDATE OF status_id ON lead WHEN NEW.status_id IS NOT OLD.status_id AND NOT EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_status_unavailable'); END;
CREATE TRIGGER lead_reason_insert BEFORE INSERT ON lead WHEN EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND requires_reason=1) AND length(trim(coalesce(NEW.rejection_reason,'')))=0 BEGIN SELECT RAISE(ABORT,'lead_reason_required'); END;
CREATE TRIGGER lead_reason_update BEFORE UPDATE ON lead WHEN (NEW.status_id IS NOT OLD.status_id OR NEW.rejection_reason IS NOT OLD.rejection_reason) AND EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND requires_reason=1) AND length(trim(coalesce(NEW.rejection_reason,'')))=0 BEGIN SELECT RAISE(ABORT,'lead_reason_required'); END;
CREATE TRIGGER lead_owner_insert BEFORE INSERT ON lead WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_owner_inactive'); END;
CREATE TRIGGER lead_owner_update BEFORE UPDATE ON lead WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_owner_inactive'); END;
CREATE TRIGGER lead_collaborator_insert BEFORE INSERT ON lead_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_collaborator_inactive'); END;
CREATE TRIGGER lead_collaborator_update BEFORE UPDATE ON lead_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_collaborator_inactive'); END;
CREATE TRIGGER lead_conversion_update BEFORE UPDATE ON lead_conversion BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;
CREATE TRIGGER lead_conversion_delete BEFORE DELETE ON lead_conversion BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;
CREATE TRIGGER lead_conversion_result BEFORE INSERT ON lead_conversion WHEN NOT EXISTS(SELECT 1 FROM lead WHERE id=NEW.lead_id AND converted_contact_id=NEW.contact_id AND converted_at=NEW.completed_at AND status_id='converted') BEGIN SELECT RAISE(ABORT,'lead_conversion_result_mismatch'); END;
INSERT INTO access_grant(profile_id,permission) VALUES
('standard-member','lead.create'),('standard-member','lead.update'),('standard-member','lead.archive'),('standard-member','lead.restore'),('standard-member','lead.assign'),('standard-member','lead.convert');

CREATE INDEX lead_conversion_contact_completed_idx ON lead_conversion(contact_id,completed_at DESC,lead_id);
-- Preserve dependent records while adding catalog fields and activity anchors.

DROP TRIGGER "membership_keep_last_owner_on_role_change";

DROP TRIGGER "membership_keep_last_owner_on_status_change";

DROP TRIGGER "membership_keep_last_owner_on_delete";

DROP TRIGGER "company_active_owner_insert";

DROP TRIGGER "company_active_owner_update";

DROP TRIGGER "contact_active_owner_insert";

DROP TRIGGER "contact_active_owner_update";

DROP TRIGGER "deal_active_owner_insert";

DROP TRIGGER "deal_active_owner_update";

DROP TRIGGER "saved_view_active_owner_insert";

DROP TRIGGER "saved_view_active_owner_update";

DROP TRIGGER "activity_visibility_active_member_insert";

DROP TRIGGER "activity_visibility_active_member_update";

DROP TRIGGER "deal_required_relationships_insert";

DROP TRIGGER "deal_required_relationships_update";

DROP TRIGGER "deal_contact_company_insert";

DROP TRIGGER "deal_contact_company_update";

DROP TRIGGER "contact_company_preserves_deals";

DROP TRIGGER "deal_company_preserves_contacts";

DROP TRIGGER "activity_compatible_anchors_insert";

DROP TRIGGER "activity_history_immutable";

DROP TRIGGER "saved_view_creator_immutable";

DROP TRIGGER "saved_view_edit_active_owner";

DROP TRIGGER "deal_currency_job_insert";

DROP TRIGGER "deal_currency_job_money_update";

DROP TRIGGER "deal_currency_job_delete";

DROP TRIGGER "deal_money_revision_update";

DROP TRIGGER "exchange_rate_job_insert";

DROP TRIGGER "exchange_rate_job_update";

DROP TRIGGER "exchange_rate_job_delete";

DROP TRIGGER "membership_default_profile";

DROP TRIGGER "member_branch_active_insert";

DROP TRIGGER "member_branch_active_update";

DROP TRIGGER "branch_archive_in_use";

DROP TRIGGER "branch_default_active";

DROP TRIGGER "membership_clear_branches";

DROP TRIGGER "saved_view_default_visible_insert";

DROP TRIGGER "saved_view_default_visible_update";

DROP TRIGGER "saved_view_default_unshare";

DROP TRIGGER "custom_field_active_user_insert";

DROP TRIGGER "custom_field_active_user_update";

DROP TRIGGER "membership_requires_reference_cleanup";

DROP TRIGGER "custom_field_position_insert";

DROP TRIGGER "custom_field_position_update";

DROP TRIGGER "custom_field_option_position_insert";

DROP TRIGGER "custom_field_option_position_update";

DROP TRIGGER "custom_field_identity_immutable";

DROP TRIGGER "custom_field_option_owner_immutable";

DROP TRIGGER "custom_field_option_available_insert";

DROP TRIGGER "custom_field_option_available_update";

DROP TRIGGER "custom_field_value_validate_insert";

DROP TRIGGER "custom_field_rating_config_update";

DROP TRIGGER "field_configuration_insert";

DROP TRIGGER "field_configuration_update";

DROP TRIGGER "field_configuration_delete";

DROP TRIGGER "formula_field_value_insert";

DROP TRIGGER "formula_field_config_insert";

DROP TRIGGER "formula_field_value_update";

DROP TRIGGER "formula_field_config_update";

DROP TRIGGER "field_value_revision_definition";

DROP TRIGGER "field_value_revision_insert";

DROP TRIGGER "field_value_revision_update";

DROP TRIGGER "field_value_revision_delete";

DROP TRIGGER "field_option_revision_insert";

DROP TRIGGER "field_option_revision_update";

DROP TRIGGER "field_option_revision_delete";

DROP TRIGGER "custom_field_type_with_values";

DROP TRIGGER "custom_field_value_validate_update";

DROP TRIGGER "crm_file_pending_insert";

DROP TRIGGER "crm_file_immutable_update";

DROP TRIGGER "crm_file_preserve_key";

DROP TRIGGER "custom_field_file_validate_insert";

DROP TRIGGER "custom_field_file_validate_update";

DROP TRIGGER "module_setting_entity_immutable";

DROP TRIGGER "module_setting_preserve";

DROP TRIGGER "record_layout_identity";

DROP TRIGGER "record_layout_delete";

DROP TRIGGER "record_draft_identity";

DROP TRIGGER "deal_stage_identity";

DROP TRIGGER "deal_stage_default_available";

DROP TRIGGER "deal_stage_keep_history";

DROP TRIGGER "deal_stage_insert_revision";

DROP TRIGGER "deal_stage_update_revision";

DROP TRIGGER "deal_active_stage_insert";

DROP TRIGGER "deal_active_stage_update";

DROP TRIGGER "lead_source_identity";

DROP TRIGGER "lead_status_identity";

DROP TRIGGER "lead_source_default";

DROP TRIGGER "lead_status_default";

DROP TRIGGER "lead_source_preserve";

DROP TRIGGER "lead_status_preserve";

DROP TRIGGER "lead_source_insert_revision";

DROP TRIGGER "lead_source_update_revision";

DROP TRIGGER "lead_status_insert_revision";

DROP TRIGGER "lead_status_update_revision";

DROP TRIGGER "lead_identity";

DROP TRIGGER "lead_converted_identity";

DROP TRIGGER "lead_source_insert";

DROP TRIGGER "lead_source_update";

DROP TRIGGER "lead_status_insert";

DROP TRIGGER "lead_status_update";

DROP TRIGGER "lead_reason_insert";

DROP TRIGGER "lead_reason_update";

DROP TRIGGER "lead_owner_insert";

DROP TRIGGER "lead_owner_update";

DROP TRIGGER "lead_collaborator_insert";

DROP TRIGGER "lead_collaborator_update";

DROP TRIGGER "lead_conversion_update";

DROP TRIGGER "lead_conversion_delete";

DROP TRIGGER "lead_conversion_result";

CREATE TABLE product_category(id TEXT PRIMARY KEY NOT NULL,label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120),position INTEGER NOT NULL UNIQUE,archived_at INTEGER,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
CREATE TABLE product_category_revision(id TEXT PRIMARY KEY NOT NULL CHECK(id='categories'),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
INSERT INTO product_category_revision VALUES('categories',0);
CREATE TABLE product(id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('product','service','package')),name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),description TEXT,category_id TEXT REFERENCES product_category(id) ON DELETE RESTRICT,owner_membership_id TEXT REFERENCES singleton_membership(user_id) ON DELETE SET NULL,creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),archived_at INTEGER,last_activity_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX product_category_idx ON product(category_id); CREATE INDEX product_owner_idx ON product(owner_membership_id); CREATE INDEX product_created_idx ON product(created_at,id);
CREATE TABLE product_variant(id TEXT PRIMARY KEY NOT NULL,product_id TEXT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),sku TEXT CHECK(sku IS NULL OR length(trim(sku)) BETWEEN 1 AND 100),label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120),price_minor INTEGER NOT NULL CHECK(typeof(price_minor)='integer' AND price_minor BETWEEN 0 AND 99999999999999),cost_minor INTEGER CHECK(cost_minor IS NULL OR (typeof(cost_minor)='integer' AND cost_minor BETWEEN 0 AND 99999999999999)),currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND')),duration_minutes INTEGER CHECK(duration_minutes IS NULL OR (typeof(duration_minutes)='integer' AND duration_minutes BETWEEN 1 AND 1000000)),attributes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(attributes_json) AND json_type(attributes_json)='object'),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),archived_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX product_default_variant_unique ON product_variant(product_id) WHERE is_default=1;
CREATE INDEX product_variant_product_idx ON product_variant(product_id,archived_at,id);
CREATE TABLE product_sku(normalized_sku TEXT PRIMARY KEY NOT NULL,variant_id TEXT NOT NULL UNIQUE REFERENCES product_variant(id) ON DELETE CASCADE);
CREATE TABLE product_package_component(package_product_id TEXT NOT NULL REFERENCES product(id) ON DELETE RESTRICT,component_variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE RESTRICT,quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity BETWEEN 1 AND 1000000),PRIMARY KEY(package_product_id,component_variant_id));
CREATE INDEX package_component_variant_idx ON product_package_component(component_variant_id);


CREATE TABLE "activity_catalog_backup" AS SELECT * FROM "activity";

CREATE TABLE "activity_visibility_catalog_backup" AS SELECT * FROM "activity_visibility";

CREATE TABLE "crm_file_catalog_backup" AS SELECT * FROM "crm_file";

CREATE TABLE "custom_field_definition_catalog_backup" AS SELECT * FROM "custom_field_definition";

CREATE TABLE "custom_field_option_catalog_backup" AS SELECT * FROM "custom_field_option";

CREATE TABLE "custom_field_value_catalog_backup" AS SELECT * FROM "custom_field_value";

CREATE TABLE "field_configuration_revision_catalog_backup" AS SELECT * FROM "field_configuration_revision";

CREATE TABLE "field_conversion_guard_catalog_backup" AS SELECT * FROM "field_conversion_guard";

CREATE TABLE "field_conversion_preview_catalog_backup" AS SELECT * FROM "field_conversion_preview";

CREATE TABLE "field_value_revision_catalog_backup" AS SELECT * FROM "field_value_revision";

CREATE TABLE "module_setting_catalog_backup" AS SELECT * FROM "module_setting";

CREATE TABLE "record_draft_catalog_backup" AS SELECT * FROM "record_draft";

CREATE TABLE "record_layout_catalog_backup" AS SELECT * FROM "record_layout";

CREATE TABLE "saved_view_catalog_backup" AS SELECT * FROM "saved_view";

CREATE TABLE "saved_view_default_catalog_backup" AS SELECT * FROM "saved_view_default";

DROP TABLE "saved_view_default";

DROP TABLE "saved_view";

DROP TABLE "record_layout";

DROP TABLE "record_draft";

DROP TABLE "module_setting";

DROP TABLE "field_value_revision";

DROP TABLE "field_conversion_preview";

DROP TABLE "field_conversion_guard";

DROP TABLE "field_configuration_revision";

DROP TABLE "custom_field_value";

DROP TABLE "custom_field_option";

DROP TABLE "custom_field_definition";

DROP TABLE "crm_file";

DROP TABLE "activity_visibility";

DROP TABLE "activity";

CREATE TABLE "activity" (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL CHECK (type IN ('note', 'call', 'meeting', 'task', 'stage_change')),
  subject text,
  content text,
  occurred_at integer,
  due_at integer,
  completed_at integer,
  company_id text REFERENCES company(id) ON DELETE CASCADE,
  contact_id text REFERENCES contact(id) ON DELETE CASCADE,
  deal_id text REFERENCES deal(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  metadata_json text CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  "lead_id" TEXT REFERENCES lead(id) ON DELETE CASCADE,
  "product_id" TEXT REFERENCES product(id) ON DELETE CASCADE,
  CHECK (((company_id IS NOT NULL) + (contact_id IS NOT NULL) + (deal_id IS NOT NULL) + (lead_id IS NOT NULL) + (product_id IS NOT NULL)) >= 1)
);

INSERT INTO "activity"("id","type","subject","content","occurred_at","due_at","completed_at","company_id","contact_id","deal_id","author_user_id","metadata_json","created_at","updated_at","lead_id") SELECT "id","type","subject","content","occurred_at","due_at","completed_at","company_id","contact_id","deal_id","author_user_id","metadata_json","created_at","updated_at","lead_id" FROM "activity_catalog_backup";

DROP TABLE "activity_catalog_backup";

CREATE TABLE `activity_visibility` (
  `activity_id` text NOT NULL REFERENCES `activity` (`id`) ON DELETE CASCADE,
  `membership_id` text NOT NULL REFERENCES `singleton_membership` (`user_id`) ON DELETE CASCADE,
  PRIMARY KEY (`activity_id`, `membership_id`)
);

INSERT INTO "activity_visibility"("activity_id","membership_id") SELECT "activity_id","membership_id" FROM "activity_visibility_catalog_backup";

DROP TABLE "activity_visibility_catalog_backup";

CREATE TABLE crm_file (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead','product')),
  record_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  size INTEGER NOT NULL CHECK(typeof(size)='integer' AND size BETWEEN 0 AND 10485760),
  status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','cleaning')),
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  cleanup_attempted_at INTEGER,
  CHECK((status='ready' AND ready_at IS NOT NULL) OR (status!='ready' AND ready_at IS NULL))
);

INSERT INTO "crm_file"("id","object_key","entity","record_id","field_id","uploader_id","file_name","size","status","created_at","ready_at","cleanup_attempted_at") SELECT "id","object_key","entity","record_id","field_id","uploader_id","file_name","size","status","created_at","ready_at","cleanup_attempted_at" FROM "crm_file_catalog_backup";

DROP TABLE "crm_file_catalog_backup";

CREATE TABLE "custom_field_definition" (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal', 'lead', 'product')),
  `key` text NOT NULL,
  `label` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer', 'formula', 'file')),
  `config_json` text CHECK (`config_json` IS NULL OR json_valid(`config_json`)),
  `required` integer DEFAULT false NOT NULL,
  `show_on_sheet` integer DEFAULT true NOT NULL,
  `show_on_table` integer DEFAULT false NOT NULL,
  `show_on_filter` integer DEFAULT false NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, deleted_at integer);

INSERT INTO "custom_field_definition"("id","entity","key","label","type","config_json","required","show_on_sheet","show_on_table","show_on_filter","position","archived_at","created_at","updated_at","deleted_at") SELECT "id","entity","key","label","type","config_json","required","show_on_sheet","show_on_table","show_on_filter","position","archived_at","created_at","updated_at","deleted_at" FROM "custom_field_definition_catalog_backup";

DROP TABLE "custom_field_definition_catalog_backup";

CREATE TABLE "custom_field_option" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition" (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);

INSERT INTO "custom_field_option"("id","field_id","label","position","archived_at") SELECT "id","field_id","label","position","archived_at" FROM "custom_field_option_catalog_backup";

DROP TABLE "custom_field_option_catalog_backup";

CREATE TABLE "custom_field_value" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition" (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES "custom_field_option" (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  json_value text CHECK (json_value IS NULL OR json_valid(json_value)),
  customer_reference_id text REFERENCES contact(id) ON DELETE RESTRICT,
  "lead_id" TEXT REFERENCES lead(id) ON DELETE CASCADE,
  "product_id" TEXT REFERENCES product(id) ON DELETE CASCADE,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL) + (`lead_id` IS NOT NULL) + (`product_id` IS NOT NULL)) = 1)
);

INSERT INTO "custom_field_value"("id","field_id","company_id","contact_id","deal_id","text_value","number_value","date_value","boolean_value","option_id","user_membership_id","updated_at","json_value","customer_reference_id","lead_id") SELECT "id","field_id","company_id","contact_id","deal_id","text_value","number_value","date_value","boolean_value","option_id","user_membership_id","updated_at","json_value","customer_reference_id","lead_id" FROM "custom_field_value_catalog_backup";

DROP TABLE "custom_field_value_catalog_backup";

CREATE TABLE field_configuration_revision (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal','lead','product')),
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "field_configuration_revision"("entity","revision") SELECT "entity","revision" FROM "field_configuration_revision_catalog_backup";

DROP TABLE "field_configuration_revision_catalog_backup";

CREATE TABLE "field_conversion_guard" (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL
);

INSERT INTO "field_conversion_guard"("field_id","source_type","target_type") SELECT "field_id","source_type","target_type" FROM "field_conversion_guard_catalog_backup";

DROP TABLE "field_conversion_guard_catalog_backup";

CREATE TABLE "field_conversion_preview" (
  id TEXT PRIMARY KEY NOT NULL,
  field_id TEXT NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  configuration_revision INTEGER NOT NULL,
  value_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO "field_conversion_preview"("id","field_id","user_id","source_type","target_type","config_json","configuration_revision","value_revision","expires_at") SELECT "id","field_id","user_id","source_type","target_type","config_json","configuration_revision","value_revision","expires_at" FROM "field_conversion_preview_catalog_backup";

DROP TABLE "field_conversion_preview_catalog_backup";

CREATE TABLE "field_value_revision" (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "field_value_revision"("field_id","revision") SELECT "field_id","revision" FROM "field_value_revision_catalog_backup";

DROP TABLE "field_value_revision_catalog_backup";

CREATE TABLE module_setting (
  entity TEXT PRIMARY KEY NOT NULL CHECK (entity IN ('company','contact','deal','lead','product')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision) = 'integer' AND revision >= 0),
  updated_at INTEGER NOT NULL
);

INSERT INTO "module_setting"("entity","enabled","revision","updated_at") SELECT "entity","enabled","revision","updated_at" FROM "module_setting_catalog_backup";

DROP TABLE "module_setting_catalog_backup";

CREATE TABLE record_draft (
  id TEXT PRIMARY KEY NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead','product')),
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK(expires_at > created_at)
);

INSERT INTO "record_draft"("id","entity","user_id","expires_at","consumed_at","created_at") SELECT "id","entity","user_id","expires_at","consumed_at","created_at" FROM "record_draft_catalog_backup";

DROP TABLE "record_draft_catalog_backup";

CREATE TABLE record_layout (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal','lead','product')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  fields_json TEXT NOT NULL DEFAULT 'null' CHECK(json_valid(fields_json)),
  updated_at INTEGER NOT NULL
);

INSERT INTO "record_layout"("entity","revision","fields_json","updated_at") SELECT "entity","revision","fields_json","updated_at" FROM "record_layout_catalog_backup";

DROP TABLE "record_layout_catalog_backup";

CREATE TABLE `saved_view` (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal', 'lead', 'product')),
  `name` text NOT NULL,
  `shared` integer DEFAULT false NOT NULL,
  `state_json` text NOT NULL CHECK (json_valid(`state_json`)),
  `owner_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, creator_user_id text REFERENCES user(id) ON DELETE SET NULL);

INSERT INTO "saved_view"("id","entity","name","shared","state_json","owner_membership_id","created_at","updated_at","creator_user_id") SELECT "id","entity","name","shared","state_json","owner_membership_id","created_at","updated_at","creator_user_id" FROM "saved_view_catalog_backup";

DROP TABLE "saved_view_catalog_backup";

CREATE TABLE saved_view_default (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead','product')),
  view_id TEXT NOT NULL REFERENCES saved_view(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, entity)
);

INSERT INTO "saved_view_default"("user_id","entity","view_id") SELECT "user_id","entity","view_id" FROM "saved_view_default_catalog_backup";

DROP TABLE "saved_view_default_catalog_backup";

CREATE INDEX `activity_visibility_member_idx` ON `activity_visibility` (`membership_id`);

CREATE UNIQUE INDEX `saved_view_owner_name_unique` ON `saved_view` (`entity`, `owner_membership_id`, `name`);

CREATE INDEX `saved_view_entity_shared_idx` ON `saved_view` (`entity`, `shared`);

CREATE INDEX activity_company_created_idx ON activity(company_id, created_at, id);

CREATE INDEX activity_contact_created_idx ON activity(contact_id, created_at, id);

CREATE INDEX activity_deal_created_idx ON activity(deal_id, created_at, id);

CREATE INDEX activity_due_idx ON activity(due_at);

CREATE INDEX activity_author_idx ON activity(author_user_id);

CREATE UNIQUE INDEX saved_view_creator_name_unique ON saved_view(entity, creator_user_id, name);

CREATE INDEX saved_view_default_view_idx ON saved_view_default(view_id);

CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`, `key`);

CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`, `position`);

CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`, `position`);

CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`, `company_id`);

CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`, `contact_id`);

CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`, `deal_id`);

CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`, `text_value`);

CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`, `number_value`);

CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`, `date_value`);

CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);

CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

CREATE INDEX custom_field_value_customer_idx ON custom_field_value(customer_reference_id);

CREATE UNIQUE INDEX field_conversion_preview_owner_idx ON field_conversion_preview(field_id,user_id);

CREATE INDEX field_conversion_preview_expiry_idx ON field_conversion_preview(expires_at);

CREATE UNIQUE INDEX crm_file_object_key_unique ON crm_file(object_key);

CREATE INDEX crm_file_anchor_idx ON crm_file(entity,record_id,field_id);

CREATE INDEX crm_file_cleanup_idx ON crm_file(status,created_at);

CREATE UNIQUE INDEX custom_field_lead_unique ON custom_field_value(field_id,lead_id);

CREATE INDEX activity_lead_created_idx ON activity(lead_id,created_at,id);

CREATE UNIQUE INDEX custom_field_product_unique ON custom_field_value(field_id,product_id);

CREATE INDEX activity_product_created_idx ON activity(product_id,created_at,id);

INSERT INTO module_setting(entity,enabled,revision,updated_at) VALUES('product',1,0,0);

INSERT INTO record_layout(entity,updated_at) VALUES('product',0);

INSERT INTO field_configuration_revision(entity,revision) VALUES('product',0);

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

CREATE TRIGGER `deal_required_relationships_insert`
BEFORE INSERT ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_required_relationships_update`
BEFORE UPDATE OF `company_id`, `owner_membership_id` ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_contact_company_insert`
BEFORE INSERT ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `deal_contact_company_update`
BEFORE UPDATE OF `deal_id`, `contact_id` ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `contact_company_preserves_deals`
BEFORE UPDATE OF `company_id` ON `contact`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `deal` ON `deal`.`id` = `deal_contact`.`deal_id`
     WHERE `deal_contact`.`contact_id` = OLD.`id`
       AND (NEW.`company_id` IS NULL OR NEW.`company_id` != `deal`.`company_id`)
  ) THEN RAISE(ABORT, 'contact company conflicts with a deal') END);
END;

CREATE TRIGGER `deal_company_preserves_contacts`
BEFORE UPDATE OF `company_id` ON `deal`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `contact` ON `contact`.`id` = `deal_contact`.`contact_id`
     WHERE `deal_contact`.`deal_id` = OLD.`id`
       AND (`contact`.`company_id` IS NULL OR `contact`.`company_id` != NEW.`company_id`)
  ) THEN RAISE(ABORT, 'deal company conflicts with a contact') END);
END;

CREATE TRIGGER activity_compatible_anchors_insert
BEFORE INSERT ON activity
BEGIN
 SELECT (CASE WHEN NEW.product_id IS NOT NULL AND (NEW.company_id IS NOT NULL OR NEW.contact_id IS NOT NULL OR NEW.deal_id IS NOT NULL OR NEW.lead_id IS NOT NULL) THEN RAISE(ABORT,'activity anchor mismatch') END);
 SELECT (CASE WHEN NEW.lead_id IS NOT NULL AND (NEW.company_id IS NOT NULL OR NEW.contact_id IS NOT NULL OR NEW.deal_id IS NOT NULL OR NEW.product_id IS NOT NULL) THEN RAISE(ABORT,'activity anchor mismatch') END);
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id = NEW.author_user_id AND status = 'active')
    THEN RAISE(ABORT, 'author membership is inactive') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact WHERE id = NEW.contact_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.deal_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM deal WHERE id = NEW.deal_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.deal_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact JOIN deal ON contact.company_id = deal.company_id WHERE contact.id = NEW.contact_id AND deal.id = NEW.deal_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
END;

CREATE TRIGGER activity_history_immutable
BEFORE UPDATE ON activity
WHEN OLD.type != 'task' OR NEW.type != OLD.type OR NEW.id != OLD.id
  OR NEW.author_user_id != OLD.author_user_id OR NEW.created_at != OLD.created_at
  OR NEW.company_id IS NOT OLD.company_id OR NEW.contact_id IS NOT OLD.contact_id
  OR NEW.product_id IS NOT OLD.product_id OR NEW.lead_id IS NOT OLD.lead_id OR NEW.deal_id IS NOT OLD.deal_id OR NEW.subject IS NOT OLD.subject
  OR NEW.content IS NOT OLD.content OR NEW.occurred_at IS NOT OLD.occurred_at
  OR NEW.due_at IS NOT OLD.due_at OR NEW.metadata_json IS NOT OLD.metadata_json
BEGIN
  SELECT RAISE(ABORT, 'activity history is immutable');
END;

CREATE TRIGGER saved_view_creator_immutable BEFORE UPDATE OF creator_user_id ON saved_view
WHEN NEW.creator_user_id IS NOT NULL AND NEW.creator_user_id IS NOT OLD.creator_user_id
BEGIN SELECT RAISE(ABORT, 'saved_view_creator_immutable'); END;

CREATE TRIGGER saved_view_edit_active_owner BEFORE UPDATE ON saved_view
WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active'
)
BEGIN SELECT RAISE(ABORT, 'saved_view_owner_inactive'); END;

CREATE TRIGGER deal_currency_job_insert BEFORE INSERT ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_currency_job_money_update BEFORE UPDATE OF amount_minor,currency ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency)
 AND EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_currency_job_delete BEFORE DELETE ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_money_revision_update BEFORE UPDATE ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency) AND NEW.money_revision != OLD.money_revision + 1
BEGIN SELECT RAISE(ABORT,'deal_money_revision_conflict'); END;

CREATE TRIGGER exchange_rate_job_insert BEFORE INSERT ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER exchange_rate_job_update BEFORE UPDATE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER exchange_rate_job_delete BEFORE DELETE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER membership_default_profile AFTER INSERT ON singleton_membership
BEGIN
  INSERT INTO membership_access VALUES (NEW.user_id, 'standard-member');
END;

CREATE TRIGGER member_branch_active_insert BEFORE INSERT ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER member_branch_active_update BEFORE UPDATE ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER branch_archive_in_use BEFORE UPDATE OF archived_at ON branch WHEN NEW.archived_at IS NOT NULL
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM branch_setting WHERE default_branch_id=OLD.id)
    OR EXISTS (SELECT 1 FROM member_branch WHERE branch_id=OLD.id)
    THEN RAISE(ABORT, 'branch_in_use') END);
END;

CREATE TRIGGER branch_default_active BEFORE UPDATE OF default_branch_id ON branch_setting
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.default_branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER membership_clear_branches AFTER UPDATE OF status ON singleton_membership WHEN NEW.status='revoked'
BEGIN
  DELETE FROM member_branch WHERE membership_id=NEW.user_id;
END;

CREATE TRIGGER saved_view_default_visible_insert BEFORE INSERT ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;

CREATE TRIGGER saved_view_default_visible_update BEFORE UPDATE ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;

CREATE TRIGGER saved_view_default_unshare AFTER UPDATE OF shared ON saved_view
WHEN OLD.shared=1 AND NEW.shared=0
BEGIN DELETE FROM saved_view_default WHERE view_id=NEW.id AND user_id IS NOT NEW.creator_user_id; END;

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
    OR EXISTS (SELECT 1 FROM lead WHERE owner_membership_id=OLD.user_id) OR EXISTS (SELECT 1 FROM lead_collaborator WHERE membership_id=OLD.user_id) OR EXISTS (SELECT 1 FROM product WHERE owner_membership_id=OLD.user_id) THEN RAISE(ABORT, 'membership references require cleanup') END);
END;

CREATE TRIGGER custom_field_position_insert BEFORE INSERT ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_position_update BEFORE UPDATE OF position ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_insert BEFORE INSERT ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_update BEFORE UPDATE OF position ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;

CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;

CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_value_validate_insert BEFORE INSERT ON custom_field_value
BEGIN
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL) OR (f.entity = 'lead' AND NEW.lead_id IS NOT NULL) OR (f.entity = 'product' AND NEW.product_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_rating_config_update BEFORE UPDATE OF config_json ON custom_field_definition
WHEN NEW.type='rating' AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=NEW.id AND number_value > coalesce(json_extract(NEW.config_json,'$.ratingMax'),5))
BEGIN SELECT RAISE(ABORT, 'field_rating_has_values'); END;

CREATE TRIGGER field_configuration_insert AFTER INSERT ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_update AFTER UPDATE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_delete AFTER DELETE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=OLD.entity; END;

CREATE TRIGGER formula_field_value_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_insert BEFORE INSERT ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER formula_field_value_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_update BEFORE UPDATE ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER field_value_revision_definition AFTER INSERT ON custom_field_definition
BEGIN INSERT INTO field_value_revision(field_id) VALUES(NEW.id); END;

CREATE TRIGGER field_value_revision_insert AFTER INSERT ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=NEW.field_id; END;

CREATE TRIGGER field_value_revision_update AFTER UPDATE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id IN (OLD.field_id,NEW.field_id); END;

CREATE TRIGGER field_value_revision_delete AFTER DELETE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=OLD.field_id; END;

CREATE TRIGGER field_option_revision_insert AFTER INSERT ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_update AFTER UPDATE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_delete AFTER DELETE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=OLD.field_id); END;

CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
AND (OLD.type='file' OR NEW.type='file' OR NOT EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=OLD.id AND source_type=OLD.type AND target_type=NEW.type))
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id AND NEW.lead_id IS OLD.lead_id AND NEW.product_id IS OLD.product_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL) OR (f.entity = 'lead' AND NEW.lead_id IS NOT NULL) OR (f.entity = 'product' AND NEW.product_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND (archived_at IS NULL OR (
      json_array_length(OLD.json_value)=1 AND json_extract(OLD.json_value,'$[0]')=NEW.option_id
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='multiselect' AND target_type='select')
    ))
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND (archived_at IS NULL OR (
      OLD.option_id=chosen.value AND json_array_length(NEW.json_value)=1
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='select' AND target_type='multiselect')
    ))
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER crm_file_pending_insert BEFORE INSERT ON crm_file
WHEN NEW.status!='pending'
BEGIN SELECT RAISE(ABORT,'file_initial_status_invalid'); END;

CREATE TRIGGER crm_file_immutable_update BEFORE UPDATE ON crm_file
WHEN NEW.id IS NOT OLD.id OR NEW.object_key IS NOT OLD.object_key
 OR NEW.entity IS NOT OLD.entity OR NEW.record_id IS NOT OLD.record_id
 OR NEW.field_id IS NOT OLD.field_id OR NEW.uploader_id IS NOT OLD.uploader_id
 OR NEW.file_name IS NOT OLD.file_name OR NEW.size IS NOT OLD.size OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.status='ready' AND (NEW.status IS NOT OLD.status OR NEW.ready_at IS NOT OLD.ready_at))
 OR (OLD.status='cleaning' AND NEW.status!='cleaning')
 OR (OLD.status='failed' AND NEW.status NOT IN ('failed','cleaning'))
BEGIN SELECT RAISE(ABORT,'file_metadata_immutable'); END;

CREATE TRIGGER crm_file_preserve_key BEFORE DELETE ON crm_file
BEGIN SELECT RAISE(ABORT,'file_key_retained'); END;

CREATE TRIGGER custom_field_file_validate_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id) OR (f.entity='lead' AND f.record_id=NEW.lead_id) OR (f.entity='product' AND f.record_id=NEW.product_id))
  )
 );
END;

CREATE TRIGGER custom_field_file_validate_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id) OR (f.entity='lead' AND f.record_id=NEW.lead_id) OR (f.entity='product' AND f.record_id=NEW.product_id))
  )
 );
END;

CREATE TRIGGER module_setting_entity_immutable
BEFORE UPDATE OF entity ON module_setting
WHEN NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'module entity is immutable'); END;

CREATE TRIGGER module_setting_preserve
BEFORE DELETE ON module_setting
BEGIN SELECT RAISE(ABORT, 'module settings must be retained'); END;

CREATE TRIGGER record_layout_identity BEFORE UPDATE OF entity ON record_layout
WHEN NEW.entity <> OLD.entity BEGIN SELECT RAISE(ABORT,'layout_identity_immutable'); END;

CREATE TRIGGER record_layout_delete BEFORE DELETE ON record_layout
BEGIN SELECT RAISE(ABORT,'layout_delete_forbidden'); END;

CREATE TRIGGER record_draft_identity BEFORE UPDATE ON record_draft
WHEN NEW.id <> OLD.id OR NEW.entity <> OLD.entity OR NEW.user_id <> OLD.user_id
  OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at
  OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS NOT OLD.consumed_at)
BEGIN SELECT RAISE(ABORT,'draft_identity_immutable'); END;

CREATE TRIGGER deal_stage_identity BEFORE UPDATE ON deal_stage
WHEN NEW.id <> OLD.id OR NEW.label_key <> OLD.label_key OR NEW.closed_state <> OLD.closed_state
BEGIN SELECT RAISE(ABORT,'deal_stage_identity_immutable'); END;

CREATE TRIGGER deal_stage_default_available BEFORE UPDATE OF archived_at ON deal_stage
WHEN OLD.id='demo-booked' AND NEW.archived_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'deal_stage_default_required'); END;

CREATE TRIGGER deal_stage_keep_history BEFORE DELETE ON deal_stage
BEGIN SELECT RAISE(ABORT,'deal_stage_delete_forbidden'); END;

CREATE TRIGGER deal_stage_insert_revision AFTER INSERT ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;

CREATE TRIGGER deal_stage_update_revision AFTER UPDATE ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;

CREATE TRIGGER deal_active_stage_insert BEFORE INSERT ON deal
WHEN NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;

CREATE TRIGGER deal_active_stage_update BEFORE UPDATE OF stage_id ON deal
WHEN NEW.stage_id <> OLD.stage_id AND NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;

CREATE TRIGGER lead_source_identity BEFORE UPDATE ON lead_source WHEN NEW.id IS NOT OLD.id OR NEW.label_key IS NOT OLD.label_key BEGIN SELECT RAISE(ABORT,'lead_catalog_identity_immutable'); END;

CREATE TRIGGER lead_status_identity BEFORE UPDATE ON lead_status WHEN NEW.id IS NOT OLD.id OR NEW.label_key IS NOT OLD.label_key OR NEW.meaning IS NOT OLD.meaning BEGIN SELECT RAISE(ABORT,'lead_catalog_identity_immutable'); END;

CREATE TRIGGER lead_source_default BEFORE UPDATE ON lead_source WHEN OLD.id='manual' AND NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'lead_default_required'); END;

CREATE TRIGGER lead_status_default BEFORE UPDATE ON lead_status WHEN OLD.id IN ('new','converted') AND NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'lead_default_required'); END;

CREATE TRIGGER lead_source_preserve BEFORE DELETE ON lead_source BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;

CREATE TRIGGER lead_status_preserve BEFORE DELETE ON lead_status BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;

CREATE TRIGGER lead_source_insert_revision AFTER INSERT ON lead_source BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;

CREATE TRIGGER lead_source_update_revision AFTER UPDATE ON lead_source BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;

CREATE TRIGGER lead_status_insert_revision AFTER INSERT ON lead_status BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;

CREATE TRIGGER lead_status_update_revision AFTER UPDATE ON lead_status BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;

CREATE TRIGGER lead_identity BEFORE UPDATE ON lead WHEN NEW.id IS NOT OLD.id OR NEW.creator_user_id IS NOT OLD.creator_user_id OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'lead_identity_immutable'); END;

CREATE TRIGGER lead_converted_identity BEFORE UPDATE ON lead WHEN OLD.converted_at IS NOT NULL AND (NEW.converted_at IS NOT OLD.converted_at OR NEW.converted_contact_id IS NOT OLD.converted_contact_id OR NEW.status_id IS NOT OLD.status_id) BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;

CREATE TRIGGER lead_source_insert BEFORE INSERT ON lead WHEN NOT EXISTS(SELECT 1 FROM lead_source WHERE id=NEW.source_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_source_unavailable'); END;

CREATE TRIGGER lead_source_update BEFORE UPDATE OF source_id ON lead WHEN NEW.source_id IS NOT OLD.source_id AND NOT EXISTS(SELECT 1 FROM lead_source WHERE id=NEW.source_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_source_unavailable'); END;

CREATE TRIGGER lead_status_insert BEFORE INSERT ON lead WHEN NOT EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_status_unavailable'); END;

CREATE TRIGGER lead_status_update BEFORE UPDATE OF status_id ON lead WHEN NEW.status_id IS NOT OLD.status_id AND NOT EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_status_unavailable'); END;

CREATE TRIGGER lead_reason_insert BEFORE INSERT ON lead WHEN EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND requires_reason=1) AND length(trim(coalesce(NEW.rejection_reason,'')))=0 BEGIN SELECT RAISE(ABORT,'lead_reason_required'); END;

CREATE TRIGGER lead_reason_update BEFORE UPDATE ON lead WHEN (NEW.status_id IS NOT OLD.status_id OR NEW.rejection_reason IS NOT OLD.rejection_reason) AND EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND requires_reason=1) AND length(trim(coalesce(NEW.rejection_reason,'')))=0 BEGIN SELECT RAISE(ABORT,'lead_reason_required'); END;

CREATE TRIGGER lead_owner_insert BEFORE INSERT ON lead WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_owner_inactive'); END;

CREATE TRIGGER lead_owner_update BEFORE UPDATE ON lead WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_owner_inactive'); END;

CREATE TRIGGER lead_collaborator_insert BEFORE INSERT ON lead_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_collaborator_inactive'); END;

CREATE TRIGGER lead_collaborator_update BEFORE UPDATE ON lead_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_collaborator_inactive'); END;

CREATE TRIGGER lead_conversion_update BEFORE UPDATE ON lead_conversion BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;

CREATE TRIGGER lead_conversion_delete BEFORE DELETE ON lead_conversion BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;

CREATE TRIGGER lead_conversion_result BEFORE INSERT ON lead_conversion WHEN NOT EXISTS(SELECT 1 FROM lead WHERE id=NEW.lead_id AND converted_contact_id=NEW.contact_id AND converted_at=NEW.completed_at AND status_id='converted') BEGIN SELECT RAISE(ABORT,'lead_conversion_result_mismatch'); END;

INSERT INTO custom_field_definition(id,entity,key,label,type,position,show_on_sheet,created_at,updated_at) VALUES('7dd843dc-6df2-4c33-a8f8-8f45cc0e5762','product','catalog_images','Images','file',0,1,0,0);

INSERT INTO access_grant(profile_id,permission) VALUES('standard-member','product.create'),('standard-member','product.update'),('standard-member','product.archive'),('standard-member','product.restore'),('standard-member','product.assign');

CREATE TRIGGER product_category_identity BEFORE UPDATE ON product_category WHEN NEW.id IS NOT OLD.id BEGIN SELECT RAISE(ABORT,'catalog_identity_immutable'); END;
CREATE TRIGGER product_category_delete BEFORE DELETE ON product_category BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
CREATE TRIGGER product_category_insert_revision AFTER INSERT ON product_category BEGIN UPDATE product_category_revision SET revision=revision+1 WHERE id='categories'; END;
CREATE TRIGGER product_category_update_revision AFTER UPDATE ON product_category BEGIN UPDATE product_category_revision SET revision=revision+1 WHERE id='categories'; END;
CREATE TRIGGER product_identity BEFORE UPDATE ON product WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.creator_user_id IS NOT OLD.creator_user_id OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'catalog_identity_immutable'); END;
CREATE TRIGGER product_delete BEFORE DELETE ON product BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
CREATE TRIGGER product_owner_insert BEFORE INSERT ON product WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'catalog_owner_inactive'); END;
CREATE TRIGGER product_owner_update BEFORE UPDATE ON product WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'catalog_owner_inactive'); END;
CREATE TRIGGER product_category_insert BEFORE INSERT ON product WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_category WHERE id=NEW.category_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'catalog_category_unavailable'); END;
CREATE TRIGGER product_category_update BEFORE UPDATE OF category_id ON product WHEN NEW.category_id IS NOT OLD.category_id AND NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_category WHERE id=NEW.category_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'catalog_category_unavailable'); END;
CREATE TRIGGER product_variant_identity BEFORE UPDATE ON product_variant WHEN NEW.id IS NOT OLD.id OR NEW.product_id IS NOT OLD.product_id OR NEW.is_default IS NOT OLD.is_default OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'catalog_identity_immutable'); END;
CREATE TRIGGER product_variant_delete BEFORE DELETE ON product_variant BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
CREATE TRIGGER product_default_variant_archive BEFORE UPDATE OF archived_at ON product_variant WHEN NEW.is_default=1 AND NEW.archived_at IS NOT NULL AND EXISTS(SELECT 1 FROM product WHERE id=NEW.product_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'catalog_default_variant_required'); END;
CREATE TRIGGER product_default_variant_restore BEFORE UPDATE OF archived_at ON product WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM product_variant WHERE product_id=NEW.id AND is_default=1 AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'catalog_default_variant_required'); END;
CREATE TRIGGER product_variant_sku_insert AFTER INSERT ON product_variant WHEN NEW.sku IS NOT NULL AND NEW.archived_at IS NULL AND EXISTS(SELECT 1 FROM product WHERE id=NEW.product_id AND archived_at IS NULL)
BEGIN INSERT INTO product_sku(normalized_sku,variant_id) VALUES(lower(trim(NEW.sku)),NEW.id); END;
CREATE TRIGGER product_variant_sku_update AFTER UPDATE OF sku,archived_at ON product_variant
BEGIN DELETE FROM product_sku WHERE variant_id=NEW.id; INSERT INTO product_sku(normalized_sku,variant_id) SELECT lower(trim(NEW.sku)),NEW.id WHERE NEW.sku IS NOT NULL AND NEW.archived_at IS NULL AND EXISTS(SELECT 1 FROM product WHERE id=NEW.product_id AND archived_at IS NULL); END;
CREATE TRIGGER product_sku_lifecycle AFTER UPDATE OF archived_at ON product WHEN NEW.archived_at IS NOT OLD.archived_at
BEGIN DELETE FROM product_sku WHERE variant_id IN (SELECT id FROM product_variant WHERE product_id=NEW.id); INSERT INTO product_sku(normalized_sku,variant_id) SELECT lower(trim(sku)),id FROM product_variant WHERE product_id=NEW.id AND archived_at IS NULL AND sku IS NOT NULL AND NEW.archived_at IS NULL; END;
CREATE TRIGGER product_package_validate_insert BEFORE INSERT ON product_package_component
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM product WHERE id=NEW.package_product_id AND kind='package') OR NOT EXISTS(SELECT 1 FROM product_variant v JOIN product p ON p.id=v.product_id WHERE v.id=NEW.component_variant_id AND v.archived_at IS NULL AND p.archived_at IS NULL) THEN RAISE(ABORT,'catalog_package_invalid') END);
 SELECT (CASE WHEN EXISTS(WITH RECURSIVE descendants(id) AS (SELECT product_id FROM product_variant WHERE id=NEW.component_variant_id UNION SELECT v.product_id FROM descendants d JOIN product_package_component c ON c.package_product_id=d.id JOIN product_variant v ON v.id=c.component_variant_id) SELECT 1 FROM descendants WHERE id=NEW.package_product_id) THEN RAISE(ABORT,'catalog_package_cycle') END);
END;
CREATE TRIGGER product_package_validate_update BEFORE UPDATE ON product_package_component WHEN NEW.package_product_id IS NOT OLD.package_product_id OR NEW.component_variant_id IS NOT OLD.component_variant_id
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM product WHERE id=NEW.package_product_id AND kind='package') OR NOT EXISTS(SELECT 1 FROM product_variant v JOIN product p ON p.id=v.product_id WHERE v.id=NEW.component_variant_id AND v.archived_at IS NULL AND p.archived_at IS NULL) THEN RAISE(ABORT,'catalog_package_invalid') END);
 SELECT (CASE WHEN EXISTS(WITH RECURSIVE descendants(id) AS (SELECT product_id FROM product_variant WHERE id=NEW.component_variant_id UNION SELECT v.product_id FROM descendants d JOIN product_package_component c ON c.package_product_id=d.id JOIN product_variant v ON v.id=c.component_variant_id) SELECT 1 FROM descendants WHERE id=NEW.package_product_id) THEN RAISE(ABORT,'catalog_package_cycle') END);
END;
-- Extend shared CRM anchors without rewriting retained business history.

DROP TRIGGER "membership_keep_last_owner_on_role_change";

DROP TRIGGER "membership_keep_last_owner_on_status_change";

DROP TRIGGER "membership_keep_last_owner_on_delete";

DROP TRIGGER "company_active_owner_insert";

DROP TRIGGER "company_active_owner_update";

DROP TRIGGER "contact_active_owner_insert";

DROP TRIGGER "contact_active_owner_update";

DROP TRIGGER "deal_active_owner_insert";

DROP TRIGGER "deal_active_owner_update";

DROP TRIGGER "saved_view_active_owner_insert";

DROP TRIGGER "saved_view_active_owner_update";

DROP TRIGGER "activity_visibility_active_member_insert";

DROP TRIGGER "activity_visibility_active_member_update";

DROP TRIGGER "deal_required_relationships_insert";

DROP TRIGGER "deal_required_relationships_update";

DROP TRIGGER "deal_contact_company_insert";

DROP TRIGGER "deal_contact_company_update";

DROP TRIGGER "contact_company_preserves_deals";

DROP TRIGGER "deal_company_preserves_contacts";

DROP TRIGGER "activity_compatible_anchors_insert";

DROP TRIGGER "activity_history_immutable";

DROP TRIGGER "saved_view_creator_immutable";

DROP TRIGGER "saved_view_edit_active_owner";

DROP TRIGGER "deal_currency_job_insert";

DROP TRIGGER "deal_currency_job_money_update";

DROP TRIGGER "deal_currency_job_delete";

DROP TRIGGER "deal_money_revision_update";

DROP TRIGGER "exchange_rate_job_insert";

DROP TRIGGER "exchange_rate_job_update";

DROP TRIGGER "exchange_rate_job_delete";

DROP TRIGGER "membership_default_profile";

DROP TRIGGER "member_branch_active_insert";

DROP TRIGGER "member_branch_active_update";

DROP TRIGGER "branch_archive_in_use";

DROP TRIGGER "branch_default_active";

DROP TRIGGER "membership_clear_branches";

DROP TRIGGER "saved_view_default_visible_insert";

DROP TRIGGER "saved_view_default_visible_update";

DROP TRIGGER "saved_view_default_unshare";

DROP TRIGGER "custom_field_active_user_insert";

DROP TRIGGER "custom_field_active_user_update";

DROP TRIGGER "membership_requires_reference_cleanup";

DROP TRIGGER "custom_field_position_insert";

DROP TRIGGER "custom_field_position_update";

DROP TRIGGER "custom_field_option_position_insert";

DROP TRIGGER "custom_field_option_position_update";

DROP TRIGGER "custom_field_identity_immutable";

DROP TRIGGER "custom_field_option_owner_immutable";

DROP TRIGGER "custom_field_option_available_insert";

DROP TRIGGER "custom_field_option_available_update";

DROP TRIGGER "custom_field_value_validate_insert";

DROP TRIGGER "custom_field_rating_config_update";

DROP TRIGGER "field_configuration_insert";

DROP TRIGGER "field_configuration_update";

DROP TRIGGER "field_configuration_delete";

DROP TRIGGER "formula_field_value_insert";

DROP TRIGGER "formula_field_config_insert";

DROP TRIGGER "formula_field_value_update";

DROP TRIGGER "formula_field_config_update";

DROP TRIGGER "field_value_revision_definition";

DROP TRIGGER "field_value_revision_insert";

DROP TRIGGER "field_value_revision_update";

DROP TRIGGER "field_value_revision_delete";

DROP TRIGGER "field_option_revision_insert";

DROP TRIGGER "field_option_revision_update";

DROP TRIGGER "field_option_revision_delete";

DROP TRIGGER "custom_field_type_with_values";

DROP TRIGGER "custom_field_value_validate_update";

DROP TRIGGER "crm_file_pending_insert";

DROP TRIGGER "crm_file_immutable_update";

DROP TRIGGER "crm_file_preserve_key";

DROP TRIGGER "custom_field_file_validate_insert";

DROP TRIGGER "custom_field_file_validate_update";

DROP TRIGGER "module_setting_entity_immutable";

DROP TRIGGER "module_setting_preserve";

DROP TRIGGER "record_layout_identity";

DROP TRIGGER "record_layout_delete";

DROP TRIGGER "record_draft_identity";

DROP TRIGGER "deal_stage_identity";

DROP TRIGGER "deal_stage_default_available";

DROP TRIGGER "deal_stage_keep_history";

DROP TRIGGER "deal_stage_insert_revision";

DROP TRIGGER "deal_stage_update_revision";

DROP TRIGGER "deal_active_stage_insert";

DROP TRIGGER "deal_active_stage_update";

DROP TRIGGER "lead_source_identity";

DROP TRIGGER "lead_status_identity";

DROP TRIGGER "lead_source_default";

DROP TRIGGER "lead_status_default";

DROP TRIGGER "lead_source_preserve";

DROP TRIGGER "lead_status_preserve";

DROP TRIGGER "lead_source_insert_revision";

DROP TRIGGER "lead_source_update_revision";

DROP TRIGGER "lead_status_insert_revision";

DROP TRIGGER "lead_status_update_revision";

DROP TRIGGER "lead_identity";

DROP TRIGGER "lead_converted_identity";

DROP TRIGGER "lead_source_insert";

DROP TRIGGER "lead_source_update";

DROP TRIGGER "lead_status_insert";

DROP TRIGGER "lead_status_update";

DROP TRIGGER "lead_reason_insert";

DROP TRIGGER "lead_reason_update";

DROP TRIGGER "lead_owner_insert";

DROP TRIGGER "lead_owner_update";

DROP TRIGGER "lead_collaborator_insert";

DROP TRIGGER "lead_collaborator_update";

DROP TRIGGER "lead_conversion_update";

DROP TRIGGER "lead_conversion_delete";

DROP TRIGGER "lead_conversion_result";

DROP TRIGGER "product_category_identity";

DROP TRIGGER "product_category_delete";

DROP TRIGGER "product_category_insert_revision";

DROP TRIGGER "product_category_update_revision";

DROP TRIGGER "product_identity";

DROP TRIGGER "product_delete";

DROP TRIGGER "product_owner_insert";

DROP TRIGGER "product_owner_update";

DROP TRIGGER "product_category_insert";

DROP TRIGGER "product_category_update";

DROP TRIGGER "product_variant_identity";

DROP TRIGGER "product_variant_delete";

DROP TRIGGER "product_default_variant_archive";

DROP TRIGGER "product_default_variant_restore";

DROP TRIGGER "product_variant_sku_insert";

DROP TRIGGER "product_variant_sku_update";

DROP TRIGGER "product_sku_lifecycle";

DROP TRIGGER "product_package_validate_insert";

DROP TRIGGER "product_package_validate_update";


CREATE TABLE sales_order(id TEXT PRIMARY KEY NOT NULL,number INTEGER NOT NULL UNIQUE,name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,company_id TEXT REFERENCES company(id) ON DELETE RESTRICT,lead_id TEXT REFERENCES lead(id) ON DELETE RESTRICT,deal_id TEXT REFERENCES deal(id) ON DELETE RESTRICT,owner_membership_id TEXT REFERENCES singleton_membership(user_id) ON DELETE SET NULL,creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND')),state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','confirmed','completed','cancelled')),source TEXT,description TEXT,revision INTEGER NOT NULL DEFAULT 0,policy_version INTEGER NOT NULL DEFAULT 1,creation_fingerprint TEXT NOT NULL,creation_result_json TEXT NOT NULL CHECK(json_valid(creation_result_json)),lines_json TEXT NOT NULL CHECK(json_valid(lines_json) AND json_type(lines_json)='array'),goods_minor INTEGER NOT NULL,discount_minor INTEGER NOT NULL DEFAULT 0,surcharge_minor INTEGER NOT NULL DEFAULT 0,tax_minor INTEGER NOT NULL DEFAULT 0,original_minor INTEGER NOT NULL,goods_remaining_minor INTEGER NOT NULL,surcharge_remaining_minor INTEGER NOT NULL,tax_remaining_minor INTEGER NOT NULL,collected_minor INTEGER NOT NULL DEFAULT 0,refunded_minor INTEGER NOT NULL DEFAULT 0,confirmed_at INTEGER,completed_at INTEGER,cancelled_at INTEGER,confirmed_date TEXT,completed_date TEXT,cancelled_date TEXT,business_time_zone TEXT,archived_at INTEGER,last_activity_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,CHECK(goods_minor>=0 AND discount_minor>=0 AND discount_minor<=goods_minor AND surcharge_minor>=0 AND tax_minor>=0 AND original_minor=goods_minor-discount_minor+surcharge_minor+tax_minor AND original_minor<=99999999999999),CHECK(goods_remaining_minor BETWEEN 0 AND goods_minor-discount_minor AND surcharge_remaining_minor BETWEEN 0 AND surcharge_minor AND tax_remaining_minor BETWEEN 0 AND tax_minor),CHECK(collected_minor BETWEEN 0 AND 99999999999999 AND refunded_minor BETWEEN 0 AND collected_minor));
CREATE INDEX sales_order_contact_idx ON sales_order(contact_id,created_at);CREATE INDEX sales_order_owner_idx ON sales_order(owner_membership_id);CREATE INDEX sales_order_state_idx ON sales_order(state,completed_at);
CREATE TABLE order_sequence(id TEXT PRIMARY KEY NOT NULL CHECK(id='orders'),next_number INTEGER NOT NULL CHECK(next_number>0));INSERT INTO order_sequence VALUES('orders',1);
CREATE TABLE order_operation(id TEXT PRIMARY KEY NOT NULL,order_id TEXT NOT NULL REFERENCES sales_order(id) ON DELETE RESTRICT,action TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,business_date TEXT NOT NULL,time_zone TEXT NOT NULL,reason TEXT,created_at INTEGER NOT NULL);
CREATE INDEX order_operation_order_idx ON order_operation(order_id,created_at);
CREATE TABLE order_payment(id TEXT PRIMARY KEY NOT NULL,order_id TEXT NOT NULL REFERENCES sales_order(id) ON DELETE RESTRICT,operation_id TEXT NOT NULL UNIQUE REFERENCES order_operation(id) ON DELETE RESTRICT,kind TEXT NOT NULL CHECK(kind IN ('collection','refund')),amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 99999999999999),currency TEXT NOT NULL,method TEXT NOT NULL,reference TEXT,actor_id TEXT NOT NULL,business_date TEXT NOT NULL,time_zone TEXT NOT NULL,reason TEXT,created_at INTEGER NOT NULL);
CREATE INDEX order_payment_order_idx ON order_payment(order_id,created_at);
CREATE TABLE order_adjustment(id TEXT PRIMARY KEY NOT NULL,order_id TEXT NOT NULL REFERENCES sales_order(id) ON DELETE RESTRICT,operation_id TEXT NOT NULL UNIQUE REFERENCES order_operation(id) ON DELETE RESTRICT,goods_minor INTEGER NOT NULL CHECK(goods_minor>=0),surcharge_minor INTEGER NOT NULL CHECK(surcharge_minor>=0),tax_minor INTEGER NOT NULL CHECK(tax_minor>=0),reason TEXT NOT NULL,business_date TEXT NOT NULL,time_zone TEXT NOT NULL,actor_id TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE variant_fulfillment(variant_id TEXT PRIMARY KEY NOT NULL REFERENCES product_variant(id) ON DELETE RESTRICT,stock_tracked INTEGER NOT NULL DEFAULT 0 CHECK(stock_tracked IN(0,1)),session_units INTEGER NOT NULL DEFAULT 0 CHECK(session_units BETWEEN 0 AND 1000000),expiry_days INTEGER CHECK(expiry_days BETWEEN 1 AND 36500),on_hand INTEGER NOT NULL DEFAULT 0 CHECK(typeof(on_hand)='integer' AND on_hand BETWEEN 0 AND 1000000000000),revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE inventory_movement(id TEXT PRIMARY KEY NOT NULL,variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE RESTRICT,order_id TEXT REFERENCES sales_order(id) ON DELETE RESTRICT,kind TEXT NOT NULL CHECK(kind IN('receipt','adjustment','sale','return')),quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity<>0),operation_key TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(result_json)),actor_id TEXT NOT NULL,reason TEXT NOT NULL,business_date TEXT NOT NULL,time_zone TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX inventory_operation_variant_unique ON inventory_movement(operation_key,variant_id);CREATE INDEX inventory_variant_idx ON inventory_movement(variant_id,created_at);
CREATE TABLE service_entitlement(id TEXT PRIMARY KEY NOT NULL,order_id TEXT NOT NULL REFERENCES sales_order(id) ON DELETE RESTRICT,contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE RESTRICT,label TEXT NOT NULL,granted INTEGER NOT NULL,remaining INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,revoked INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,expires_at INTEGER,created_at INTEGER NOT NULL,CHECK(granted>0 AND remaining>=0 AND used>=0 AND revoked>=0 AND granted=remaining+used+revoked));
CREATE UNIQUE INDEX entitlement_order_variant_unique ON service_entitlement(order_id,variant_id);CREATE INDEX entitlement_contact_idx ON service_entitlement(contact_id);
CREATE TABLE entitlement_movement(id TEXT PRIMARY KEY NOT NULL,entitlement_id TEXT NOT NULL REFERENCES service_entitlement(id) ON DELETE RESTRICT,kind TEXT NOT NULL CHECK(kind IN('grant','use','restore','revoke')),quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity>0),operation_key TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(result_json)),actor_id TEXT NOT NULL,reason TEXT NOT NULL,business_date TEXT NOT NULL,time_zone TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX entitlement_operation_unique ON entitlement_movement(operation_key,entitlement_id);


CREATE TABLE "activity_order_backup" AS SELECT * FROM "activity";

CREATE TABLE "activity_visibility_order_backup" AS SELECT * FROM "activity_visibility";

CREATE TABLE "crm_file_order_backup" AS SELECT * FROM "crm_file";

CREATE TABLE "custom_field_definition_order_backup" AS SELECT * FROM "custom_field_definition";

CREATE TABLE "custom_field_option_order_backup" AS SELECT * FROM "custom_field_option";

CREATE TABLE "custom_field_value_order_backup" AS SELECT * FROM "custom_field_value";

CREATE TABLE "field_configuration_revision_order_backup" AS SELECT * FROM "field_configuration_revision";

CREATE TABLE "field_conversion_guard_order_backup" AS SELECT * FROM "field_conversion_guard";

CREATE TABLE "field_conversion_preview_order_backup" AS SELECT * FROM "field_conversion_preview";

CREATE TABLE "field_value_revision_order_backup" AS SELECT * FROM "field_value_revision";

CREATE TABLE "module_setting_order_backup" AS SELECT * FROM "module_setting";

CREATE TABLE "record_draft_order_backup" AS SELECT * FROM "record_draft";

CREATE TABLE "record_layout_order_backup" AS SELECT * FROM "record_layout";

CREATE TABLE "saved_view_order_backup" AS SELECT * FROM "saved_view";

CREATE TABLE "saved_view_default_order_backup" AS SELECT * FROM "saved_view_default";

CREATE TABLE "lead_mapping_order_backup" AS SELECT * FROM "lead_mapping";

DROP TABLE "lead_mapping";

DROP TABLE "saved_view_default";

DROP TABLE "saved_view";

DROP TABLE "record_layout";

DROP TABLE "record_draft";

DROP TABLE "module_setting";

DROP TABLE "field_value_revision";

DROP TABLE "field_conversion_preview";

DROP TABLE "field_conversion_guard";

DROP TABLE "field_configuration_revision";

DROP TABLE "custom_field_value";

DROP TABLE "custom_field_option";

DROP TABLE "custom_field_definition";

DROP TABLE "crm_file";

DROP TABLE "activity_visibility";

DROP TABLE "activity";

CREATE TABLE "activity" (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL CHECK (type IN ('note', 'call', 'meeting', 'task', 'stage_change')),
  subject text,
  content text,
  occurred_at integer,
  due_at integer,
  completed_at integer,
  company_id text REFERENCES company(id) ON DELETE CASCADE,
  contact_id text REFERENCES contact(id) ON DELETE CASCADE,
  deal_id text REFERENCES deal(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  metadata_json text CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  "lead_id" TEXT REFERENCES lead(id) ON DELETE CASCADE,
  "product_id" TEXT REFERENCES product(id) ON DELETE CASCADE,
 "order_id" TEXT REFERENCES sales_order(id) ON DELETE CASCADE,
  CHECK (((company_id IS NOT NULL) + (contact_id IS NOT NULL) + (deal_id IS NOT NULL) + (lead_id IS NOT NULL) + (product_id IS NOT NULL) + (order_id IS NOT NULL)) >= 1)
);

INSERT INTO "activity"("id","type","subject","content","occurred_at","due_at","completed_at","company_id","contact_id","deal_id","author_user_id","metadata_json","created_at","updated_at","lead_id","product_id") SELECT "id","type","subject","content","occurred_at","due_at","completed_at","company_id","contact_id","deal_id","author_user_id","metadata_json","created_at","updated_at","lead_id","product_id" FROM "activity_order_backup";

DROP TABLE "activity_order_backup";

CREATE TABLE `activity_visibility` (
  `activity_id` text NOT NULL REFERENCES `activity` (`id`) ON DELETE CASCADE,
  `membership_id` text NOT NULL REFERENCES `singleton_membership` (`user_id`) ON DELETE CASCADE,
  PRIMARY KEY (`activity_id`, `membership_id`)
);

INSERT INTO "activity_visibility"("activity_id","membership_id") SELECT "activity_id","membership_id" FROM "activity_visibility_order_backup";

DROP TABLE "activity_visibility_order_backup";

CREATE TABLE crm_file (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead','product','order')),
  record_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  size INTEGER NOT NULL CHECK(typeof(size)='integer' AND size BETWEEN 0 AND 10485760),
  status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','cleaning')),
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  cleanup_attempted_at INTEGER,
  CHECK((status='ready' AND ready_at IS NOT NULL) OR (status!='ready' AND ready_at IS NULL))
);

INSERT INTO "crm_file"("id","object_key","entity","record_id","field_id","uploader_id","file_name","size","status","created_at","ready_at","cleanup_attempted_at") SELECT "id","object_key","entity","record_id","field_id","uploader_id","file_name","size","status","created_at","ready_at","cleanup_attempted_at" FROM "crm_file_order_backup";

DROP TABLE "crm_file_order_backup";

CREATE TABLE "custom_field_definition" (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal', 'lead', 'product','order')),
  `key` text NOT NULL,
  `label` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer', 'formula', 'file')),
  `config_json` text CHECK (`config_json` IS NULL OR json_valid(`config_json`)),
  `required` integer DEFAULT false NOT NULL,
  `show_on_sheet` integer DEFAULT true NOT NULL,
  `show_on_table` integer DEFAULT false NOT NULL,
  `show_on_filter` integer DEFAULT false NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, deleted_at integer);

INSERT INTO "custom_field_definition"("id","entity","key","label","type","config_json","required","show_on_sheet","show_on_table","show_on_filter","position","archived_at","created_at","updated_at","deleted_at") SELECT "id","entity","key","label","type","config_json","required","show_on_sheet","show_on_table","show_on_filter","position","archived_at","created_at","updated_at","deleted_at" FROM "custom_field_definition_order_backup";

DROP TABLE "custom_field_definition_order_backup";

CREATE TABLE "custom_field_option" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition" (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);

INSERT INTO "custom_field_option"("id","field_id","label","position","archived_at") SELECT "id","field_id","label","position","archived_at" FROM "custom_field_option_order_backup";

DROP TABLE "custom_field_option_order_backup";

CREATE TABLE "custom_field_value" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition" (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES "custom_field_option" (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  json_value text CHECK (json_value IS NULL OR json_valid(json_value)),
  customer_reference_id text REFERENCES contact(id) ON DELETE RESTRICT,
  "lead_id" TEXT REFERENCES lead(id) ON DELETE CASCADE,
  "product_id" TEXT REFERENCES product(id) ON DELETE CASCADE,
 "order_id" TEXT REFERENCES sales_order(id) ON DELETE CASCADE,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL) + (`lead_id` IS NOT NULL) + (`product_id` IS NOT NULL) + (`order_id` IS NOT NULL)) = 1)
);

INSERT INTO "custom_field_value"("id","field_id","company_id","contact_id","deal_id","text_value","number_value","date_value","boolean_value","option_id","user_membership_id","updated_at","json_value","customer_reference_id","lead_id","product_id") SELECT "id","field_id","company_id","contact_id","deal_id","text_value","number_value","date_value","boolean_value","option_id","user_membership_id","updated_at","json_value","customer_reference_id","lead_id","product_id" FROM "custom_field_value_order_backup";

DROP TABLE "custom_field_value_order_backup";

CREATE TABLE field_configuration_revision (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal','lead','product','order')),
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "field_configuration_revision"("entity","revision") SELECT "entity","revision" FROM "field_configuration_revision_order_backup";

DROP TABLE "field_configuration_revision_order_backup";

CREATE TABLE "field_conversion_guard" (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL
);

INSERT INTO "field_conversion_guard"("field_id","source_type","target_type") SELECT "field_id","source_type","target_type" FROM "field_conversion_guard_order_backup";

DROP TABLE "field_conversion_guard_order_backup";

CREATE TABLE "field_conversion_preview" (
  id TEXT PRIMARY KEY NOT NULL,
  field_id TEXT NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  configuration_revision INTEGER NOT NULL,
  value_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO "field_conversion_preview"("id","field_id","user_id","source_type","target_type","config_json","configuration_revision","value_revision","expires_at") SELECT "id","field_id","user_id","source_type","target_type","config_json","configuration_revision","value_revision","expires_at" FROM "field_conversion_preview_order_backup";

DROP TABLE "field_conversion_preview_order_backup";

CREATE TABLE "field_value_revision" (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "field_value_revision"("field_id","revision") SELECT "field_id","revision" FROM "field_value_revision_order_backup";

DROP TABLE "field_value_revision_order_backup";

CREATE TABLE module_setting (
  entity TEXT PRIMARY KEY NOT NULL CHECK (entity IN ('company','contact','deal','lead','product','order')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision) = 'integer' AND revision >= 0),
  updated_at INTEGER NOT NULL
);

INSERT INTO "module_setting"("entity","enabled","revision","updated_at") SELECT "entity","enabled","revision","updated_at" FROM "module_setting_order_backup";

DROP TABLE "module_setting_order_backup";

CREATE TABLE record_draft (
  id TEXT PRIMARY KEY NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead','product','order')),
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK(expires_at > created_at)
);

INSERT INTO "record_draft"("id","entity","user_id","expires_at","consumed_at","created_at") SELECT "id","entity","user_id","expires_at","consumed_at","created_at" FROM "record_draft_order_backup";

DROP TABLE "record_draft_order_backup";

CREATE TABLE record_layout (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal','lead','product','order')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  fields_json TEXT NOT NULL DEFAULT 'null' CHECK(json_valid(fields_json)),
  updated_at INTEGER NOT NULL
);

INSERT INTO "record_layout"("entity","revision","fields_json","updated_at") SELECT "entity","revision","fields_json","updated_at" FROM "record_layout_order_backup";

DROP TABLE "record_layout_order_backup";

CREATE TABLE `saved_view` (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal', 'lead', 'product','order')),
  `name` text NOT NULL,
  `shared` integer DEFAULT false NOT NULL,
  `state_json` text NOT NULL CHECK (json_valid(`state_json`)),
  `owner_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, creator_user_id text REFERENCES user(id) ON DELETE SET NULL);

INSERT INTO "saved_view"("id","entity","name","shared","state_json","owner_membership_id","created_at","updated_at","creator_user_id") SELECT "id","entity","name","shared","state_json","owner_membership_id","created_at","updated_at","creator_user_id" FROM "saved_view_order_backup";

DROP TABLE "saved_view_order_backup";

CREATE TABLE saved_view_default (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead','product','order')),
  view_id TEXT NOT NULL REFERENCES saved_view(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, entity)
);

INSERT INTO "saved_view_default"("user_id","entity","view_id") SELECT "user_id","entity","view_id" FROM "saved_view_default_order_backup";

DROP TABLE "saved_view_default_order_backup";

CREATE TABLE lead_mapping(id TEXT PRIMARY KEY NOT NULL CHECK(id='contact'),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),mappings_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(mappings_json)),auto_order INTEGER NOT NULL DEFAULT 0 CHECK(auto_order IN (0,1)),auto_deal INTEGER NOT NULL DEFAULT 0 CHECK(auto_deal=0),updated_at INTEGER NOT NULL);

INSERT INTO "lead_mapping"("id","revision","mappings_json","auto_order","auto_deal","updated_at") SELECT "id","revision","mappings_json","auto_order","auto_deal","updated_at" FROM "lead_mapping_order_backup";

DROP TABLE "lead_mapping_order_backup";

CREATE INDEX `activity_visibility_member_idx` ON `activity_visibility` (`membership_id`);

CREATE UNIQUE INDEX `saved_view_owner_name_unique` ON `saved_view` (`entity`, `owner_membership_id`, `name`);

CREATE INDEX `saved_view_entity_shared_idx` ON `saved_view` (`entity`, `shared`);

CREATE INDEX activity_company_created_idx ON activity(company_id, created_at, id);

CREATE INDEX activity_contact_created_idx ON activity(contact_id, created_at, id);

CREATE INDEX activity_deal_created_idx ON activity(deal_id, created_at, id);

CREATE INDEX activity_due_idx ON activity(due_at);

CREATE INDEX activity_author_idx ON activity(author_user_id);

CREATE UNIQUE INDEX saved_view_creator_name_unique ON saved_view(entity, creator_user_id, name);

CREATE INDEX saved_view_default_view_idx ON saved_view_default(view_id);

CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`, `key`);

CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`, `position`);

CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`, `position`);

CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`, `company_id`);

CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`, `contact_id`);

CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`, `deal_id`);

CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`, `text_value`);

CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`, `number_value`);

CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`, `date_value`);

CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);

CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

CREATE INDEX custom_field_value_customer_idx ON custom_field_value(customer_reference_id);

CREATE UNIQUE INDEX field_conversion_preview_owner_idx ON field_conversion_preview(field_id,user_id);

CREATE INDEX field_conversion_preview_expiry_idx ON field_conversion_preview(expires_at);

CREATE UNIQUE INDEX crm_file_object_key_unique ON crm_file(object_key);

CREATE INDEX crm_file_anchor_idx ON crm_file(entity,record_id,field_id);

CREATE INDEX crm_file_cleanup_idx ON crm_file(status,created_at);

CREATE UNIQUE INDEX custom_field_lead_unique ON custom_field_value(field_id,lead_id);

CREATE INDEX activity_lead_created_idx ON activity(lead_id,created_at,id);

CREATE UNIQUE INDEX custom_field_product_unique ON custom_field_value(field_id,product_id);

CREATE INDEX activity_product_created_idx ON activity(product_id,created_at,id);

CREATE UNIQUE INDEX custom_field_order_unique ON custom_field_value(field_id,order_id);

CREATE INDEX activity_order_created_idx ON activity(order_id,created_at,id);

INSERT INTO field_configuration_revision VALUES('order',0);

INSERT INTO module_setting VALUES('order',1,0,0);

INSERT INTO record_layout VALUES('order',0,'null',0);

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

CREATE TRIGGER `deal_required_relationships_insert`
BEFORE INSERT ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_required_relationships_update`
BEFORE UPDATE OF `company_id`, `owner_membership_id` ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_contact_company_insert`
BEFORE INSERT ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `deal_contact_company_update`
BEFORE UPDATE OF `deal_id`, `contact_id` ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `contact_company_preserves_deals`
BEFORE UPDATE OF `company_id` ON `contact`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `deal` ON `deal`.`id` = `deal_contact`.`deal_id`
     WHERE `deal_contact`.`contact_id` = OLD.`id`
       AND (NEW.`company_id` IS NULL OR NEW.`company_id` != `deal`.`company_id`)
  ) THEN RAISE(ABORT, 'contact company conflicts with a deal') END);
END;

CREATE TRIGGER `deal_company_preserves_contacts`
BEFORE UPDATE OF `company_id` ON `deal`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `contact` ON `contact`.`id` = `deal_contact`.`contact_id`
     WHERE `deal_contact`.`deal_id` = OLD.`id`
       AND (`contact`.`company_id` IS NULL OR `contact`.`company_id` != NEW.`company_id`)
  ) THEN RAISE(ABORT, 'deal company conflicts with a contact') END);
END;

CREATE TRIGGER activity_compatible_anchors_insert
BEFORE INSERT ON activity
BEGIN
 SELECT (CASE WHEN NEW.order_id IS NOT NULL AND (NEW.company_id IS NOT NULL OR NEW.contact_id IS NOT NULL OR NEW.deal_id IS NOT NULL OR NEW.lead_id IS NOT NULL OR NEW.product_id IS NOT NULL) THEN RAISE(ABORT,'activity anchor mismatch') END);
 SELECT (CASE WHEN NEW.product_id IS NOT NULL AND (NEW.company_id IS NOT NULL OR NEW.contact_id IS NOT NULL OR NEW.deal_id IS NOT NULL OR NEW.lead_id IS NOT NULL OR NEW.order_id IS NOT NULL) THEN RAISE(ABORT,'activity anchor mismatch') END);
 SELECT (CASE WHEN NEW.lead_id IS NOT NULL AND (NEW.company_id IS NOT NULL OR NEW.contact_id IS NOT NULL OR NEW.deal_id IS NOT NULL OR NEW.product_id IS NOT NULL OR NEW.order_id IS NOT NULL) THEN RAISE(ABORT,'activity anchor mismatch') END);
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id = NEW.author_user_id AND status = 'active')
    THEN RAISE(ABORT, 'author membership is inactive') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact WHERE id = NEW.contact_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.deal_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM deal WHERE id = NEW.deal_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.deal_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact JOIN deal ON contact.company_id = deal.company_id WHERE contact.id = NEW.contact_id AND deal.id = NEW.deal_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
END;

CREATE TRIGGER activity_history_immutable
BEFORE UPDATE ON activity
WHEN OLD.type != 'task' OR NEW.type != OLD.type OR NEW.id != OLD.id
  OR NEW.author_user_id != OLD.author_user_id OR NEW.created_at != OLD.created_at
  OR NEW.company_id IS NOT OLD.company_id OR NEW.contact_id IS NOT OLD.contact_id
  OR NEW.order_id IS NOT OLD.order_id OR NEW.product_id IS NOT OLD.product_id OR NEW.lead_id IS NOT OLD.lead_id OR NEW.deal_id IS NOT OLD.deal_id OR NEW.subject IS NOT OLD.subject
  OR NEW.content IS NOT OLD.content OR NEW.occurred_at IS NOT OLD.occurred_at
  OR NEW.due_at IS NOT OLD.due_at OR NEW.metadata_json IS NOT OLD.metadata_json
BEGIN
  SELECT RAISE(ABORT, 'activity history is immutable');
END;

CREATE TRIGGER saved_view_creator_immutable BEFORE UPDATE OF creator_user_id ON saved_view
WHEN NEW.creator_user_id IS NOT NULL AND NEW.creator_user_id IS NOT OLD.creator_user_id
BEGIN SELECT RAISE(ABORT, 'saved_view_creator_immutable'); END;

CREATE TRIGGER saved_view_edit_active_owner BEFORE UPDATE ON saved_view
WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active'
)
BEGIN SELECT RAISE(ABORT, 'saved_view_owner_inactive'); END;

CREATE TRIGGER deal_currency_job_insert BEFORE INSERT ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_currency_job_money_update BEFORE UPDATE OF amount_minor,currency ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency)
 AND EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_currency_job_delete BEFORE DELETE ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_money_revision_update BEFORE UPDATE ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency) AND NEW.money_revision != OLD.money_revision + 1
BEGIN SELECT RAISE(ABORT,'deal_money_revision_conflict'); END;

CREATE TRIGGER exchange_rate_job_insert BEFORE INSERT ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER exchange_rate_job_update BEFORE UPDATE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER exchange_rate_job_delete BEFORE DELETE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER membership_default_profile AFTER INSERT ON singleton_membership
BEGIN
  INSERT INTO membership_access VALUES (NEW.user_id, 'standard-member');
END;

CREATE TRIGGER member_branch_active_insert BEFORE INSERT ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER member_branch_active_update BEFORE UPDATE ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER branch_archive_in_use BEFORE UPDATE OF archived_at ON branch WHEN NEW.archived_at IS NOT NULL
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM branch_setting WHERE default_branch_id=OLD.id)
    OR EXISTS (SELECT 1 FROM member_branch WHERE branch_id=OLD.id)
    THEN RAISE(ABORT, 'branch_in_use') END);
END;

CREATE TRIGGER branch_default_active BEFORE UPDATE OF default_branch_id ON branch_setting
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.default_branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER membership_clear_branches AFTER UPDATE OF status ON singleton_membership WHEN NEW.status='revoked'
BEGIN
  DELETE FROM member_branch WHERE membership_id=NEW.user_id;
END;

CREATE TRIGGER saved_view_default_visible_insert BEFORE INSERT ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;

CREATE TRIGGER saved_view_default_visible_update BEFORE UPDATE ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;

CREATE TRIGGER saved_view_default_unshare AFTER UPDATE OF shared ON saved_view
WHEN OLD.shared=1 AND NEW.shared=0
BEGIN DELETE FROM saved_view_default WHERE view_id=NEW.id AND user_id IS NOT NEW.creator_user_id; END;

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
    OR EXISTS (SELECT 1 FROM lead WHERE owner_membership_id=OLD.user_id) OR EXISTS (SELECT 1 FROM lead_collaborator WHERE membership_id=OLD.user_id) OR EXISTS (SELECT 1 FROM product WHERE owner_membership_id=OLD.user_id) OR EXISTS(SELECT 1 FROM sales_order WHERE owner_membership_id=OLD.user_id) THEN RAISE(ABORT, 'membership references require cleanup') END);
END;

CREATE TRIGGER custom_field_position_insert BEFORE INSERT ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_position_update BEFORE UPDATE OF position ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_insert BEFORE INSERT ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_update BEFORE UPDATE OF position ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;

CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;

CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_value_validate_insert BEFORE INSERT ON custom_field_value
BEGIN
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL) OR (f.entity = 'lead' AND NEW.lead_id IS NOT NULL) OR (f.entity = 'product' AND NEW.product_id IS NOT NULL) OR (f.entity = 'order' AND NEW.order_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_rating_config_update BEFORE UPDATE OF config_json ON custom_field_definition
WHEN NEW.type='rating' AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=NEW.id AND number_value > coalesce(json_extract(NEW.config_json,'$.ratingMax'),5))
BEGIN SELECT RAISE(ABORT, 'field_rating_has_values'); END;

CREATE TRIGGER field_configuration_insert AFTER INSERT ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_update AFTER UPDATE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_delete AFTER DELETE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=OLD.entity; END;

CREATE TRIGGER formula_field_value_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_insert BEFORE INSERT ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER formula_field_value_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_update BEFORE UPDATE ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER field_value_revision_definition AFTER INSERT ON custom_field_definition
BEGIN INSERT INTO field_value_revision(field_id) VALUES(NEW.id); END;

CREATE TRIGGER field_value_revision_insert AFTER INSERT ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=NEW.field_id; END;

CREATE TRIGGER field_value_revision_update AFTER UPDATE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id IN (OLD.field_id,NEW.field_id); END;

CREATE TRIGGER field_value_revision_delete AFTER DELETE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=OLD.field_id; END;

CREATE TRIGGER field_option_revision_insert AFTER INSERT ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_update AFTER UPDATE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_delete AFTER DELETE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=OLD.field_id); END;

CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
AND (OLD.type='file' OR NEW.type='file' OR NOT EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=OLD.id AND source_type=OLD.type AND target_type=NEW.type))
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id AND NEW.lead_id IS OLD.lead_id AND NEW.product_id IS OLD.product_id AND NEW.order_id IS OLD.order_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL) OR (f.entity = 'lead' AND NEW.lead_id IS NOT NULL) OR (f.entity = 'product' AND NEW.product_id IS NOT NULL) OR (f.entity = 'order' AND NEW.order_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND (archived_at IS NULL OR (
      json_array_length(OLD.json_value)=1 AND json_extract(OLD.json_value,'$[0]')=NEW.option_id
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='multiselect' AND target_type='select')
    ))
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND (archived_at IS NULL OR (
      OLD.option_id=chosen.value AND json_array_length(NEW.json_value)=1
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='select' AND target_type='multiselect')
    ))
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER crm_file_pending_insert BEFORE INSERT ON crm_file
WHEN NEW.status!='pending'
BEGIN SELECT RAISE(ABORT,'file_initial_status_invalid'); END;

CREATE TRIGGER crm_file_immutable_update BEFORE UPDATE ON crm_file
WHEN NEW.id IS NOT OLD.id OR NEW.object_key IS NOT OLD.object_key
 OR NEW.entity IS NOT OLD.entity OR NEW.record_id IS NOT OLD.record_id
 OR NEW.field_id IS NOT OLD.field_id OR NEW.uploader_id IS NOT OLD.uploader_id
 OR NEW.file_name IS NOT OLD.file_name OR NEW.size IS NOT OLD.size OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.status='ready' AND (NEW.status IS NOT OLD.status OR NEW.ready_at IS NOT OLD.ready_at))
 OR (OLD.status='cleaning' AND NEW.status!='cleaning')
 OR (OLD.status='failed' AND NEW.status NOT IN ('failed','cleaning'))
BEGIN SELECT RAISE(ABORT,'file_metadata_immutable'); END;

CREATE TRIGGER crm_file_preserve_key BEFORE DELETE ON crm_file
BEGIN SELECT RAISE(ABORT,'file_key_retained'); END;

CREATE TRIGGER custom_field_file_validate_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id) OR (f.entity='lead' AND f.record_id=NEW.lead_id) OR (f.entity='product' AND f.record_id=NEW.product_id) OR (f.entity='order' AND f.record_id=NEW.order_id))
  )
 );
END;

CREATE TRIGGER custom_field_file_validate_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id) OR (f.entity='lead' AND f.record_id=NEW.lead_id) OR (f.entity='product' AND f.record_id=NEW.product_id) OR (f.entity='order' AND f.record_id=NEW.order_id))
  )
 );
END;

CREATE TRIGGER module_setting_entity_immutable
BEFORE UPDATE OF entity ON module_setting
WHEN NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'module entity is immutable'); END;

CREATE TRIGGER module_setting_preserve
BEFORE DELETE ON module_setting
BEGIN SELECT RAISE(ABORT, 'module settings must be retained'); END;

CREATE TRIGGER record_layout_identity BEFORE UPDATE OF entity ON record_layout
WHEN NEW.entity <> OLD.entity BEGIN SELECT RAISE(ABORT,'layout_identity_immutable'); END;

CREATE TRIGGER record_layout_delete BEFORE DELETE ON record_layout
BEGIN SELECT RAISE(ABORT,'layout_delete_forbidden'); END;

CREATE TRIGGER record_draft_identity BEFORE UPDATE ON record_draft
WHEN NEW.id <> OLD.id OR NEW.entity <> OLD.entity OR NEW.user_id <> OLD.user_id
  OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at
  OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS NOT OLD.consumed_at)
BEGIN SELECT RAISE(ABORT,'draft_identity_immutable'); END;

CREATE TRIGGER deal_stage_identity BEFORE UPDATE ON deal_stage
WHEN NEW.id <> OLD.id OR NEW.label_key <> OLD.label_key OR NEW.closed_state <> OLD.closed_state
BEGIN SELECT RAISE(ABORT,'deal_stage_identity_immutable'); END;

CREATE TRIGGER deal_stage_default_available BEFORE UPDATE OF archived_at ON deal_stage
WHEN OLD.id='demo-booked' AND NEW.archived_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'deal_stage_default_required'); END;

CREATE TRIGGER deal_stage_keep_history BEFORE DELETE ON deal_stage
BEGIN SELECT RAISE(ABORT,'deal_stage_delete_forbidden'); END;

CREATE TRIGGER deal_stage_insert_revision AFTER INSERT ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;

CREATE TRIGGER deal_stage_update_revision AFTER UPDATE ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;

CREATE TRIGGER deal_active_stage_insert BEFORE INSERT ON deal
WHEN NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;

CREATE TRIGGER deal_active_stage_update BEFORE UPDATE OF stage_id ON deal
WHEN NEW.stage_id <> OLD.stage_id AND NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;

CREATE TRIGGER lead_source_identity BEFORE UPDATE ON lead_source WHEN NEW.id IS NOT OLD.id OR NEW.label_key IS NOT OLD.label_key BEGIN SELECT RAISE(ABORT,'lead_catalog_identity_immutable'); END;

CREATE TRIGGER lead_status_identity BEFORE UPDATE ON lead_status WHEN NEW.id IS NOT OLD.id OR NEW.label_key IS NOT OLD.label_key OR NEW.meaning IS NOT OLD.meaning BEGIN SELECT RAISE(ABORT,'lead_catalog_identity_immutable'); END;

CREATE TRIGGER lead_source_default BEFORE UPDATE ON lead_source WHEN OLD.id='manual' AND NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'lead_default_required'); END;

CREATE TRIGGER lead_status_default BEFORE UPDATE ON lead_status WHEN OLD.id IN ('new','converted') AND NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'lead_default_required'); END;

CREATE TRIGGER lead_source_preserve BEFORE DELETE ON lead_source BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;

CREATE TRIGGER lead_status_preserve BEFORE DELETE ON lead_status BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;

CREATE TRIGGER lead_source_insert_revision AFTER INSERT ON lead_source BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;

CREATE TRIGGER lead_source_update_revision AFTER UPDATE ON lead_source BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;

CREATE TRIGGER lead_status_insert_revision AFTER INSERT ON lead_status BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;

CREATE TRIGGER lead_status_update_revision AFTER UPDATE ON lead_status BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;

CREATE TRIGGER lead_identity BEFORE UPDATE ON lead WHEN NEW.id IS NOT OLD.id OR NEW.creator_user_id IS NOT OLD.creator_user_id OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'lead_identity_immutable'); END;

CREATE TRIGGER lead_converted_identity BEFORE UPDATE ON lead WHEN OLD.converted_at IS NOT NULL AND (NEW.converted_at IS NOT OLD.converted_at OR NEW.converted_contact_id IS NOT OLD.converted_contact_id OR NEW.status_id IS NOT OLD.status_id) BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;

CREATE TRIGGER lead_source_insert BEFORE INSERT ON lead WHEN NOT EXISTS(SELECT 1 FROM lead_source WHERE id=NEW.source_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_source_unavailable'); END;

CREATE TRIGGER lead_source_update BEFORE UPDATE OF source_id ON lead WHEN NEW.source_id IS NOT OLD.source_id AND NOT EXISTS(SELECT 1 FROM lead_source WHERE id=NEW.source_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_source_unavailable'); END;

CREATE TRIGGER lead_status_insert BEFORE INSERT ON lead WHEN NOT EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_status_unavailable'); END;

CREATE TRIGGER lead_status_update BEFORE UPDATE OF status_id ON lead WHEN NEW.status_id IS NOT OLD.status_id AND NOT EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_status_unavailable'); END;

CREATE TRIGGER lead_reason_insert BEFORE INSERT ON lead WHEN EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND requires_reason=1) AND length(trim(coalesce(NEW.rejection_reason,'')))=0 BEGIN SELECT RAISE(ABORT,'lead_reason_required'); END;

CREATE TRIGGER lead_reason_update BEFORE UPDATE ON lead WHEN (NEW.status_id IS NOT OLD.status_id OR NEW.rejection_reason IS NOT OLD.rejection_reason) AND EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND requires_reason=1) AND length(trim(coalesce(NEW.rejection_reason,'')))=0 BEGIN SELECT RAISE(ABORT,'lead_reason_required'); END;

CREATE TRIGGER lead_owner_insert BEFORE INSERT ON lead WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_owner_inactive'); END;

CREATE TRIGGER lead_owner_update BEFORE UPDATE ON lead WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_owner_inactive'); END;

CREATE TRIGGER lead_collaborator_insert BEFORE INSERT ON lead_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_collaborator_inactive'); END;

CREATE TRIGGER lead_collaborator_update BEFORE UPDATE ON lead_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_collaborator_inactive'); END;

CREATE TRIGGER lead_conversion_update BEFORE UPDATE ON lead_conversion BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;

CREATE TRIGGER lead_conversion_delete BEFORE DELETE ON lead_conversion BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;

CREATE TRIGGER lead_conversion_result BEFORE INSERT ON lead_conversion WHEN NOT EXISTS(SELECT 1 FROM lead WHERE id=NEW.lead_id AND converted_contact_id=NEW.contact_id AND converted_at=NEW.completed_at AND status_id='converted') BEGIN SELECT RAISE(ABORT,'lead_conversion_result_mismatch'); END;

CREATE TRIGGER product_category_identity BEFORE UPDATE ON product_category WHEN NEW.id IS NOT OLD.id BEGIN SELECT RAISE(ABORT,'catalog_identity_immutable'); END;

CREATE TRIGGER product_category_delete BEFORE DELETE ON product_category BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;

CREATE TRIGGER product_category_insert_revision AFTER INSERT ON product_category BEGIN UPDATE product_category_revision SET revision=revision+1 WHERE id='categories'; END;

CREATE TRIGGER product_category_update_revision AFTER UPDATE ON product_category BEGIN UPDATE product_category_revision SET revision=revision+1 WHERE id='categories'; END;

CREATE TRIGGER product_identity BEFORE UPDATE ON product WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.creator_user_id IS NOT OLD.creator_user_id OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'catalog_identity_immutable'); END;

CREATE TRIGGER product_delete BEFORE DELETE ON product BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;

CREATE TRIGGER product_owner_insert BEFORE INSERT ON product WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'catalog_owner_inactive'); END;

CREATE TRIGGER product_owner_update BEFORE UPDATE ON product WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'catalog_owner_inactive'); END;

CREATE TRIGGER product_category_insert BEFORE INSERT ON product WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_category WHERE id=NEW.category_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'catalog_category_unavailable'); END;

CREATE TRIGGER product_category_update BEFORE UPDATE OF category_id ON product WHEN NEW.category_id IS NOT OLD.category_id AND NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_category WHERE id=NEW.category_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'catalog_category_unavailable'); END;

CREATE TRIGGER product_variant_identity BEFORE UPDATE ON product_variant WHEN NEW.id IS NOT OLD.id OR NEW.product_id IS NOT OLD.product_id OR NEW.is_default IS NOT OLD.is_default OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'catalog_identity_immutable'); END;

CREATE TRIGGER product_variant_delete BEFORE DELETE ON product_variant BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;

CREATE TRIGGER product_default_variant_archive BEFORE UPDATE OF archived_at ON product_variant WHEN NEW.is_default=1 AND NEW.archived_at IS NOT NULL AND EXISTS(SELECT 1 FROM product WHERE id=NEW.product_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'catalog_default_variant_required'); END;

CREATE TRIGGER product_default_variant_restore BEFORE UPDATE OF archived_at ON product WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM product_variant WHERE product_id=NEW.id AND is_default=1 AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'catalog_default_variant_required'); END;

CREATE TRIGGER product_variant_sku_insert AFTER INSERT ON product_variant WHEN NEW.sku IS NOT NULL AND NEW.archived_at IS NULL AND EXISTS(SELECT 1 FROM product WHERE id=NEW.product_id AND archived_at IS NULL)
BEGIN INSERT INTO product_sku(normalized_sku,variant_id) VALUES(lower(trim(NEW.sku)),NEW.id); END;

CREATE TRIGGER product_variant_sku_update AFTER UPDATE OF sku,archived_at ON product_variant
BEGIN DELETE FROM product_sku WHERE variant_id=NEW.id; INSERT INTO product_sku(normalized_sku,variant_id) SELECT lower(trim(NEW.sku)),NEW.id WHERE NEW.sku IS NOT NULL AND NEW.archived_at IS NULL AND EXISTS(SELECT 1 FROM product WHERE id=NEW.product_id AND archived_at IS NULL); END;

CREATE TRIGGER product_sku_lifecycle AFTER UPDATE OF archived_at ON product WHEN NEW.archived_at IS NOT OLD.archived_at
BEGIN DELETE FROM product_sku WHERE variant_id IN (SELECT id FROM product_variant WHERE product_id=NEW.id); INSERT INTO product_sku(normalized_sku,variant_id) SELECT lower(trim(sku)),id FROM product_variant WHERE product_id=NEW.id AND archived_at IS NULL AND sku IS NOT NULL AND NEW.archived_at IS NULL; END;

CREATE TRIGGER product_package_validate_insert BEFORE INSERT ON product_package_component
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM product WHERE id=NEW.package_product_id AND kind='package') OR NOT EXISTS(SELECT 1 FROM product_variant v JOIN product p ON p.id=v.product_id WHERE v.id=NEW.component_variant_id AND v.archived_at IS NULL AND p.archived_at IS NULL) THEN RAISE(ABORT,'catalog_package_invalid') END);
 SELECT (CASE WHEN EXISTS(WITH RECURSIVE descendants(id) AS (SELECT product_id FROM product_variant WHERE id=NEW.component_variant_id UNION SELECT v.product_id FROM descendants d JOIN product_package_component c ON c.package_product_id=d.id JOIN product_variant v ON v.id=c.component_variant_id) SELECT 1 FROM descendants WHERE id=NEW.package_product_id) THEN RAISE(ABORT,'catalog_package_cycle') END);
END;

CREATE TRIGGER product_package_validate_update BEFORE UPDATE ON product_package_component WHEN NEW.package_product_id IS NOT OLD.package_product_id OR NEW.component_variant_id IS NOT OLD.component_variant_id
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM product WHERE id=NEW.package_product_id AND kind='package') OR NOT EXISTS(SELECT 1 FROM product_variant v JOIN product p ON p.id=v.product_id WHERE v.id=NEW.component_variant_id AND v.archived_at IS NULL AND p.archived_at IS NULL) THEN RAISE(ABORT,'catalog_package_invalid') END);
 SELECT (CASE WHEN EXISTS(WITH RECURSIVE descendants(id) AS (SELECT product_id FROM product_variant WHERE id=NEW.component_variant_id UNION SELECT v.product_id FROM descendants d JOIN product_package_component c ON c.package_product_id=d.id JOIN product_variant v ON v.id=c.component_variant_id) SELECT 1 FROM descendants WHERE id=NEW.package_product_id) THEN RAISE(ABORT,'catalog_package_cycle') END);
END;

INSERT INTO access_grant(profile_id,permission) VALUES('standard-member','order.create'),('standard-member','order.update'),('standard-member','order.archive'),('standard-member','order.restore'),('standard-member','order.assign'),('standard-member','order.confirm'),('standard-member','order.complete'),('standard-member','order.cancel');

CREATE TRIGGER order_operation_immutable_update BEFORE UPDATE ON order_operation BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER order_operation_immutable_delete BEFORE DELETE ON order_operation BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER order_payment_immutable_update BEFORE UPDATE ON order_payment BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER order_payment_immutable_delete BEFORE DELETE ON order_payment BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER order_adjustment_immutable_update BEFORE UPDATE ON order_adjustment BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER order_adjustment_immutable_delete BEFORE DELETE ON order_adjustment BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER order_payment_validate BEFORE INSERT ON order_payment
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM order_operation o JOIN sales_order s ON s.id=NEW.order_id WHERE o.id=NEW.operation_id AND o.order_id=NEW.order_id AND o.action=NEW.kind AND s.currency=NEW.currency) THEN RAISE(ABORT,'sales_payment_invalid') END);
END;

CREATE TRIGGER order_payment_project AFTER INSERT ON order_payment
BEGIN
 UPDATE sales_order SET collected_minor=collected_minor+(NEW.kind='collection')*NEW.amount_minor,refunded_minor=refunded_minor+(NEW.kind='refund')*NEW.amount_minor WHERE id=NEW.order_id;
END;

CREATE TRIGGER order_adjustment_validate BEFORE INSERT ON order_adjustment
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM order_operation o WHERE o.id=NEW.operation_id AND o.order_id=NEW.order_id AND o.action IN('adjust','cancel')) THEN RAISE(ABORT,'sales_adjustment_invalid') END);
END;

CREATE TRIGGER order_adjustment_project AFTER INSERT ON order_adjustment
BEGIN
 UPDATE sales_order SET goods_remaining_minor=goods_remaining_minor-NEW.goods_minor,surcharge_remaining_minor=surcharge_remaining_minor-NEW.surcharge_minor,tax_remaining_minor=tax_remaining_minor-NEW.tax_minor WHERE id=NEW.order_id;
END;

CREATE TRIGGER inventory_movement_immutable_update BEFORE UPDATE ON inventory_movement BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER inventory_movement_immutable_delete BEFORE DELETE ON inventory_movement BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER entitlement_movement_immutable_update BEFORE UPDATE ON entitlement_movement BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER entitlement_movement_immutable_delete BEFORE DELETE ON entitlement_movement BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER sales_order_identity BEFORE UPDATE ON sales_order WHEN NEW.creation_fingerprint IS NOT OLD.creation_fingerprint OR NEW.creation_result_json IS NOT OLD.creation_result_json OR NEW.id IS NOT OLD.id OR NEW.number IS NOT OLD.number OR NEW.creator_user_id IS NOT OLD.creator_user_id OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'sales_identity_immutable'); END;

CREATE TRIGGER sales_order_frozen BEFORE UPDATE ON sales_order WHEN OLD.state!='draft' AND (NEW.lines_json IS NOT OLD.lines_json OR NEW.contact_id IS NOT OLD.contact_id OR NEW.currency IS NOT OLD.currency OR NEW.source IS NOT OLD.source OR NEW.company_id IS NOT OLD.company_id OR NEW.lead_id IS NOT OLD.lead_id OR NEW.deal_id IS NOT OLD.deal_id OR NEW.original_minor IS NOT OLD.original_minor OR NEW.goods_minor IS NOT OLD.goods_minor OR NEW.discount_minor IS NOT OLD.discount_minor OR NEW.surcharge_minor IS NOT OLD.surcharge_minor OR NEW.tax_minor IS NOT OLD.tax_minor OR NEW.policy_version IS NOT OLD.policy_version) BEGIN SELECT RAISE(ABORT,'sales_snapshot_frozen'); END;

CREATE TRIGGER sales_order_state BEFORE UPDATE OF state ON sales_order WHEN NEW.state IS NOT OLD.state AND NOT ((OLD.state='draft' AND NEW.state IN('confirmed','cancelled')) OR (OLD.state='confirmed' AND NEW.state IN('completed','cancelled')) OR (OLD.state='completed' AND NEW.state='cancelled')) BEGIN SELECT RAISE(ABORT,'sales_state_invalid'); END;

CREATE TRIGGER sales_order_event_history BEFORE UPDATE ON sales_order WHEN (OLD.confirmed_at IS NOT NULL AND (NEW.confirmed_at IS NOT OLD.confirmed_at OR NEW.confirmed_date IS NOT OLD.confirmed_date)) OR (OLD.completed_at IS NOT NULL AND (NEW.completed_at IS NOT OLD.completed_at OR NEW.completed_date IS NOT OLD.completed_date)) OR (OLD.cancelled_at IS NOT NULL AND (NEW.cancelled_at IS NOT OLD.cancelled_at OR NEW.cancelled_date IS NOT OLD.cancelled_date)) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER sales_order_payment_projection BEFORE UPDATE OF collected_minor,refunded_minor ON sales_order WHEN NEW.collected_minor IS NOT OLD.collected_minor OR NEW.refunded_minor IS NOT OLD.refunded_minor
BEGIN
 SELECT (CASE WHEN NEW.collected_minor IS NOT COALESCE((SELECT SUM(amount_minor) FROM order_payment WHERE order_id=NEW.id AND kind='collection'),0) OR NEW.refunded_minor IS NOT COALESCE((SELECT SUM(amount_minor) FROM order_payment WHERE order_id=NEW.id AND kind='refund'),0) THEN RAISE(ABORT,'sales_projection_mismatch') END);
END;

CREATE TRIGGER sales_order_adjustment_projection BEFORE UPDATE OF goods_remaining_minor,surcharge_remaining_minor,tax_remaining_minor ON sales_order WHEN NEW.goods_remaining_minor IS NOT OLD.goods_remaining_minor OR NEW.surcharge_remaining_minor IS NOT OLD.surcharge_remaining_minor OR NEW.tax_remaining_minor IS NOT OLD.tax_remaining_minor
BEGIN
 SELECT (CASE WHEN NEW.goods_remaining_minor IS NOT NEW.goods_minor-NEW.discount_minor-COALESCE((SELECT SUM(goods_minor) FROM order_adjustment WHERE order_id=NEW.id),0) OR NEW.surcharge_remaining_minor IS NOT NEW.surcharge_minor-COALESCE((SELECT SUM(surcharge_minor) FROM order_adjustment WHERE order_id=NEW.id),0) OR NEW.tax_remaining_minor IS NOT NEW.tax_minor-COALESCE((SELECT SUM(tax_minor) FROM order_adjustment WHERE order_id=NEW.id),0) THEN RAISE(ABORT,'sales_projection_mismatch') END);
END;

CREATE TRIGGER sales_order_delete BEFORE DELETE ON sales_order BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER sales_order_owner_insert BEFORE INSERT ON sales_order WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'sales_owner_inactive'); END;

CREATE TRIGGER sales_order_owner_update BEFORE UPDATE ON sales_order WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'sales_owner_inactive'); END;

CREATE TRIGGER entitlement_identity BEFORE UPDATE ON service_entitlement WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.contact_id IS NOT OLD.contact_id OR NEW.variant_id IS NOT OLD.variant_id OR NEW.granted IS NOT OLD.granted OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER entitlement_delete BEFORE DELETE ON service_entitlement BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;

CREATE TRIGGER inventory_identity BEFORE UPDATE ON variant_fulfillment WHEN NEW.variant_id IS NOT OLD.variant_id BEGIN SELECT RAISE(ABORT,'sales_identity_immutable'); END;
CREATE TABLE task_record(
 activity_id TEXT PRIMARY KEY NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
 assignee_membership_id TEXT REFERENCES singleton_membership(user_id) ON DELETE SET NULL,
 current_cycle INTEGER NOT NULL DEFAULT 1 CHECK(current_cycle>=1),
 due_at INTEGER,
 completed_at INTEGER,
 overdue_breached INTEGER NOT NULL DEFAULT 0 CHECK(overdue_breached IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX task_assignee_due_idx ON task_record(assignee_membership_id,completed_at,due_at);

CREATE TABLE task_cycle(
 task_id TEXT NOT NULL REFERENCES task_record(activity_id) ON DELETE CASCADE,
 cycle INTEGER NOT NULL CHECK(cycle>=1),
 opened_at INTEGER NOT NULL,
 opened_by TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 due_at INTEGER,
 completed_at INTEGER,
 overdue_breached INTEGER NOT NULL DEFAULT 0 CHECK(overdue_breached IN(0,1)),
 reopen_reason TEXT,
 PRIMARY KEY(task_id,cycle)
);

CREATE TABLE task_deadline_history(
 id TEXT PRIMARY KEY NOT NULL,
 task_id TEXT NOT NULL REFERENCES task_record(activity_id) ON DELETE CASCADE,
 cycle INTEGER NOT NULL,
 previous_due_at INTEGER,
 next_due_at INTEGER,
 reason TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 operation_key TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 FOREIGN KEY(task_id,cycle) REFERENCES task_cycle(task_id,cycle) ON DELETE CASCADE
);

CREATE TABLE task_operation(
 id TEXT PRIMARY KEY NOT NULL,
 task_id TEXT NOT NULL REFERENCES task_record(activity_id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK(action IN('complete','reopen','deadline','assign')),
 fingerprint TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 created_at INTEGER NOT NULL
);

INSERT INTO task_record(activity_id,assignee_membership_id,current_cycle,due_at,completed_at,overdue_breached,revision,created_at,updated_at)
SELECT a.id,CASE WHEN m.status='active' THEN a.author_user_id ELSE NULL END,1,a.due_at,a.completed_at,CASE WHEN a.completed_at IS NOT NULL AND a.due_at IS NOT NULL AND a.completed_at>a.due_at THEN 1 ELSE 0 END,0,a.created_at,a.updated_at
FROM activity a LEFT JOIN singleton_membership m ON m.user_id=a.author_user_id WHERE a.type='task';

INSERT INTO task_cycle(task_id,cycle,opened_at,opened_by,due_at,completed_at,overdue_breached,reopen_reason)
SELECT a.id,1,a.created_at,a.author_user_id,a.due_at,a.completed_at,CASE WHEN a.completed_at IS NOT NULL AND a.due_at IS NOT NULL AND a.completed_at>a.due_at THEN 1 ELSE 0 END,NULL FROM activity a WHERE a.type='task';

CREATE TABLE appointment(
 id TEXT PRIMARY KEY NOT NULL,
 subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 1 AND 300),
 description TEXT,
 starts_at INTEGER NOT NULL,
 ends_at INTEGER NOT NULL,
 time_zone TEXT NOT NULL,
 contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
 company_id TEXT REFERENCES company(id) ON DELETE SET NULL,
 service_variant_id TEXT REFERENCES product_variant(id) ON DELETE SET NULL,
 organizer_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
 creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','completed','cancelled')),
 reminder_enabled INTEGER NOT NULL DEFAULT 1 CHECK(reminder_enabled IN(0,1)),
 reminder_offset_minutes INTEGER NOT NULL DEFAULT 15 CHECK(reminder_offset_minutes BETWEEN 0 AND 525600),
 conflict_acknowledged_at INTEGER,
 conflict_acknowledged_by TEXT REFERENCES user(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 CHECK(ends_at>starts_at),
 CHECK((conflict_acknowledged_at IS NULL)=(conflict_acknowledged_by IS NULL))
);
CREATE INDEX appointment_range_idx ON appointment(starts_at,ends_at,status);
CREATE INDEX appointment_organizer_idx ON appointment(organizer_membership_id,starts_at);

CREATE TABLE appointment_participant(
 appointment_id TEXT NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
 membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
 PRIMARY KEY(appointment_id,membership_id)
);
CREATE INDEX appointment_participant_member_idx ON appointment_participant(membership_id,appointment_id);

CREATE TABLE appointment_operation(
 id TEXT PRIMARY KEY NOT NULL,
 appointment_id TEXT NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK(action IN('create','update','complete','cancel')),
 fingerprint TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 created_at INTEGER NOT NULL
);

CREATE TABLE ticket_sequence(id TEXT PRIMARY KEY NOT NULL CHECK(id='tickets'),next_number INTEGER NOT NULL CHECK(next_number>0));
INSERT INTO ticket_sequence VALUES('tickets',1);

CREATE TABLE ticket(
 id TEXT PRIMARY KEY NOT NULL,
 number INTEGER NOT NULL UNIQUE,
 subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 1 AND 300),
 description TEXT,
 priority TEXT NOT NULL CHECK(priority IN('low','normal','high','urgent')),
 category TEXT,
 source TEXT NOT NULL,
 contact_id TEXT REFERENCES contact(id) ON DELETE SET NULL,
 company_id TEXT REFERENCES company(id) ON DELETE SET NULL,
 assignee_membership_id TEXT REFERENCES singleton_membership(user_id) ON DELETE SET NULL,
 creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
 current_cycle INTEGER NOT NULL DEFAULT 1 CHECK(current_cycle>=1),
 due_at INTEGER,
 first_response_at INTEGER,
 overdue_breached INTEGER NOT NULL DEFAULT 0 CHECK(overdue_breached IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX ticket_status_due_idx ON ticket(status,due_at);
CREATE INDEX ticket_assignee_idx ON ticket(assignee_membership_id,status,due_at);
CREATE INDEX ticket_contact_idx ON ticket(contact_id,created_at);

CREATE TABLE ticket_collaborator(
 ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
 membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
 PRIMARY KEY(ticket_id,membership_id)
);

CREATE TABLE ticket_cycle(
 ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
 cycle INTEGER NOT NULL CHECK(cycle>=1),
 opened_at INTEGER NOT NULL,
 opened_by TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 due_at INTEGER,
 resolved_at INTEGER,
 overdue_breached INTEGER NOT NULL DEFAULT 0 CHECK(overdue_breached IN(0,1)),
 reopen_reason TEXT,
 first_response_at INTEGER,
 PRIMARY KEY(ticket_id,cycle)
);

CREATE TABLE ticket_event(
 id TEXT PRIMARY KEY NOT NULL,
 ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
 cycle INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN('created','response','deadline','assign','resolve','reopen','collaborators')),
 content TEXT,
 previous_due_at INTEGER,
 next_due_at INTEGER,
 actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 operation_key TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at INTEGER NOT NULL,
 FOREIGN KEY(ticket_id,cycle) REFERENCES ticket_cycle(ticket_id,cycle) ON DELETE CASCADE
);
CREATE INDEX ticket_event_ticket_idx ON ticket_event(ticket_id,created_at);

CREATE TABLE notification_preference(
 membership_id TEXT PRIMARY KEY NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
 in_app_enabled INTEGER NOT NULL DEFAULT 1 CHECK(in_app_enabled IN(0,1)),
 browser_enabled INTEGER NOT NULL DEFAULT 0 CHECK(browser_enabled IN(0,1)),
 appointment_offset_minutes INTEGER NOT NULL DEFAULT 15 CHECK(appointment_offset_minutes BETWEEN 0 AND 525600),
 task_offset_minutes INTEGER NOT NULL DEFAULT 0 CHECK(task_offset_minutes BETWEEN 0 AND 525600),
 ticket_offset_minutes INTEGER NOT NULL DEFAULT 0 CHECK(ticket_offset_minutes BETWEEN 0 AND 525600),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at INTEGER NOT NULL
);

INSERT INTO notification_preference(membership_id,updated_at) SELECT user_id,unixepoch('subsec')*1000 FROM singleton_membership WHERE status='active';

CREATE TABLE notification(
 id TEXT PRIMARY KEY NOT NULL,
 recipient_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('appointment','task','ticket')),
 source_id TEXT NOT NULL,
 source_revision INTEGER NOT NULL,
 due_at INTEGER NOT NULL,
 title TEXT NOT NULL,
 body TEXT,
 target_url TEXT NOT NULL,
 dedupe_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivered','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at INTEGER,
 last_error TEXT,
 browser_delivered_at INTEGER,
 read_at INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX notification_recipient_due_idx ON notification(recipient_membership_id,state,due_at);

INSERT INTO access_grant(profile_id,permission) VALUES
('standard-member','appointment.create'),('standard-member','appointment.update'),('standard-member','appointment.cancel'),
('standard-member','task.create'),('standard-member','task.update'),('standard-member','task.complete'),('standard-member','task.reopen'),('standard-member','task.assign'),
('standard-member','ticket.create'),('standard-member','ticket.update'),('standard-member','ticket.respond'),('standard-member','ticket.resolve'),('standard-member','ticket.reopen'),('standard-member','ticket.assign');

CREATE TRIGGER task_record_validate_insert BEFORE INSERT ON task_record WHEN NOT EXISTS(SELECT 1 FROM activity WHERE id=NEW.activity_id AND type='task') BEGIN SELECT RAISE(ABORT,'task_activity_invalid'); END;
CREATE TRIGGER task_assignee_insert BEFORE INSERT ON task_record WHEN NEW.assignee_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.assignee_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'task_assignee_inactive'); END;
CREATE TRIGGER task_assignee_update BEFORE UPDATE OF assignee_membership_id ON task_record WHEN NEW.assignee_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.assignee_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'task_assignee_inactive'); END;
CREATE TRIGGER task_cycle_immutable_update BEFORE UPDATE ON task_cycle WHEN OLD.completed_at IS NOT NULL OR NEW.task_id IS NOT OLD.task_id OR NEW.cycle IS NOT OLD.cycle OR NEW.opened_at IS NOT OLD.opened_at OR NEW.opened_by IS NOT OLD.opened_by OR NEW.reopen_reason IS NOT OLD.reopen_reason BEGIN SELECT RAISE(ABORT,'task_history_immutable'); END;
CREATE TRIGGER task_deadline_update BEFORE UPDATE ON task_deadline_history BEGIN SELECT RAISE(ABORT,'task_history_immutable'); END;
CREATE TRIGGER task_operation_update BEFORE UPDATE ON task_operation BEGIN SELECT RAISE(ABORT,'task_history_immutable'); END;
CREATE TRIGGER appointment_member_insert BEFORE INSERT ON appointment WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.organizer_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'appointment_member_inactive'); END;
CREATE TRIGGER appointment_member_update BEFORE UPDATE OF organizer_membership_id ON appointment WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.organizer_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'appointment_member_inactive'); END;
CREATE TRIGGER appointment_participant_insert BEFORE INSERT ON appointment_participant WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'appointment_member_inactive'); END;
CREATE TRIGGER appointment_operation_update BEFORE UPDATE ON appointment_operation BEGIN SELECT RAISE(ABORT,'appointment_history_immutable'); END;
CREATE TRIGGER appointment_operation_delete BEFORE DELETE ON appointment_operation BEGIN SELECT RAISE(ABORT,'appointment_history_immutable'); END;
CREATE TRIGGER ticket_assignee_insert BEFORE INSERT ON ticket WHEN NEW.assignee_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.assignee_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'ticket_member_inactive'); END;
CREATE TRIGGER ticket_assignee_update BEFORE UPDATE OF assignee_membership_id ON ticket WHEN NEW.assignee_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.assignee_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'ticket_member_inactive'); END;
CREATE TRIGGER ticket_collaborator_insert BEFORE INSERT ON ticket_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'ticket_member_inactive'); END;
CREATE TRIGGER ticket_cycle_immutable_update BEFORE UPDATE ON ticket_cycle WHEN OLD.resolved_at IS NOT NULL OR NEW.ticket_id IS NOT OLD.ticket_id OR NEW.cycle IS NOT OLD.cycle OR NEW.opened_at IS NOT OLD.opened_at OR NEW.opened_by IS NOT OLD.opened_by OR NEW.reopen_reason IS NOT OLD.reopen_reason OR (OLD.first_response_at IS NOT NULL AND NEW.first_response_at IS NOT OLD.first_response_at) BEGIN SELECT RAISE(ABORT,'ticket_history_immutable'); END;
CREATE TRIGGER ticket_cycle_delete BEFORE DELETE ON ticket_cycle BEGIN SELECT RAISE(ABORT,'ticket_history_immutable'); END;
CREATE TRIGGER ticket_event_update BEFORE UPDATE ON ticket_event BEGIN SELECT RAISE(ABORT,'ticket_history_immutable'); END;
CREATE TRIGGER ticket_event_delete BEFORE DELETE ON ticket_event BEGIN SELECT RAISE(ABORT,'ticket_history_immutable'); END;
CREATE TRIGGER notification_preference_member AFTER INSERT ON singleton_membership WHEN NEW.status='active' BEGIN INSERT OR IGNORE INTO notification_preference(membership_id,updated_at) VALUES(NEW.user_id,unixepoch('subsec')*1000); END;
CREATE TRIGGER membership_requires_scheduling_cleanup BEFORE UPDATE OF status ON singleton_membership WHEN OLD.status='active' AND NEW.status='revoked' AND (EXISTS(SELECT 1 FROM task_record WHERE assignee_membership_id=OLD.user_id) OR EXISTS(SELECT 1 FROM appointment WHERE organizer_membership_id=OLD.user_id) OR EXISTS(SELECT 1 FROM appointment_participant WHERE membership_id=OLD.user_id) OR EXISTS(SELECT 1 FROM ticket WHERE assignee_membership_id=OLD.user_id) OR EXISTS(SELECT 1 FROM ticket_collaborator WHERE membership_id=OLD.user_id)) BEGIN SELECT RAISE(ABORT,'membership scheduling references require cleanup'); END;
DROP TRIGGER module_setting_entity_immutable;
DROP TRIGGER module_setting_preserve;
ALTER TABLE module_setting RENAME TO module_setting_before_b2b;
CREATE TABLE module_setting(
 entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN('company','contact','deal','lead','product','order','contract','review')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision>=0),
 updated_at INTEGER NOT NULL
);
INSERT INTO module_setting SELECT * FROM module_setting_before_b2b;
DROP TABLE module_setting_before_b2b;
INSERT INTO module_setting(entity,enabled,revision,updated_at) VALUES('contract',1,0,0),('review',1,0,0);
CREATE TRIGGER module_setting_entity_immutable BEFORE UPDATE OF entity ON module_setting WHEN NEW.entity!=OLD.entity BEGIN SELECT RAISE(ABORT,'module entity is immutable'); END;
CREATE TRIGGER module_setting_preserve BEFORE DELETE ON module_setting BEGIN SELECT RAISE(ABORT,'module settings must be retained'); END;

ALTER TABLE lead_mapping RENAME TO lead_mapping_before_auto_deal;
CREATE TABLE lead_mapping(
 id TEXT PRIMARY KEY NOT NULL CHECK(id='contact'), revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 mappings_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(mappings_json)), auto_order INTEGER NOT NULL DEFAULT 0 CHECK(auto_order IN(0,1)),
 auto_deal INTEGER NOT NULL DEFAULT 0 CHECK(auto_deal IN(0,1)), updated_at INTEGER NOT NULL
);
INSERT INTO lead_mapping SELECT * FROM lead_mapping_before_auto_deal;
DROP TABLE lead_mapping_before_auto_deal;

CREATE TABLE contract(
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, company_id TEXT NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
 contact_id TEXT REFERENCES contact(id) ON DELETE RESTRICT, deal_id TEXT REFERENCES deal(id) ON DELETE RESTRICT,
 order_id TEXT REFERENCES sales_order(id) ON DELETE RESTRICT,
 value_minor INTEGER CHECK(value_minor IS NULL OR value_minor>=0), currency TEXT NOT NULL CHECK(length(currency)=3),
 effective_at INTEGER, expires_at INTEGER, owner_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
 creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','completed','terminated','expired')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0), archived_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(expires_at IS NULL OR effective_at IS NULL OR expires_at>=effective_at)
);
CREATE INDEX contract_company_idx ON contract(company_id,status,expires_at);
CREATE INDEX contract_owner_idx ON contract(owner_membership_id,status,expires_at);
CREATE INDEX contract_deal_idx ON contract(deal_id);
CREATE INDEX contract_order_idx ON contract(order_id);
CREATE TABLE contract_party(
 contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE RESTRICT, party_id TEXT NOT NULL,
 company_id TEXT REFERENCES company(id) ON DELETE RESTRICT, contact_id TEXT REFERENCES contact(id) ON DELETE RESTRICT,
 role TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(contract_id,party_id),
 CHECK((company_id IS NOT NULL)+(contact_id IS NOT NULL)=1)
);
CREATE INDEX contract_party_company_idx ON contract_party(company_id,contract_id);
CREATE INDEX contract_party_contact_idx ON contract_party(contact_id,contract_id);
CREATE TABLE contract_version(
 contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE RESTRICT, version INTEGER NOT NULL CHECK(version>=0),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), reason TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT, created_at INTEGER NOT NULL,
 PRIMARY KEY(contract_id,version)
);
CREATE TABLE contract_operation(
 operation_key TEXT PRIMARY KEY NOT NULL, contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE RESTRICT,
 fingerprint TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)), actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 created_at INTEGER NOT NULL
);
CREATE TABLE contract_document(
 id TEXT PRIMARY KEY NOT NULL, contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE RESTRICT,
 object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>=0),
 status TEXT NOT NULL CHECK(status IN('pending','ready','failed','cleaning')), uploader_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 created_at INTEGER NOT NULL, ready_at INTEGER, cleanup_attempted_at INTEGER
);
CREATE INDEX contract_document_contract_idx ON contract_document(contract_id,status,created_at);

CREATE TABLE review(
 id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, event_id TEXT NOT NULL, company_id TEXT REFERENCES company(id) ON DELETE RESTRICT,
 contact_id TEXT REFERENCES contact(id) ON DELETE RESTRICT, content TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json)), creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 fingerprint TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0), archived_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(source,event_id), CHECK((company_id IS NOT NULL)+(contact_id IS NOT NULL)=1)
);
CREATE INDEX review_customer_idx ON review(company_id,contact_id,created_at);
CREATE INDEX review_rating_idx ON review(rating,created_at);

ALTER TABLE notification_preference ADD COLUMN contract_offset_minutes INTEGER NOT NULL DEFAULT 10080 CHECK(contract_offset_minutes BETWEEN 0 AND 525600);
ALTER TABLE notification RENAME TO notification_before_contract;
CREATE TABLE notification(
 id TEXT PRIMARY KEY NOT NULL, recipient_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('appointment','task','ticket','contract')), source_id TEXT NOT NULL, source_revision INTEGER NOT NULL,
 due_at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT, target_url TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivered','failed','cancelled')), attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at INTEGER, last_error TEXT, browser_delivered_at INTEGER, read_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO notification SELECT * FROM notification_before_contract;
DROP TABLE notification_before_contract;
CREATE INDEX notification_recipient_due_idx ON notification(recipient_membership_id,state,due_at);

INSERT INTO access_grant(profile_id,permission) VALUES
('standard-member','contract.create'),('standard-member','contract.update'),('standard-member','contract.archive'),('standard-member','contract.restore'),('standard-member','contract.assign'),('standard-member','contract.document'),
('standard-member','review.create'),('standard-member','review.update'),('standard-member','review.archive'),('standard-member','review.restore');

CREATE TRIGGER contract_relations_insert BEFORE INSERT ON contract WHEN NOT EXISTS(SELECT 1 FROM company c WHERE c.id=NEW.company_id AND c.archived_at IS NULL) OR NOT EXISTS(SELECT 1 FROM singleton_membership m WHERE m.user_id=NEW.owner_membership_id AND m.status='active') OR (NEW.contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contact c WHERE c.id=NEW.contact_id AND c.archived_at IS NULL AND c.company_id=NEW.company_id)) OR (NEW.deal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM deal d WHERE d.id=NEW.deal_id AND d.company_id=NEW.company_id)) OR (NEW.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_order o WHERE o.id=NEW.order_id AND (o.company_id IS NULL OR o.company_id=NEW.company_id))) BEGIN SELECT RAISE(ABORT,'contract_relations_invalid'); END;
CREATE TRIGGER contract_relations_update BEFORE UPDATE OF company_id,contact_id,deal_id,order_id,owner_membership_id ON contract WHEN NOT EXISTS(SELECT 1 FROM company c WHERE c.id=NEW.company_id AND c.archived_at IS NULL) OR NOT EXISTS(SELECT 1 FROM singleton_membership m WHERE m.user_id=NEW.owner_membership_id AND m.status='active') OR (NEW.contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contact c WHERE c.id=NEW.contact_id AND c.archived_at IS NULL AND c.company_id=NEW.company_id)) OR (NEW.deal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM deal d WHERE d.id=NEW.deal_id AND d.company_id=NEW.company_id)) OR (NEW.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_order o WHERE o.id=NEW.order_id AND (o.company_id IS NULL OR o.company_id=NEW.company_id))) BEGIN SELECT RAISE(ABORT,'contract_relations_invalid'); END;
CREATE TRIGGER contract_party_insert BEFORE INSERT ON contract_party WHEN (NEW.company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company WHERE id=NEW.company_id AND archived_at IS NULL)) OR (NEW.contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contact WHERE id=NEW.contact_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT,'contract_party_invalid'); END;
CREATE TRIGGER contract_version_update BEFORE UPDATE ON contract_version BEGIN SELECT RAISE(ABORT,'contract_history_immutable'); END;
CREATE TRIGGER contract_version_delete BEFORE DELETE ON contract_version BEGIN SELECT RAISE(ABORT,'contract_history_immutable'); END;
CREATE TRIGGER contract_operation_update BEFORE UPDATE ON contract_operation BEGIN SELECT RAISE(ABORT,'contract_history_immutable'); END;
CREATE TRIGGER contract_operation_delete BEFORE DELETE ON contract_operation BEGIN SELECT RAISE(ABORT,'contract_history_immutable'); END;
CREATE TRIGGER membership_requires_contract_cleanup BEFORE UPDATE OF status ON singleton_membership WHEN OLD.status='active' AND NEW.status='revoked' AND EXISTS(SELECT 1 FROM contract WHERE owner_membership_id=OLD.user_id) BEGIN SELECT RAISE(ABORT,'membership contract references require cleanup'); END;
-- Add report access and indexes without rewriting retained business events.
INSERT OR IGNORE INTO access_grant(profile_id, permission) VALUES ('standard-member', 'report.view');
ALTER TABLE contact ADD COLUMN birth_date TEXT CHECK(birth_date IS NULL OR birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
ALTER TABLE contact ADD COLUMN gender TEXT CHECK(gender IS NULL OR gender IN ('female','male','nonbinary','other','undisclosed'));
CREATE TABLE reporting_goal(
 id TEXT PRIMARY KEY NOT NULL,
 scope_kind TEXT NOT NULL CHECK(scope_kind IN('workspace','member','branch')),
 scope_id TEXT NOT NULL DEFAULT '',
 period_from TEXT NOT NULL,
 period_to TEXT NOT NULL,
 currency TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>=0),
 creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 updated_at INTEGER NOT NULL,
 UNIQUE(scope_kind,scope_id,period_from,period_to,currency),
 CHECK(period_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND period_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND period_from<=period_to),
 CHECK((scope_kind='workspace' AND scope_id='') OR (scope_kind!='workspace' AND length(scope_id)>0))
);
CREATE INDEX reporting_goal_period_idx ON reporting_goal(period_from,period_to,scope_kind,scope_id);
CREATE INDEX IF NOT EXISTS sales_order_completed_report_idx ON sales_order(completed_date, owner_membership_id, currency);
CREATE INDEX IF NOT EXISTS order_operation_report_idx ON order_operation(business_date, action, order_id);
CREATE INDEX IF NOT EXISTS order_payment_report_idx ON order_payment(business_date, kind, order_id);
CREATE INDEX IF NOT EXISTS lead_created_report_idx ON lead(created_at, owner_membership_id);
CREATE INDEX IF NOT EXISTS lead_conversion_report_idx ON lead_conversion(completed_at, lead_id);
CREATE INDEX IF NOT EXISTS task_cycle_report_idx ON task_cycle(completed_at, due_at, task_id);
CREATE INDEX IF NOT EXISTS ticket_cycle_report_idx ON ticket_cycle(resolved_at, due_at, ticket_id);
ALTER TABLE notification RENAME TO notification_before_automation;
CREATE TABLE notification(
 id TEXT PRIMARY KEY NOT NULL, recipient_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('appointment','task','ticket','contract','automation')), source_id TEXT NOT NULL, source_revision INTEGER NOT NULL,
 due_at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT, target_url TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivered','failed','cancelled')), attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at INTEGER, last_error TEXT, browser_delivered_at INTEGER, read_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO notification SELECT * FROM notification_before_automation;
DROP TABLE notification_before_automation;
CREATE INDEX notification_recipient_due_idx ON notification(recipient_membership_id,state,due_at);

CREATE TABLE webform_config (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('lead','ticket')),
  mode TEXT NOT NULL CHECK (mode IN ('public','signed_system')),
  token_hash TEXT,
  source TEXT NOT NULL,
  authority_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  mapping_json TEXT NOT NULL CHECK (json_valid(mapping_json) AND json_type(mapping_json)='object'),
  allow_missing_required INTEGER NOT NULL DEFAULT 0 CHECK (allow_missing_required IN (0,1)),
  rate_limit_hour INTEGER NOT NULL DEFAULT 60 CHECK (rate_limit_hour BETWEEN 1 AND 10000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((mode='public' AND token_hash IS NULL AND allow_missing_required=0) OR (mode='signed_system' AND token_hash IS NOT NULL))
);
CREATE INDEX webform_authority_idx ON webform_config(authority_membership_id,active);

CREATE TABLE webform_submission (
  id TEXT PRIMARY KEY NOT NULL,
  form_id TEXT NOT NULL REFERENCES webform_config(id) ON DELETE RESTRICT,
  submission_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  record_id TEXT NOT NULL,
  missing_fields_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_fields_json) AND json_type(missing_fields_json)='array'),
  created_at INTEGER NOT NULL,
  UNIQUE(form_id,submission_key)
);
CREATE INDEX webform_submission_form_created_idx ON webform_submission(form_id,created_at);

CREATE TABLE webform_rate_bucket (
  form_id TEXT NOT NULL REFERENCES webform_config(id) ON DELETE CASCADE,
  bucket INTEGER NOT NULL,
  client_hash TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 10000),
  PRIMARY KEY(form_id,bucket,client_hash)
);

CREATE TABLE integration_app (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  grants_json TEXT NOT NULL CHECK (json_valid(grants_json) AND json_type(grants_json)='array'),
  authority_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE integration_event (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT REFERENCES integration_app(id) ON DELETE RESTRICT,
  endpoint_id TEXT REFERENCES webhook_endpoint(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  event_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json)='object'),
  state TEXT NOT NULL CHECK (state IN ('received','pending','delivering','delivered','failed','superseded')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  occurred_at INTEGER NOT NULL,
  next_attempt_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(app_id,direction,external_id),
  UNIQUE(endpoint_id,direction,external_id),
  CHECK ((direction='inbound' AND app_id IS NOT NULL AND endpoint_id IS NULL) OR (direction='outbound' AND app_id IS NULL AND endpoint_id IS NOT NULL))
);
CREATE INDEX integration_event_retry_idx ON integration_event(direction,state,next_attempt_at);

CREATE TABLE integration_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json)='object'),
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 5),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','dispatching','failed','delivered')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  next_attempt_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX integration_outbox_dispatch_idx ON integration_outbox(state,next_attempt_at);

CREATE TABLE webhook_endpoint (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  events_json TEXT NOT NULL CHECK (json_valid(events_json) AND json_type(events_json)='array'),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE email_template (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  required_variables_json TEXT NOT NULL CHECK (json_valid(required_variables_json) AND json_type(required_variables_json)='array'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE automation_rule (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  condition_json TEXT NOT NULL CHECK (json_valid(condition_json) AND json_type(condition_json)='object'),
  action_json TEXT NOT NULL CHECK (json_valid(action_json) AND json_type(action_json)='object'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  authority_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  max_depth INTEGER NOT NULL DEFAULT 3 CHECK (max_depth BETWEEN 1 AND 5),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE automation_run (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL REFERENCES automation_rule(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth BETWEEN 0 AND 5),
  status TEXT NOT NULL CHECK (status IN ('processing','completed','skipped','failed')),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(rule_id,event_id)
);

CREATE TABLE customer_segment (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('lead','contact','company','deal')),
  kind TEXT NOT NULL CHECK (kind IN ('static','dynamic')),
  filter_json TEXT NOT NULL CHECK (json_valid(filter_json) AND json_type(filter_json)='object'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE customer_segment_member (
  segment_id TEXT NOT NULL REFERENCES customer_segment(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY(segment_id,record_id)
);

CREATE TABLE ai_setting (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='settings'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  provider TEXT,
  monthly_budget_minor INTEGER NOT NULL DEFAULT 0 CHECK (monthly_budget_minor >= 0),
  used_minor INTEGER NOT NULL DEFAULT 0 CHECK (used_minor >= 0 AND used_minor <= monthly_budget_minor),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO ai_setting(id,enabled,provider,monthly_budget_minor,used_minor,revision) VALUES('settings',0,NULL,0,0,0);

CREATE TABLE workspace_profile (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='workspace'),
  name TEXT NOT NULL,
  logo_object_key TEXT,
  logo_file_name TEXT,
  logo_content_type TEXT,
  logo_size INTEGER CHECK (logo_size IS NULL OR logo_size BETWEEN 1 AND 2097152),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at INTEGER NOT NULL
);
INSERT INTO workspace_profile(id,name,revision,updated_at) VALUES('workspace','CRM Workspace',0,unixepoch('subsec')*1000);

CREATE TABLE workspace_deletion_request (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='workspace'),
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  execute_after INTEGER NOT NULL,
  quiesce_until INTEGER,
  status TEXT NOT NULL CHECK (status IN ('scheduled','cancelled','executing','deleted')),
  cancelled_at INTEGER,
  CHECK (execute_after >= requested_at + 2592000000),
  CHECK (quiesce_until IS NULL OR quiesce_until >= execute_after)
);

CREATE TABLE workspace_deletion_object (
  object_key TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','failed','deleted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE configuration_copy_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  keys_json TEXT NOT NULL CHECK (json_valid(keys_json) AND json_type(keys_json)='array'),
  preview_json TEXT NOT NULL CHECK (json_valid(preview_json) AND json_type(preview_json)='object'),
  applied INTEGER NOT NULL CHECK (applied IN (0,1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE workspace_deletion_guard (id TEXT PRIMARY KEY NOT NULL CHECK(id='workspace'));

CREATE TRIGGER workspace_deletion_block_file_insert BEFORE INSERT ON crm_file WHEN EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;
CREATE TRIGGER workspace_deletion_block_file_ready BEFORE UPDATE OF status ON crm_file WHEN NEW.status='ready' AND EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;
CREATE TRIGGER workspace_deletion_block_document_insert BEFORE INSERT ON contract_document WHEN EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;
CREATE TRIGGER workspace_deletion_block_document_ready BEFORE UPDATE OF status ON contract_document WHEN NEW.status='ready' AND EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;
CREATE TRIGGER workspace_deletion_block_logo BEFORE UPDATE OF logo_object_key ON workspace_profile WHEN NEW.logo_object_key IS NOT OLD.logo_object_key AND EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;

CREATE TRIGGER integration_lead_created AFTER INSERT ON lead BEGIN INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at) VALUES(lower(hex(randomblob(16))),'lead.created',NEW.id,'lead.created:'||NEW.id,json_object('leadId',NEW.id,'source',NEW.source_id),'pending',0,NEW.created_at,NEW.created_at,NEW.created_at); END;
CREATE TRIGGER integration_lead_status AFTER UPDATE OF status_id ON lead WHEN NEW.status_id IS NOT OLD.status_id BEGIN INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at) VALUES(lower(hex(randomblob(16))),'lead.status.changed',NEW.id,'lead.status.changed:'||NEW.id||':'||NEW.revision,json_object('leadId',NEW.id,'status',NEW.status_id),'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at); END;
CREATE TRIGGER integration_ticket_created AFTER INSERT ON ticket BEGIN INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at) VALUES(lower(hex(randomblob(16))),'ticket.created',NEW.id,'ticket.created:'||NEW.id,json_object('ticketId',NEW.id,'source',NEW.source),'pending',0,NEW.created_at,NEW.created_at,NEW.created_at); END;
CREATE TRIGGER integration_ticket_status AFTER UPDATE OF status ON ticket WHEN NEW.status IS NOT OLD.status BEGIN INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at) VALUES(lower(hex(randomblob(16))),'ticket.status.changed',NEW.id,'ticket.status.changed:'||NEW.id||':'||NEW.revision,json_object('ticketId',NEW.id,'status',NEW.status),'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at); END;
DROP TRIGGER membership_keep_last_owner_on_delete;
CREATE TRIGGER membership_keep_last_owner_on_delete BEFORE DELETE ON singleton_membership WHEN OLD.role='owner' AND OLD.status='active' AND EXISTS(SELECT 1 FROM singleton_workspace) AND NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT (CASE WHEN (SELECT count(*) FROM singleton_membership WHERE role='owner' AND status='active')<=1 THEN RAISE(ABORT,'last owner protected') END); END;
DROP TRIGGER module_setting_preserve;
CREATE TRIGGER module_setting_preserve BEFORE DELETE ON module_setting WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'module settings must be retained'); END;
DROP TRIGGER record_layout_delete;
CREATE TRIGGER record_layout_delete BEFORE DELETE ON record_layout WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'layout_delete_forbidden'); END;
DROP TRIGGER deal_stage_keep_history;
CREATE TRIGGER deal_stage_keep_history BEFORE DELETE ON deal_stage WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'deal_stage_delete_forbidden'); END;
DROP TRIGGER lead_source_preserve;
CREATE TRIGGER lead_source_preserve BEFORE DELETE ON lead_source WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;
DROP TRIGGER lead_status_preserve;
CREATE TRIGGER lead_status_preserve BEFORE DELETE ON lead_status WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;
DROP TRIGGER crm_file_preserve_key;
CREATE TRIGGER crm_file_preserve_key BEFORE DELETE ON crm_file WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'file_key_retained'); END;
DROP TRIGGER lead_conversion_delete;
CREATE TRIGGER lead_conversion_delete BEFORE DELETE ON lead_conversion WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;
DROP TRIGGER product_category_delete;
CREATE TRIGGER product_category_delete BEFORE DELETE ON product_category WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
DROP TRIGGER product_delete;
CREATE TRIGGER product_delete BEFORE DELETE ON product WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
DROP TRIGGER product_variant_delete;
CREATE TRIGGER product_variant_delete BEFORE DELETE ON product_variant WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
DROP TRIGGER order_operation_immutable_delete;
CREATE TRIGGER order_operation_immutable_delete BEFORE DELETE ON order_operation WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER order_payment_immutable_delete;
CREATE TRIGGER order_payment_immutable_delete BEFORE DELETE ON order_payment WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER order_adjustment_immutable_delete;
CREATE TRIGGER order_adjustment_immutable_delete BEFORE DELETE ON order_adjustment WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER inventory_movement_immutable_delete;
CREATE TRIGGER inventory_movement_immutable_delete BEFORE DELETE ON inventory_movement WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER entitlement_movement_immutable_delete;
CREATE TRIGGER entitlement_movement_immutable_delete BEFORE DELETE ON entitlement_movement WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER sales_order_delete;
CREATE TRIGGER sales_order_delete BEFORE DELETE ON sales_order WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER entitlement_delete;
CREATE TRIGGER entitlement_delete BEFORE DELETE ON service_entitlement WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER appointment_operation_delete;
CREATE TRIGGER appointment_operation_delete BEFORE DELETE ON appointment_operation WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'appointment_history_immutable'); END;
DROP TRIGGER ticket_cycle_delete;
CREATE TRIGGER ticket_cycle_delete BEFORE DELETE ON ticket_cycle WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'ticket_history_immutable'); END;
DROP TRIGGER ticket_event_delete;
CREATE TRIGGER ticket_event_delete BEFORE DELETE ON ticket_event WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'ticket_history_immutable'); END;
DROP TRIGGER contract_version_delete;
CREATE TRIGGER contract_version_delete BEFORE DELETE ON contract_version WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'contract_history_immutable'); END;
DROP TRIGGER contract_operation_delete;
CREATE TRIGGER contract_operation_delete BEFORE DELETE ON contract_operation WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'contract_history_immutable'); END;
ALTER TABLE integration_app ADD COLUMN token_hint TEXT
  CHECK (token_hint IS NULL OR (length(token_hint) = 4 AND token_hint NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE integration_app ADD COLUMN last_used_at INTEGER;

CREATE TABLE integration_app_audit (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL REFERENCES integration_app(id) ON DELETE RESTRICT,
  actor_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('created','rotated','revoked')),
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome = 'success'),
  created_at INTEGER NOT NULL
);
CREATE INDEX integration_app_audit_app_created_idx
  ON integration_app_audit(app_id, created_at);
CREATE TABLE scheduled_due_fence (
  outbox_id TEXT PRIMARY KEY NOT NULL REFERENCES integration_outbox(id) ON DELETE CASCADE,
  fenced_at INTEGER NOT NULL
);
CREATE INDEX integration_outbox_subject_state_idx ON integration_outbox(event_type,subject_id,state);

CREATE TRIGGER integration_task_due_insert AFTER INSERT ON task_record
WHEN NEW.completed_at IS NULL AND NEW.due_at IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
  VALUES(lower(hex(randomblob(16))),'task.due',NEW.activity_id,'task.due:'||NEW.activity_id||':'||NEW.due_at,json_object('taskId',NEW.activity_id),'pending',0,NEW.due_at,NEW.created_at,NEW.updated_at);
END;

CREATE TRIGGER integration_task_due_update AFTER UPDATE OF due_at,completed_at ON task_record
BEGIN
  DELETE FROM integration_outbox WHERE event_type='task.due' AND subject_id=NEW.activity_id AND state IN ('pending','failed','dispatching') AND NOT EXISTS(SELECT 1 FROM scheduled_due_fence WHERE outbox_id=integration_outbox.id) AND (NEW.completed_at IS NOT NULL OR NEW.due_at IS NULL OR external_id!='task.due:'||NEW.activity_id||':'||NEW.due_at);
  INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),'task.due',NEW.activity_id,'task.due:'||NEW.activity_id||':'||NEW.due_at,json_object('taskId',NEW.activity_id),'pending',0,NEW.due_at,NEW.updated_at,NEW.updated_at
  WHERE NEW.completed_at IS NULL AND NEW.due_at IS NOT NULL;
END;

CREATE TRIGGER integration_ticket_due_insert AFTER INSERT ON ticket
WHEN NEW.status='open' AND NEW.due_at IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
  VALUES(lower(hex(randomblob(16))),'ticket.due',NEW.id,'ticket.due:'||NEW.id||':'||NEW.due_at,json_object('ticketId',NEW.id),'pending',0,NEW.due_at,NEW.created_at,NEW.updated_at);
END;

CREATE TRIGGER integration_ticket_due_update AFTER UPDATE OF due_at,status ON ticket
BEGIN
  DELETE FROM integration_outbox WHERE event_type='ticket.due' AND subject_id=NEW.id AND state IN ('pending','failed','dispatching') AND NOT EXISTS(SELECT 1 FROM scheduled_due_fence WHERE outbox_id=integration_outbox.id) AND (NEW.status!='open' OR NEW.due_at IS NULL OR external_id!='ticket.due:'||NEW.id||':'||NEW.due_at);
  INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),'ticket.due',NEW.id,'ticket.due:'||NEW.id||':'||NEW.due_at,json_object('ticketId',NEW.id),'pending',0,NEW.due_at,NEW.updated_at,NEW.updated_at
  WHERE NEW.status='open' AND NEW.due_at IS NOT NULL;
END;

CREATE TRIGGER integration_appointment_due_insert AFTER INSERT ON appointment
WHEN NEW.status='scheduled'
BEGIN
  INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
  VALUES(lower(hex(randomblob(16))),'appointment.due',NEW.id,'appointment.due:'||NEW.id||':'||NEW.starts_at,json_object('appointmentId',NEW.id),'pending',0,NEW.starts_at,NEW.created_at,NEW.updated_at);
END;

CREATE TRIGGER integration_appointment_due_update AFTER UPDATE OF starts_at,status ON appointment
BEGIN
  DELETE FROM integration_outbox WHERE event_type='appointment.due' AND subject_id=NEW.id AND state IN ('pending','failed','dispatching') AND NOT EXISTS(SELECT 1 FROM scheduled_due_fence WHERE outbox_id=integration_outbox.id) AND (NEW.status!='scheduled' OR external_id!='appointment.due:'||NEW.id||':'||NEW.starts_at);
  INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),'appointment.due',NEW.id,'appointment.due:'||NEW.id||':'||NEW.starts_at,json_object('appointmentId',NEW.id),'pending',0,NEW.starts_at,NEW.updated_at,NEW.updated_at
  WHERE NEW.status='scheduled';
END;

CREATE TRIGGER integration_contract_due_insert AFTER INSERT ON contract
WHEN NEW.status='active' AND NEW.expires_at IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
  VALUES(lower(hex(randomblob(16))),'contract.due',NEW.id,'contract.due:'||NEW.id||':'||NEW.expires_at,json_object('contractId',NEW.id),'pending',0,NEW.expires_at,NEW.created_at,NEW.updated_at);
END;

CREATE TRIGGER integration_contract_due_update AFTER UPDATE OF expires_at,status ON contract
BEGIN
  DELETE FROM integration_outbox WHERE event_type='contract.due' AND subject_id=NEW.id AND state IN ('pending','failed','dispatching') AND NOT EXISTS(SELECT 1 FROM scheduled_due_fence WHERE outbox_id=integration_outbox.id) AND (NEW.status!='active' OR NEW.expires_at IS NULL OR external_id!='contract.due:'||NEW.id||':'||NEW.expires_at);
  INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),'contract.due',NEW.id,'contract.due:'||NEW.id||':'||NEW.expires_at,json_object('contractId',NEW.id),'pending',0,NEW.expires_at,NEW.updated_at,NEW.updated_at
  WHERE NEW.status='active' AND NEW.expires_at IS NOT NULL;
END;

INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
SELECT lower(hex(randomblob(16))),'task.due',activity_id,'task.due:'||activity_id||':'||due_at,json_object('taskId',activity_id),'pending',0,due_at,created_at,updated_at FROM task_record WHERE completed_at IS NULL AND due_at IS NOT NULL;
INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
SELECT lower(hex(randomblob(16))),'ticket.due',id,'ticket.due:'||id||':'||due_at,json_object('ticketId',id),'pending',0,due_at,created_at,updated_at FROM ticket WHERE status='open' AND due_at IS NOT NULL;
INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
SELECT lower(hex(randomblob(16))),'appointment.due',id,'appointment.due:'||id||':'||starts_at,json_object('appointmentId',id),'pending',0,starts_at,created_at,updated_at FROM appointment WHERE status='scheduled';
INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at)
SELECT lower(hex(randomblob(16))),'contract.due',id,'contract.due:'||id||':'||expires_at,json_object('contractId',id),'pending',0,expires_at,created_at,updated_at FROM contract WHERE status='active' AND expires_at IS NOT NULL;

-- Legacy compatibility (from 0004_runtime_compat.sql), made idempotent for single-shot v1 migration
CREATE TABLE IF NOT EXISTS `user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `email_verified` integer DEFAULT false NOT NULL,
  `image` text,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);

CREATE TABLE IF NOT EXISTS `session` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `session_token_unique` ON `session` (`token`);
CREATE INDEX IF NOT EXISTS `session_user_id_idx` ON `session` (`user_id`);

CREATE TABLE IF NOT EXISTS `account` (
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
CREATE INDEX IF NOT EXISTS `account_user_id_idx` ON `account` (`user_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `account_issuer_account_id_unique` ON `account` (`issuer`, `account_id`);

CREATE TABLE IF NOT EXISTS `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS `verification_identifier_idx` ON `verification` (`identifier`);

CREATE TABLE IF NOT EXISTS `rate_limit` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL,
  `count` integer NOT NULL,
  `last_request` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `rate_limit_key_unique` ON `rate_limit` (`key`);

CREATE TABLE IF NOT EXISTS `singleton_workspace` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `owner_user_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);

CREATE TABLE IF NOT EXISTS `singleton_membership` (
  `user_id` text PRIMARY KEY NOT NULL,
  `role` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `singleton_membership_role_check` CHECK (`role` in ('owner', 'member')),
  CONSTRAINT `singleton_membership_status_check` CHECK (`status` in ('active', 'revoked'))
);
CREATE INDEX IF NOT EXISTS `singleton_membership_status_idx` ON `singleton_membership` (`status`);

CREATE TABLE IF NOT EXISTS `company` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `created_at` integer NOT NULL
);

INSERT OR IGNORE INTO `singleton_workspace` (`id`, `slug`, `created_at`, `updated_at`)
VALUES ('00000000-0000-4000-8000-000000000001', 'crm', unixepoch() * 1000, unixepoch() * 1000);
