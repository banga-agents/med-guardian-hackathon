import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getAkashaSymptomService } from '../services/akasha/AkashaSymptomService';
import { PatientIdSchema } from '../lib/patientIds';
import { getPatientAssistantService } from '../services/patients/PatientAssistantService';

const router = Router();

const ChatSchema = z.object({
  patientId: PatientIdSchema,
  message: z.string().min(1).max(1200),
  sessionId: z.string().min(2).max(120).optional(),
  tenantId: z.string().min(2).max(120).optional(),
  clinicId: z.string().min(2).max(120).optional(),
  channel: z.enum(['web_chat', 'telegram', 'mobile']).optional(),
});

const SymptomSchema = z.object({
  patientId: PatientIdSchema,
  reported_at: z.number().int().positive().optional(),
  symptom_code: z.string().min(2).max(80),
  severity_0_10: z.number().min(0).max(10),
  duration: z.string().min(1).max(80).optional(),
  triggers: z.array(z.string().min(1).max(120)).max(20).optional(),
  associated_symptoms: z.array(z.string().min(1).max(80)).max(20).optional(),
  confidence: z.number().min(0).max(1).optional(),
  note: z.string().min(1).max(400).optional(),
  source: z.enum(['patient_chat', 'manual_entry', 'agent_followup', 'doctor_note']).optional(),
  sessionId: z.string().min(2).max(120).optional(),
  tenantId: z.string().min(2).max(120).optional(),
  clinicId: z.string().min(2).max(120).optional(),
});

const TimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(400).default(120),
});

const AssistantItemKindSchema = z.enum(['medication', 'appointment', 'nutrition', 'follow_up', 'task']);
const AssistantItemStatusSchema = z.enum(['pending', 'completed', 'dismissed']);
const AssistantItemRecurrenceSchema = z.enum(['once', 'daily', 'weekly', 'monthly']);

const AssistantItemCreateSchema = z.object({
  kind: AssistantItemKindSchema,
  title: z.string().trim().min(2).max(180),
  details: z.string().trim().max(480).optional(),
  dueAt: z.number().int().positive().optional(),
  scheduledFor: z.string().trim().max(160).optional(),
  recurrence: AssistantItemRecurrenceSchema.optional(),
});

const AssistantItemUpdateSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  details: z.string().trim().max(480).nullable().optional(),
  dueAt: z.number().int().positive().nullable().optional(),
  scheduledFor: z.string().trim().max(160).nullable().optional(),
  recurrence: AssistantItemRecurrenceSchema.nullable().optional(),
  status: AssistantItemStatusSchema.optional(),
});

function resolveTraceId(req: { headers: { [key: string]: any } }): string {
  const header = req.headers['x-trace-id'];
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim().slice(0, 120);
  }
  return `trace-${randomUUID()}`;
}

router.post('/chat', async (req, res) => {
  try {
    const payload = ChatSchema.parse(req.body);
    const traceId = resolveTraceId(req);
    const service = getAkashaSymptomService();

    const result = await service.handlePatientChat({
      patientId: payload.patientId,
      message: payload.message,
      sessionId: payload.sessionId,
      tenantId: payload.tenantId,
      clinicId: payload.clinicId,
      channel: payload.channel,
      traceId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/symptoms', (req, res) => {
  try {
    const payload = SymptomSchema.parse(req.body);
    const traceId = resolveTraceId(req);
    const service = getAkashaSymptomService();

    const result = service.recordSymptom({
      patientId: payload.patientId,
      symptomCode: payload.symptom_code,
      severity0to10: payload.severity_0_10,
      duration: payload.duration,
      triggers: payload.triggers,
      associatedSymptoms: payload.associated_symptoms,
      confidence: payload.confidence,
      note: payload.note,
      source: payload.source,
      reportedAt: payload.reported_at,
      sessionId: payload.sessionId,
      tenantId: payload.tenantId,
      clinicId: payload.clinicId,
      traceId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/:id/timeline', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.id);
    const { limit } = TimelineQuerySchema.parse(req.query);
    const traceId = resolveTraceId(req);
    const service = getAkashaSymptomService();

    const data = service.getPatientTimeline({
      patientId,
      limit,
      traceId,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/:id/assistant', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.id);
    const snapshot = getPatientAssistantService().getSnapshot(patientId);

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/:id/assistant/items', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.id);
    const payload = AssistantItemCreateSchema.parse(req.body);
    const item = getPatientAssistantService().createItem(patientId, payload);

    res.json({
      success: true,
      data: item,
      message: 'Assistant item created',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.patch('/:id/assistant/items/:itemId', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.id);
    const payload = AssistantItemUpdateSchema.parse(req.body);
    const item = getPatientAssistantService().updateItem(patientId, req.params.itemId, payload);

    res.json({
      success: true,
      data: item,
      message: 'Assistant item updated',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete('/:id/assistant/items/:itemId', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.id);
    const deleted = getPatientAssistantService().deleteItem(patientId, req.params.itemId);

    res.json({
      success: true,
      data: {
        deleted,
        itemId: req.params.itemId,
      },
      message: deleted ? 'Assistant item deleted' : 'Assistant item not found',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupPatientAgentRoutes(): Router {
  return router;
}
