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
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id = NEW.author_user_id AND status = 'active')
    THEN RAISE(ABORT, 'author membership is inactive') END;
  SELECT CASE WHEN NEW.contact_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact WHERE id = NEW.contact_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END;
  SELECT CASE WHEN NEW.deal_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM deal WHERE id = NEW.deal_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END;
  SELECT CASE WHEN NEW.contact_id IS NOT NULL AND NEW.deal_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact JOIN deal ON contact.company_id = deal.company_id WHERE contact.id = NEW.contact_id AND deal.id = NEW.deal_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END;
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
