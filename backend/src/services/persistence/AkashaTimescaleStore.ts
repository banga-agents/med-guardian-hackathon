import { Pool } from 'pg';
import type { AuditEventRecord } from '../agent/kernel/types';
import type {
  AuditAnchorRecord,
  MemoryRecord,
  SymptomEventRecord,
} from '../akasha/AkashaSymptomService';
import type { PatientId } from '../../types/simulation';
import { SensitiveFieldCipher } from './SensitiveFieldCipher';

const STORE_BOOT_LIMIT = 12000;

function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

type PersistedSnapshot = {
  symptomEvents: SymptomEventRecord[];
  memoryRecords: MemoryRecord[];
  auditEvents: AuditEventRecord[];
  anchors: AuditAnchorRecord[];
};

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export class AkashaTimescaleStore {
  private readonly pool: Pool | null;
  private readonly enabled: boolean;
  private readonly cipher: SensitiveFieldCipher | null;
  private initPromise: Promise<void> | null = null;
  private schemaReady = false;
  private lastError: string | null = null;

  constructor() {
    const databaseUrl =
      process.env.TIMESCALE_DATABASE_URL
      || process.env.TIMESCALE_URL
      || process.env.DATABASE_URL;
    const encryptionKey = process.env.MEMORY_ENCRYPTION_KEY;

    if (!databaseUrl) {
      this.pool = null;
      this.enabled = false;
      this.cipher = null;
      return;
    }

    if (!encryptionKey?.trim()) {
      console.warn(
        '⚠️ TIMESCALE_DATABASE_URL is configured but MEMORY_ENCRYPTION_KEY is missing. ' +
        'Disabling persistent memory writes to avoid plaintext PHI storage.'
      );
      this.pool = null;
      this.enabled = false;
      this.cipher = null;
      return;
    }

    const sslEnabled = parseBooleanEnv(process.env.TIMESCALE_SSL, false);
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.TIMESCALE_POOL_MAX || 8),
    });
    this.enabled = true;
    this.cipher = new SensitiveFieldCipher(encryptionKey);
  }

  isEnabled(): boolean {
    return this.enabled && Boolean(this.pool) && Boolean(this.cipher);
  }

  async init(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initializeSchema().catch((error: any) => {
      this.schemaReady = false;
      this.lastError = error?.message || String(error);
      throw error;
    });
    await this.initPromise;
  }

  private async initializeSchema(): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mg_symptom_events (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        reported_at TIMESTAMPTZ NOT NULL,
        symptom_code TEXT NOT NULL,
        severity_0_10 SMALLINT NOT NULL,
        duration TEXT NOT NULL,
        triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
        associated_symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
        confidence DOUBLE PRECISION NOT NULL,
        source TEXT NOT NULL,
        note_enc TEXT,
        tenant_id TEXT NOT NULL,
        clinic_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mg_symptom_events_patient_time
      ON mg_symptom_events (patient_id, reported_at DESC);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mg_memory_records (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        category TEXT NOT NULL,
        content_enc TEXT NOT NULL,
        provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
        tenant_id TEXT NOT NULL,
        clinic_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mg_memory_patient_time
      ON mg_memory_records (patient_id, created_at DESC);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mg_audit_events (
        event_uid TEXT PRIMARY KEY,
        ts_utc TIMESTAMPTZ NOT NULL,
        prev_hash TEXT,
        event_hash TEXT NOT NULL,
        anchor_state TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        case_id TEXT,
        workflow_run_id TEXT,
        action_type TEXT NOT NULL,
        action_name TEXT NOT NULL,
        risk TEXT,
        decision TEXT NOT NULL,
        input_hash TEXT,
        output_hash TEXT,
        rule_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mg_audit_case_time
      ON mg_audit_events (case_id, ts_utc DESC);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mg_audit_anchors (
        event_id TEXT PRIMARY KEY REFERENCES mg_audit_events(event_uid) ON DELETE CASCADE,
        anchor_id TEXT NOT NULL UNIQUE,
        workflow_id TEXT NOT NULL,
        digest_sha256 TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        anchored_at TIMESTAMPTZ NOT NULL,
        chain_ref TEXT NOT NULL,
        anchored_by TEXT NOT NULL,
        anchor_mode TEXT NOT NULL,
        request_id TEXT
      );
    `);

    try {
      await this.pool.query(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);
      await this.pool.query(`
        SELECT create_hypertable(
          'mg_symptom_events',
          'reported_at',
          if_not_exists => TRUE,
          migrate_data => TRUE
        );
      `);
    } catch (error: any) {
      console.warn('⚠️ Timescale extension/hypertable setup skipped:', error.message);
    }

    this.schemaReady = true;
    this.lastError = null;
  }

  getStatus(): {
    configured: boolean;
    enabled: boolean;
    schemaReady: boolean;
    encryptionConfigured: boolean;
    backend: 'timescale' | 'in_memory';
    lastError?: string;
  } {
    return {
      configured: Boolean(this.pool),
      enabled: this.isEnabled(),
      schemaReady: this.schemaReady,
      encryptionConfigured: Boolean(this.cipher),
      backend: this.isEnabled() ? 'timescale' : 'in_memory',
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  async loadSnapshot(limit = STORE_BOOT_LIMIT): Promise<PersistedSnapshot> {
    if (!this.isEnabled() || !this.pool || !this.cipher) {
      return {
        symptomEvents: [],
        memoryRecords: [],
        auditEvents: [],
        anchors: [],
      };
    }

    await this.init();

    const safeLimit = Math.max(100, Math.min(40000, limit));
    const symptomRows = await this.pool.query(`
      SELECT * FROM mg_symptom_events
      ORDER BY reported_at ASC
      LIMIT $1
    `, [safeLimit]);

    const memoryRows = await this.pool.query(`
      SELECT * FROM mg_memory_records
      ORDER BY created_at ASC
      LIMIT $1
    `, [safeLimit]);

    const auditRows = await this.pool.query(`
      SELECT * FROM mg_audit_events
      ORDER BY ts_utc ASC
      LIMIT $1
    `, [safeLimit]);

    const anchorRows = await this.pool.query(`
      SELECT * FROM mg_audit_anchors
      ORDER BY anchored_at ASC
      LIMIT $1
    `, [safeLimit]);

    return {
      symptomEvents: symptomRows.rows.map((row) => this.toSymptomEvent(row)),
      memoryRecords: memoryRows.rows.map((row) => this.toMemoryRecord(row)),
      auditEvents: auditRows.rows.map((row) => this.toAuditEvent(row)),
      anchors: anchorRows.rows.map((row) => this.toAnchor(row)),
    };
  }

  async saveSymptomEvent(event: SymptomEventRecord): Promise<void> {
    if (!this.isEnabled() || !this.pool || !this.cipher) return;
    await this.init();
    await this.pool.query(`
      INSERT INTO mg_symptom_events (
        id, patient_id, reported_at, symptom_code, severity_0_10, duration,
        triggers, associated_symptoms, confidence, source, note_enc,
        tenant_id, clinic_id, session_id
      )
      VALUES (
        $1, $2, to_timestamp($3 / 1000.0), $4, $5, $6,
        $7::jsonb, $8::jsonb, $9, $10, $11,
        $12, $13, $14
      )
      ON CONFLICT (id) DO UPDATE SET
        symptom_code = EXCLUDED.symptom_code,
        severity_0_10 = EXCLUDED.severity_0_10,
        duration = EXCLUDED.duration,
        triggers = EXCLUDED.triggers,
        associated_symptoms = EXCLUDED.associated_symptoms,
        confidence = EXCLUDED.confidence,
        source = EXCLUDED.source,
        note_enc = EXCLUDED.note_enc,
        tenant_id = EXCLUDED.tenant_id,
        clinic_id = EXCLUDED.clinic_id,
        session_id = EXCLUDED.session_id;
    `, [
      event.id,
      event.patientId,
      event.reportedAt,
      event.symptomCode,
      event.severity0to10,
      event.duration,
      JSON.stringify(event.triggers || []),
      JSON.stringify(event.associatedSymptoms || []),
      event.confidence,
      event.source,
      event.note ? this.cipher.encrypt(event.note) : null,
      event.context.tenantId,
      event.context.clinicId,
      event.context.sessionId,
    ]);
  }

  async saveMemoryRecord(patientId: PatientId, record: MemoryRecord): Promise<void> {
    if (!this.isEnabled() || !this.pool || !this.cipher) return;
    await this.init();
    await this.pool.query(`
      INSERT INTO mg_memory_records (
        id, patient_id, memory_type, category, content_enc, provenance,
        tenant_id, clinic_id, session_id, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6::jsonb,
        $7, $8, $9, to_timestamp($10 / 1000.0)
      )
      ON CONFLICT (id) DO UPDATE SET
        memory_type = EXCLUDED.memory_type,
        category = EXCLUDED.category,
        content_enc = EXCLUDED.content_enc,
        provenance = EXCLUDED.provenance,
        tenant_id = EXCLUDED.tenant_id,
        clinic_id = EXCLUDED.clinic_id,
        session_id = EXCLUDED.session_id;
    `, [
      record.id,
      patientId,
      record.type,
      record.category,
      this.cipher.encrypt(record.content),
      JSON.stringify(record.provenance || {}),
      record.context.tenantId,
      record.context.clinicId,
      record.context.sessionId,
      record.createdAt,
    ]);
  }

  async saveAuditEvent(event: AuditEventRecord): Promise<void> {
    if (!this.isEnabled() || !this.pool) return;
    await this.init();
    await this.pool.query(`
      INSERT INTO mg_audit_events (
        event_uid, ts_utc, prev_hash, event_hash, anchor_state,
        actor_type, actor_id, case_id, workflow_run_id, action_type,
        action_name, risk, decision, input_hash, output_hash,
        rule_checks, metadata
      )
      VALUES (
        $1, $2::timestamptz, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16::jsonb, $17::jsonb
      )
      ON CONFLICT (event_uid) DO UPDATE SET
        anchor_state = EXCLUDED.anchor_state,
        metadata = EXCLUDED.metadata;
    `, [
      event.eventUid,
      event.tsUtc,
      event.prevHash,
      event.eventHash,
      event.anchorState,
      event.actorType,
      event.actorId || null,
      event.caseId || null,
      event.workflowRunId || null,
      event.actionType,
      event.actionName,
      event.risk || null,
      event.decision,
      event.inputHash || null,
      event.outputHash || null,
      JSON.stringify(event.ruleChecks || []),
      JSON.stringify(event.metadata || {}),
    ]);
  }

  async saveAuditAnchor(anchor: AuditAnchorRecord): Promise<void> {
    if (!this.isEnabled() || !this.pool) return;
    await this.init();
    await this.pool.query(`
      INSERT INTO mg_audit_anchors (
        event_id, anchor_id, workflow_id, digest_sha256, tx_hash,
        anchored_at, chain_ref, anchored_by, anchor_mode, request_id
      )
      VALUES (
        $1, $2, $3, $4, $5,
        to_timestamp($6 / 1000.0), $7, $8, $9, $10
      )
      ON CONFLICT (event_id) DO UPDATE SET
        anchor_id = EXCLUDED.anchor_id,
        workflow_id = EXCLUDED.workflow_id,
        digest_sha256 = EXCLUDED.digest_sha256,
        tx_hash = EXCLUDED.tx_hash,
        anchored_at = EXCLUDED.anchored_at,
        chain_ref = EXCLUDED.chain_ref,
        anchored_by = EXCLUDED.anchored_by,
        anchor_mode = EXCLUDED.anchor_mode,
        request_id = EXCLUDED.request_id;
    `, [
      anchor.eventId,
      anchor.anchorId,
      anchor.workflowId,
      anchor.digestSha256,
      anchor.txHash,
      anchor.anchoredAt,
      anchor.chainRef,
      anchor.anchoredBy,
      anchor.anchorMode,
      anchor.requestId || null,
    ]);
  }

  private toSymptomEvent(row: any): SymptomEventRecord {
    return {
      id: row.id,
      patientId: row.patient_id as PatientId,
      reportedAt: toEpochMs(row.reported_at),
      symptomCode: row.symptom_code,
      severity0to10: Number(row.severity_0_10),
      duration: row.duration,
      triggers: this.safeStringArray(row.triggers),
      associatedSymptoms: this.safeStringArray(row.associated_symptoms),
      confidence: Number(row.confidence),
      source: row.source as SymptomEventRecord['source'],
      note: row.note_enc && this.cipher ? this.cipher.decrypt(row.note_enc) : undefined,
      context: {
        tenantId: row.tenant_id,
        clinicId: row.clinic_id,
        patientId: row.patient_id as PatientId,
        sessionId: row.session_id,
      },
    };
  }

  private toMemoryRecord(row: any): MemoryRecord {
    return {
      id: row.id,
      type: row.memory_type,
      category: row.category,
      content: this.cipher ? this.cipher.decrypt(row.content_enc) : row.content_enc,
      provenance: typeof row.provenance === 'object' && row.provenance ? row.provenance : {},
      createdAt: toEpochMs(row.created_at),
      context: {
        tenantId: row.tenant_id,
        clinicId: row.clinic_id,
        patientId: row.patient_id as PatientId,
        sessionId: row.session_id,
      },
    };
  }

  private toAuditEvent(row: any): AuditEventRecord {
    return {
      eventUid: row.event_uid,
      tsUtc: new Date(row.ts_utc).toISOString(),
      prevHash: row.prev_hash,
      eventHash: row.event_hash,
      anchorState: row.anchor_state,
      actorType: row.actor_type,
      actorId: row.actor_id || undefined,
      caseId: row.case_id || undefined,
      workflowRunId: row.workflow_run_id || undefined,
      actionType: row.action_type,
      actionName: row.action_name,
      risk: row.risk || undefined,
      decision: row.decision,
      inputHash: row.input_hash || undefined,
      outputHash: row.output_hash || undefined,
      ruleChecks: this.safeStringArray(row.rule_checks),
      metadata: typeof row.metadata === 'object' && row.metadata ? row.metadata : {},
    };
  }

  private toAnchor(row: any): AuditAnchorRecord {
    return {
      anchorId: row.anchor_id,
      eventId: row.event_id,
      workflowId: row.workflow_id,
      digestSha256: row.digest_sha256,
      txHash: row.tx_hash,
      anchoredAt: toEpochMs(row.anchored_at),
      chainRef: row.chain_ref,
      anchoredBy: row.anchored_by,
      anchorMode: row.anchor_mode,
      requestId: row.request_id || undefined,
    };
  }

  private safeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item));
        }
      } catch {
        return [];
      }
    }
    return [];
  }
}

let store: AkashaTimescaleStore | null = null;

export function getAkashaTimescaleStore(): AkashaTimescaleStore {
  if (!store) {
    store = new AkashaTimescaleStore();
  }
  return store;
}
