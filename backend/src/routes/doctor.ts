/**
 * Doctor Portal API Routes
 */

import { Router } from 'express';
import { getDoctorPortal } from '../services/doctor/DoctorPortal';
import { z } from 'zod';
import { PatientIdSchema } from '../lib/patientIds';

const router = Router();
const DoctorIdSchema = z.enum(['dr_chen', 'dr_rodriguez', 'dr_patel', 'dr_smith']);
const TENDERLY_EXPLORER_BASE =
  (process.env.TENDERLY_EXPLORER_BASE && process.env.TENDERLY_EXPLORER_BASE.replace(/\/$/, ''))
  || 'https://dashboard.tenderly.co/tx/ethereum-testnet-sepolia';

// Validation schemas
const AccessRequestSchema = z.object({
  doctorId: DoctorIdSchema,
  patientId: PatientIdSchema,
  duration: z.number().min(1).max(168), // hours, max 1 week
  requestedQueries: z.array(z.string()),
});

const AccessDecisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['approved', 'denied']),
  decidedBy: PatientIdSchema,
  decisionReason: z.string().min(1).max(160).optional(),
  grantedDurationHours: z.number().int().min(1).max(168).optional(),
  permissions: z.array(z.enum(['vitals', 'symptoms', 'reports', 'medications', 'history'])).optional(),
});

const AccessRequestQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'denied', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const ConsultationSchema = z.object({
  doctorId: DoctorIdSchema,
  message: z.string().min(1).max(500),
});

const ResearchBriefSchema = z.object({
  focusQuestion: z.string().min(3).max(320),
});

const CarePlanSchema = z.object({
  validatedInsight: z.string().min(6).max(800),
  nextSteps: z.array(z.string().min(3).max(240)).max(10).default([]),
  medicationSchedule: z.array(z.string().min(3).max(240)).max(10).default([]),
  appointments: z.array(z.string().min(3).max(240)).max(10).default([]),
  nutritionGuidance: z.array(z.string().min(3).max(240)).max(10).default([]),
});

// GET /api/doctors
router.get('/', (req, res) => {
  const portal = getDoctorPortal();
  const doctors = portal.getAllDoctors();
  
  res.json({
    success: true,
    data: doctors,
  });
});

// GET /api/doctors/:doctorId
router.get('/:doctorId', (req, res) => {
  const { doctorId } = req.params;
  const portal = getDoctorPortal();
  const doctor = portal.getDoctor(doctorId as any);
  
  if (!doctor) {
    res.status(404).json({
      success: false,
      error: 'Doctor not found',
    });
    return;
  }
  
  res.json({
    success: true,
    data: doctor,
  });
});

// GET /api/doctors/:doctorId/patients
router.get('/:doctorId/patients', (req, res) => {
  const { doctorId } = req.params;
  const portal = getDoctorPortal();
  
  const patients = portal.getDoctorPatients(doctorId as any);
  
  res.json({
    success: true,
    data: {
      doctorId,
      patients,
      count: patients.length,
    },
  });
});

// GET /api/doctors/:doctorId/alerts
router.get('/:doctorId/alerts', (req, res) => {
  const { doctorId } = req.params;
  const portal = getDoctorPortal();
  
  const alerts = portal.getDoctorAlerts(doctorId as any);
  
  res.json({
    success: true,
    data: alerts,
  });
});

// POST /api/doctors/access/request
router.post('/access/request', async (req, res) => {
  try {
    const { doctorId, patientId, duration, requestedQueries } = AccessRequestSchema.parse(req.body);
    
    const portal = getDoctorPortal();
    const result = portal.requestAccess(doctorId, patientId, duration, requestedQueries);
    
    res.json({
      success: true,
      data: result,
      message: 'Access request submitted and awaiting patient consent',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/doctors/access/decision
router.post('/access/decision', async (req, res) => {
  try {
    const payload = AccessDecisionSchema.parse(req.body);
    const portal = getDoctorPortal();
    const result = portal.decideAccessRequest(payload);

    res.json({
      success: true,
      data: result,
      message:
        payload.decision === 'approved'
          ? 'Access request approved'
          : 'Access request denied',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/doctors/:doctorId/access/requests
router.get('/:doctorId/access/requests', (req, res) => {
  try {
    const doctorId = DoctorIdSchema.parse(req.params.doctorId);
    const { status, limit } = AccessRequestQuerySchema.parse(req.query);
    const portal = getDoctorPortal();
    const requests = portal.getAccessRequests({ doctorId, status, limit });

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

// GET /api/doctors/patients/:patientId/access/requests
router.get('/patients/:patientId/access/requests', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.patientId);
    const { status, limit } = AccessRequestQuerySchema.parse(req.query);
    const portal = getDoctorPortal();
    const requests = portal.getAccessRequests({ patientId, status, limit });

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

// POST /api/doctors/access/grant
router.post('/access/grant', async (req, res) => {
  try {
    if (process.env.ALLOW_DIRECT_GRANT !== 'true') {
      res.status(403).json({
        success: false,
        error: 'Direct grant path disabled. Use /api/doctors/access/request + /api/doctors/access/decision.',
      });
      return;
    }

    const { doctorId, patientId, duration, requestedQueries } = AccessRequestSchema.parse(req.body);
    
    const portal = getDoctorPortal();
    const grant = portal.grantAccess(doctorId, patientId, duration, requestedQueries);
    
    res.json({
      success: true,
      data: grant,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/doctors/access/revoke
router.post('/access/revoke', async (req, res) => {
  try {
    const { doctorId, patientId } = z.object({
      doctorId: z.enum(['dr_chen', 'dr_rodriguez', 'dr_patel', 'dr_smith']),
      patientId: PatientIdSchema,
    }).parse(req.body);
    
    const portal = getDoctorPortal();
    const success = portal.revokeAccess(doctorId, patientId);
    
    res.json({
      success,
      message: success ? 'Access revoked' : 'Access not found',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/doctors/:doctorId/patients/:patientId/report
router.get('/:doctorId/patients/:patientId/report', async (req, res) => {
  const { doctorId, patientId } = req.params;
  const { start, end } = req.query;
  
  try {
    const portal = getDoctorPortal();
    
    const report = await portal.generateHealthReport(
      doctorId as any,
      patientId as any,
      {
        start: start ? parseInt(start as string) : Date.now() - 7 * 24 * 60 * 60 * 1000,
        end: end ? parseInt(end as string) : Date.now(),
      }
    );
    
    res.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    res.status(403).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/doctors/:doctorId/patients/:patientId/consult
router.post('/:doctorId/patients/:patientId/consult', async (req, res) => {
  const { doctorId, patientId } = req.params;
  
  try {
    const { message } = ConsultationSchema.parse({ ...req.body, doctorId });
    
    const portal = getDoctorPortal();
    const result = await portal.sendConsultationMessage(
      doctorId as any,
      patientId as any,
      message
    );
    
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

// POST /api/doctors/:doctorId/patients/:patientId/research
router.post('/:doctorId/patients/:patientId/research', async (req, res) => {
  const { doctorId, patientId } = req.params;

  try {
    const parsedDoctorId = DoctorIdSchema.parse(doctorId);
    const parsedPatientId = PatientIdSchema.parse(patientId);
    const { focusQuestion } = ResearchBriefSchema.parse(req.body);

    const portal = getDoctorPortal();
    const brief = await portal.generateResearchBrief(parsedDoctorId, parsedPatientId, focusQuestion);

    res.json({
      success: true,
      data: brief,
    });
  } catch (error: any) {
    const status = error.message?.includes('Access denied') ? 403 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/doctors/:doctorId/patients/:patientId/care-plan
router.post('/:doctorId/patients/:patientId/care-plan', async (req, res) => {
  const { doctorId, patientId } = req.params;

  try {
    const parsedDoctorId = DoctorIdSchema.parse(doctorId);
    const parsedPatientId = PatientIdSchema.parse(patientId);
    const payload = CarePlanSchema.parse(req.body);

    const portal = getDoctorPortal();
    const result = await portal.validateInsightAndDispatchPlan(parsedDoctorId, parsedPatientId, payload);

    res.json({
      success: true,
      data: result,
      message: 'Validated care plan dispatched to patient assistant',
    });
  } catch (error: any) {
    const status = error.message?.includes('Access denied') ? 403 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/doctors/alerts/:alertId/acknowledge
router.post('/alerts/:alertId/acknowledge', (req, res) => {
  const { alertId } = req.params;
  const { doctorId } = req.body;
  
  try {
    const portal = getDoctorPortal();
    const success = portal.acknowledgeAlert(alertId, doctorId);
    
    res.json({
      success,
      message: success ? 'Alert acknowledged' : 'Alert not found',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

const parseLimit = (limit?: string): number => {
  if (!limit) return 20;
  const parsed = Number.parseInt(limit, 10);
  if (Number.isNaN(parsed)) return 20;
  return Math.min(100, Math.max(1, parsed));
};

router.get('/:doctorId/patients/:patientId/vitals/redacted', (req, res) => {
  try {
    const doctorId = DoctorIdSchema.parse(req.params.doctorId);
    const patientId = PatientIdSchema.parse(req.params.patientId);
    const limit = parseLimit(req.query.limit as string | undefined);
    const portal = getDoctorPortal();
    const entries = portal.getRedactedVitals(patientId, limit);

    res.json({
      success: true,
      data: {
        doctorId,
        patientId,
        redacted: entries,
        latestCommitment: entries[0]?.commitmentHash,
        explorerBase: TENDERLY_EXPLORER_BASE,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/:doctorId/patients/:patientId/vitals/raw', (req, res) => {
  try {
    const doctorId = DoctorIdSchema.parse(req.params.doctorId);
    const patientId = PatientIdSchema.parse(req.params.patientId);
    const limit = parseLimit(req.query.limit as string | undefined);
    const portal = getDoctorPortal();
    const { vitals, audit } = portal.getRawVitals(doctorId, patientId, limit);

    res.json({
      success: true,
      data: {
        doctorId,
        patientId,
        vitals,
        audit,
        tenderlyExplorerUrl: audit.txHash ? `${TENDERLY_EXPLORER_BASE}/${audit.txHash}` : undefined,
      },
    });
  } catch (error: any) {
    const status = error.message?.includes('Access denied') ? 403 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupDoctorRoutes(): Router {
  return router;
}
