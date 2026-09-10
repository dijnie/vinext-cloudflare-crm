-- 1. Record layouts
INSERT OR IGNORE INTO `record_layout` (`entity`, `revision`, `fields_json`, `updated_at`) VALUES
('company', 0, 'null', 0),
('contact', 0, 'null', 0),
('deal', 0, 'null', 0),
('lead', 0, 'null', 0),
('product', 0, 'null', 0),
('order', 0, 'null', 0);

-- 2. Sequences
INSERT OR IGNORE INTO `order_sequence` (`id`, `next_number`) VALUES ('orders', 1);
INSERT OR IGNORE INTO `ticket_sequence` (`id`, `next_number`) VALUES ('tickets', 1);

-- 3. Access Profiles & Grants
INSERT OR IGNORE INTO `access_profile` (`id`, `name`, `created_at`, `updated_at`) VALUES
('standard-member', 'Standard member', 0, 0);

INSERT OR IGNORE INTO `access_grant` (`profile_id`, `permission`) VALUES
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
('standard-member', 'lead.create'),
('standard-member', 'lead.update'),
('standard-member', 'lead.archive'),
('standard-member', 'lead.restore'),
('standard-member', 'lead.assign'),
('standard-member', 'lead.convert'),
('standard-member', 'product.create'),
('standard-member', 'product.update'),
('standard-member', 'product.archive'),
('standard-member', 'product.restore'),
('standard-member', 'product.assign'),
('standard-member', 'order.create'),
('standard-member', 'order.update'),
('standard-member', 'order.archive'),
('standard-member', 'order.restore'),
('standard-member', 'order.assign'),
('standard-member', 'order.confirm'),
('standard-member', 'order.complete'),
('standard-member', 'order.cancel'),
('standard-member', 'activity.create'),
('standard-member', 'activity.update'),
('standard-member', 'field.configure'),
('standard-member', 'view.create'),
('standard-member', 'view.update'),
('standard-member', 'view.delete');

-- 4. Branch & Branch Settings
INSERT OR IGNORE INTO `branch` (`id`, `name`, `archived_at`, `created_at`, `updated_at`) VALUES
('default-branch', 'Chi nhánh mặc định', NULL, 0, 0);

INSERT OR IGNORE INTO `branch_setting` (`id`, `default_branch_id`) VALUES
('settings', 'default-branch');

-- 5. Membership assignments
INSERT OR IGNORE INTO `membership_access` (`membership_id`, `profile_id`)
SELECT `user_id`, 'standard-member' FROM `singleton_membership`;

INSERT OR IGNORE INTO `member_branch` (`membership_id`, `branch_id`, `is_primary`)
SELECT `user_id`, 'default-branch', 1 FROM `singleton_membership`;

-- 6. Lead Mapping
INSERT OR IGNORE INTO `lead_mapping` (`id`, `mappings_json`, `auto_order`, `auto_deal`, `revision`, `updated_at`) VALUES
('contact', '[{"source":"builtin:firstName","target":"builtin:firstName"},{"source":"builtin:lastName","target":"builtin:lastName"},{"source":"builtin:email","target":"builtin:email"},{"source":"builtin:phone","target":"builtin:phone"},{"source":"builtin:title","target":"builtin:title"},{"source":"builtin:companyId","target":"builtin:companyId"},{"source":"builtin:ownerMembershipId","target":"builtin:ownerMembershipId"}]', 0, 0, 0, 0);

-- 7. AI & Workspace Profile
INSERT OR IGNORE INTO `ai_setting` (`id`, `enabled`, `provider`, `monthly_budget_minor`, `used_minor`, `revision`) VALUES
('settings', 0, NULL, 0, 0, 0);

INSERT OR IGNORE INTO `workspace_profile` (`id`, `name`, `revision`, `updated_at`) VALUES
('workspace', 'CRM Workspace', 0, 0);
