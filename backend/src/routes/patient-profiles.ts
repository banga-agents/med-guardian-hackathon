import { Router } from 'express';
import { z } from 'zod';
import { PatientIdSchema } from '../lib/patientIds';
import { getPatientAssistantService } from '../services/patients/PatientAssistantService';
import { getPatientProfileRegistry } from '../services/patients/PatientProfileRegistry';

const router = Router();
const DoctorIdSchema = z.enum(['dr_chen', 'dr_rodriguez', 'dr_patel', 'dr_smith']);

const CreatePatientProfileSchema = z.object({
  id: PatientIdSchema.optional(),
  name: z.string().trim().min(2).max(120),
  age: z.number().int().min(0).max(120),
  condition: z.string().trim().min(2).max(160),
  bio: z.string().trim().max(480).optional(),
  medicalHistory: z.array(z.string().trim().min(1).max(180)).max(20).optional(),
  medications: z.array(z.string().trim().min(1).max(180)).max(20).optional(),
  allergies: z.array(z.string().trim().min(1).max(180)).max(20).optional(),
  primaryDoctor: DoctorIdSchema.optional(),
  avatar: z.string().trim().min(1).max(240).optional(),
});

const UpdatePatientProfileSchema = CreatePatientProfileSchema.partial().omit({ id: true });

router.get('/', (_req, res) => {
  const registry = getPatientProfileRegistry();
  const profiles = registry.listProfiles();

  res.json({
    success: true,
    data: {
      profiles,
      count: profiles.length,
    },
  });
});

router.get('/:patientId', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.patientId);
    const registry = getPatientProfileRegistry();
    const profile = registry.getProfile(patientId);

    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Patient profile not found',
      });
      return;
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/', (req, res) => {
  try {
    const payload = CreatePatientProfileSchema.parse(req.body);
    const registry = getPatientProfileRegistry();
    const profile = registry.createProfile(payload);

    res.json({
      success: true,
      data: profile,
      message: 'Patient profile created',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.patch('/:patientId', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.patientId);
    const payload = UpdatePatientProfileSchema.parse(req.body);
    const registry = getPatientProfileRegistry();
    const profile = registry.updateProfile(patientId, payload);

    res.json({
      success: true,
      data: profile,
      message: 'Patient profile updated',
    });
  } catch (error: any) {
    const status = String(error.message || '').includes('Unknown patient profile') ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete('/:patientId', (req, res) => {
  try {
    const patientId = PatientIdSchema.parse(req.params.patientId);
    const registry = getPatientProfileRegistry();
    const deleted = registry.deleteProfile(patientId);
    getPatientAssistantService().deletePatientItems(patientId);

    res.json({
      success: true,
      data: deleted,
      message: 'Patient profile deleted',
    });
  } catch (error: any) {
    const status =
      String(error.message || '').includes('cannot be deleted')
      || String(error.message || '').includes('Unknown patient profile')
        ? 400
        : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupPatientProfileRoutes(): Router {
  return router;
}
