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
