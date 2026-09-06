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
