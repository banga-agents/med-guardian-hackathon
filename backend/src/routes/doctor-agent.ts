import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getAkashaSymptomService } from '../services/akasha/AkashaSymptomService';
import { PatientIdSchema } from '../lib/patientIds';

const router = Router();

const BriefSchema = z.object({
  patientId: PatientIdSchema,
  doctorId: z.enum(['dr_chen', 'dr_rodriguez', 'dr_patel', 'dr_smith']).optional(),
  focusQuestion: z.string().min(3).max(400).optional(),
});

function resolveTraceId(req: { headers: { [key: string]: any } }): string {
  const header = req.headers['x-trace-id'];
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim().slice(0, 120);
  }
  return `trace-${randomUUID()}`;
}

router.post('/brief', async (req, res) => {
  try {
    const payload = BriefSchema.parse(req.body);
    const traceId = resolveTraceId(req);
    const service = getAkashaSymptomService();

    const result = await service.generateDoctorBrief({
      patientId: payload.patientId,
      doctorId: payload.doctorId,
      focusQuestion: payload.focusQuestion,
      traceId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const isAccessError = String(error.message || '').toLowerCase().includes('access denied');
    res.status(isAccessError ? 403 : 400).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupDoctorAgentRoutes(): Router {
  return router;
}
