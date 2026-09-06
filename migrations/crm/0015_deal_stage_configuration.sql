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
