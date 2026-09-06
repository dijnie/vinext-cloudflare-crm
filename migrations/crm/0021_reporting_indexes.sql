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
