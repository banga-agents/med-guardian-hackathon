-- Med-Akasha Event and Audit Schema (PostgreSQL)
-- Version: 1.0.0
-- Date: 2026-03-01

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'completed', 'blocked', 'failed');
CREATE TYPE consent_status AS ENUM ('active', 'revoked', 'expired', 'pending');
CREATE TYPE anchor_status AS ENUM ('pending', 'anchored', 'failed');

CREATE TABLE IF NOT EXISTS cases (
  id BIGSERIAL PRIMARY KEY,
  case_uid TEXT NOT NULL UNIQUE,
  patient_ref TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT 'operator',
  status TEXT NOT NULL DEFAULT 'open',
  risk risk_level NOT NULL DEFAULT 'low',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id BIGSERIAL PRIMARY KEY,
  run_uid TEXT NOT NULL UNIQUE,
  case_id BIGINT REFERENCES cases(id) ON DELETE SET NULL,
  workflow_id TEXT NOT NULL,
  initiator_type TEXT NOT NULL,
  initiator_id TEXT,
  status run_status NOT NULL DEFAULT 'pending',
  risk risk_level NOT NULL DEFAULT 'low',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id BIGSERIAL PRIMARY KEY,
  workflow_run_id BIGINT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  status run_status NOT NULL,
  input_hash TEXT,
  output_hash TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workflow_run_id, step_index)
);

CREATE TABLE IF NOT EXISTS memory_entries (
  id BIGSERIAL PRIMARY KEY,
  memory_uid TEXT NOT NULL UNIQUE,
  case_id BIGINT REFERENCES cases(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consents (
  id BIGSERIAL PRIMARY KEY,
  consent_uid TEXT NOT NULL UNIQUE,
  case_id BIGINT REFERENCES cases(id) ON DELETE SET NULL,
  subject_id_hash TEXT NOT NULL,
  scope_hash TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  status consent_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason_hash TEXT,
  chain_tx_hash TEXT,
  chain_network TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_uid TEXT NOT NULL UNIQUE,
  ts_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  case_id BIGINT REFERENCES cases(id) ON DELETE SET NULL,
  workflow_run_id BIGINT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_name TEXT NOT NULL,
  risk risk_level NOT NULL DEFAULT 'low',
  decision TEXT NOT NULL,
  input_hash TEXT,
  output_hash TEXT,
  rule_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash TEXT,
  event_hash TEXT NOT NULL,
  anchor_state anchor_status NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS audit_anchors (
  id BIGSERIAL PRIMARY KEY,
  anchor_uid TEXT NOT NULL UNIQUE,
  batch_id TEXT NOT NULL UNIQUE,
  event_count INTEGER NOT NULL CHECK (event_count > 0),
  merkle_root TEXT NOT NULL,
  uri_hash TEXT NOT NULL,
  chain_network TEXT NOT NULL,
  tx_hash TEXT,
  status anchor_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anchored_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS chain_transactions (
  id BIGSERIAL PRIMARY KEY,
  tx_uid TEXT NOT NULL UNIQUE,
  tx_hash TEXT NOT NULL UNIQUE,
  chain_network TEXT NOT NULL,
  contract_address TEXT,
  function_name TEXT,
  status TEXT NOT NULL,
  request_hash TEXT,
  response_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id BIGSERIAL PRIMARY KEY,
  message_uid TEXT NOT NULL UNIQUE,
  case_id BIGINT REFERENCES cases(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  recipient_ref TEXT NOT NULL,
  subject TEXT,
  body_hash TEXT NOT NULL,
  approval_event_uid TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cases_patient_ref ON cases(patient_ref);
CREATE INDEX IF NOT EXISTS idx_cases_risk_status ON cases(risk, status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_case_id ON workflow_runs(case_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_memory_entries_case_id ON memory_entries(case_id);
CREATE INDEX IF NOT EXISTS idx_memory_entries_category ON memory_entries(category);
CREATE INDEX IF NOT EXISTS idx_consents_case_id ON consents(case_id);
CREATE INDEX IF NOT EXISTS idx_consents_subject_scope ON consents(subject_id_hash, scope_hash);
CREATE INDEX IF NOT EXISTS idx_consents_status_expiry ON consents(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON audit_events(ts_utc);
CREATE INDEX IF NOT EXISTS idx_audit_events_case ON audit_events(case_id, ts_utc DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_anchor_state ON audit_events(anchor_state, id);
CREATE INDEX IF NOT EXISTS idx_audit_anchors_status ON audit_anchors(status, created_at);
CREATE INDEX IF NOT EXISTS idx_chain_transactions_hash ON chain_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_case ON outbound_messages(case_id, created_at DESC);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
BEFORE UPDATE ON cases
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_consents_updated_at ON consents;
CREATE TRIGGER trg_consents_updated_at
BEFORE UPDATE ON consents
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION block_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; updates/deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_audit_event_update ON audit_events;
CREATE TRIGGER trg_block_audit_event_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION block_audit_event_mutation();

DROP TRIGGER IF EXISTS trg_block_audit_event_delete ON audit_events;
CREATE TRIGGER trg_block_audit_event_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION block_audit_event_mutation();

COMMIT;
