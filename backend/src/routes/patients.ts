import { Router } from 'express';
import { z } from 'zod';
import { getDoctorPortal } from '../services/doctor/DoctorPortal';
import { PatientIdSchema } from '../lib/patientIds';

const router = Router();
const QuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'denied', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get('/:patientId/access/requests', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.patientId);
    const { status, limit } = QuerySchema.parse(req.query);
    const requests = getDoctorPortal().getAccessRequests({ patientId, status, limit });

    res.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupPatientRoutes(): Router {
  return router;
}
