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
  `user_id` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);

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
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);
CREATE UNIQUE INDEX `account_issuer_account_id_unique` ON `account` (`issuer`, `account_id`);

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
  `owner_user_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);

CREATE TABLE `singleton_membership` (
  `user_id` text PRIMARY KEY NOT NULL,
  `role` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `singleton_membership_role_check` CHECK (`role` in ('owner', 'member')),
  CONSTRAINT `singleton_membership_status_check` CHECK (`status` in ('active', 'revoked'))
);
CREATE INDEX `singleton_membership_status_idx` ON `singleton_membership` (`status`);

CREATE TABLE `company` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `created_at` integer NOT NULL
);

INSERT INTO `singleton_workspace` (`id`, `slug`, `created_at`, `updated_at`)
VALUES ('00000000-0000-4000-8000-000000000001', 'crm', unixepoch() * 1000, unixepoch() * 1000);
