import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getAkashaSymptomService } from '../services/akasha/AkashaSymptomService';
import { PatientIdSchema } from '../lib/patientIds';

const router = Router();

const EscalateSchema = z.object({
  patientId: PatientIdSchema,
  reason: z.string().min(3).max(280),
  severity: z.number().int().min(1).max(10).optional(),
  requestedRoles: z
    .array(z.enum(['doctor', 'nurse', 'lab_tech', 'caregiver', 'nutritionist']))
    .max(5)
    .optional(),
});

function resolveTraceId(req: { headers: { [key: string]: any } }): string {
  const header = req.headers['x-trace-id'];
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim().slice(0, 120);
  }
  return `trace-${randomUUID()}`;
}

router.post('/escalate', (req, res) => {
  try {
    const payload = EscalateSchema.parse(req.body);
    const traceId = resolveTraceId(req);
    const service = getAkashaSymptomService();

    const result = service.escalateAlert({
      patientId: payload.patientId,
      reason: payload.reason,
      severity: payload.severity,
      requestedRoles: payload.requestedRoles,
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

export function setupAkashaAlertRoutes(): Router {
  return router;
}
