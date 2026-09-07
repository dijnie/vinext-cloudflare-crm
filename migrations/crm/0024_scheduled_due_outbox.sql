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
