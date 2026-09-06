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
