import { Router } from 'express';
import { z } from 'zod';
import { getProfessionalNetworkService } from '../services/network/ProfessionalNetworkService';
import { getDoctorPortal } from '../services/doctor/DoctorPortal';
import { PatientIdSchema } from '../lib/patientIds';

const router = Router();

const ProfessionalRoleSchema = z.enum([
  'doctor',
  'nurse',
  'lab_tech',
  'caregiver',
  'nutritionist',
]);

const DoctorPoolIdSchema = z.enum(['dr_chen', 'dr_rodriguez', 'dr_patel', 'dr_smith']);
const NetworkCaseStatusSchema = z.enum(['open', 'triage_ready', 'in_review', 'validated', 'closed']);
const NetworkTaskStatusSchema = z.enum(['open', 'claimed', 'submitted', 'approved', 'rejected', 'paid']);
const ProfessionalStatusSchema = z.enum(['online', 'offline', 'busy']);

const RegisterProfessionalSchema = z.object({
  id: z.string().min(2).max(80).optional(),
  name: z.string().min(2).max(120),
  role: ProfessionalRoleSchema,
  specialty: z.string().min(2).max(120).optional(),
  licenseId: z.string().min(3).max(120).optional(),
  region: z.string().min(2).max(120).optional(),
  walletAddress: z.string().min(4).max(128).optional(),
  feeUsd: z.number().min(0).max(1000).optional(),
  rating: z.number().min(0).max(5).optional(),
  isVerified: z.boolean().optional(),
  status: ProfessionalStatusSchema.optional(),
});

const IntakeCaseSchema = z.object({
  patientId: PatientIdSchema,
  source: z.enum(['simulation', 'manual', 'api']).optional(),
  reason: z.string().min(3).max(240),
  severity: z.number().int().min(1).max(5),
  symptoms: z.array(z.string().min(1).max(240)).max(20).optional(),
  featureSignals: z.array(z.string().min(1).max(240)).max(20).optional(),
  requestedRoles: z.array(ProfessionalRoleSchema).max(5).optional(),
  triageHint: z
    .object({
      summary: z.string().min(3).max(220).optional(),
      rationale: z.string().min(3).max(320).optional(),
      confidence: z.number().min(0).max(1).optional(),
      escalationLevel: z.enum(['routine', 'priority', 'urgent']).optional(),
      recommendedActions: z.array(z.string().min(1).max(220)).max(10).optional(),
      requiredRoles: z.array(ProfessionalRoleSchema).max(5).optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const CasesQuerySchema = z.object({
  patientId: PatientIdSchema.optional(),
  status: NetworkCaseStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const TasksQuerySchema = z.object({
  caseId: z.string().min(1).max(120).optional(),
  role: ProfessionalRoleSchema.optional(),
  status: NetworkTaskStatusSchema.optional(),
  professionalId: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(300).default(80),
});

const PayoutsQuerySchema = z.object({
  caseId: z.string().min(1).max(120).optional(),
  professionalId: z.string().min(1).max(120).optional(),
  role: ProfessionalRoleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(80),
});

const ClaimTaskSchema = z.object({
  professionalId: z.string().min(1).max(120),
});

const SubmitTaskSchema = z.object({
  professionalId: z.string().min(1).max(120),
  submission: z.object({
    notes: z.string().min(3).max(1200),
    confidence: z.number().min(0).max(1),
    recommendation: z.string().min(3).max(500),
    followUpActions: z.array(z.string().min(1).max(220)).max(12).optional(),
    evidenceRefs: z.array(z.string().min(1).max(220)).max(12).optional(),
  }),
});

const ApproveTaskSchema = z.object({
  approverId: z.string().min(1).max(120),
  notes: z.string().min(1).max(400).optional(),
});

function requireNetworkEnabled(res: any): boolean {
  const service = getProfessionalNetworkService();
  if (!service.isEnabled()) {
    res.status(503).json({
      success: false,
      error: 'Professional network is disabled (set ENABLE_PRO_NETWORK=true)',
    });
    return false;
  }
  return true;
}

router.get('/status', (_req, res) => {
  const service = getProfessionalNetworkService();
  res.json({
    success: true,
    data: service.getStatus(),
  });
});

router.get('/snapshot', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20));
  const service = getProfessionalNetworkService();
  res.json({
    success: true,
    data: service.getSnapshot(limit),
  });
});

router.get('/professionals', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const query = z
      .object({
        role: ProfessionalRoleSchema.optional(),
        status: ProfessionalStatusSchema.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(80),
      })
      .parse(req.query);
    const service = getProfessionalNetworkService();

    res.json({
      success: true,
      data: service.listProfessionals(query),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/professionals/register', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const payload = RegisterProfessionalSchema.parse(req.body);
    const service = getProfessionalNetworkService();

    res.json({
      success: true,
      data: service.registerProfessional(payload),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/cases/intake', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const payload = IntakeCaseSchema.parse(req.body);
    const service = getProfessionalNetworkService();

    const result = service.intakeCase(payload);

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

router.get('/cases', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const query = CasesQuerySchema.parse(req.query);
    const service = getProfessionalNetworkService();

    res.json({
      success: true,
      data: service.listCases(query),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/tasks', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const query = TasksQuerySchema.parse(req.query);
    const service = getProfessionalNetworkService();

    res.json({
      success: true,
      data: service.listTasks(query),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/tasks/:taskId/claim', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const taskId = z.string().min(1).max(120).parse(req.params.taskId);
    const payload = ClaimTaskSchema.parse(req.body);
    const service = getProfessionalNetworkService();

    const task = service.claimTask({
      taskId,
      professionalId: payload.professionalId,
    });

    // When a pooled doctor claims a mission, automatically grant scoped patient access.
    if (task.role === 'doctor' && task.claimedBy) {
      try {
        const doctorId = DoctorPoolIdSchema.parse(task.claimedBy);
        const portal = getDoctorPortal();
        if (!portal.validateAccess(doctorId, task.patientId)) {
          portal.grantAccess(doctorId, task.patientId, 24, ['all']);
        }
      } catch {
        // Non-core doctor IDs do not map to the demo doctor portal.
      }
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/tasks/:taskId/submit', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const taskId = z.string().min(1).max(120).parse(req.params.taskId);
    const payload = SubmitTaskSchema.parse(req.body);
    const service = getProfessionalNetworkService();

    res.json({
      success: true,
      data: service.submitTask({
        taskId,
        professionalId: payload.professionalId,
        submission: payload.submission,
      }),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/tasks/:taskId/approve', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const taskId = z.string().min(1).max(120).parse(req.params.taskId);
    const payload = ApproveTaskSchema.parse(req.body);
    const service = getProfessionalNetworkService();

    res.json({
      success: true,
      data: service.approveTask({
        taskId,
        approverId: payload.approverId,
        notes: payload.notes,
      }),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/payouts', (req, res) => {
  if (!requireNetworkEnabled(res)) return;

  try {
    const query = PayoutsQuerySchema.parse(req.query);
    const service = getProfessionalNetworkService();

    res.json({
      success: true,
      data: service.listPayouts(query),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupNetworkRoutes(): Router {
  return router;
}
