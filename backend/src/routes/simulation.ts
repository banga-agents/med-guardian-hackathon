/**
 * Simulation API Routes
 * Controls patient simulation and real-time events
 */

import { Router } from 'express';
import { getPatientSimulator } from '../services/simulation/PatientSimulator';
import { getSecureVitalsVault } from '../services/privacy/SecureVitalsVault';
import { computeDerivedFeatures } from '../services/simulation/DerivedFeatures';
import type { PatientId } from '../types/simulation';
import { z } from 'zod';

const router = Router();

// Validation schemas
const StartSchema = z.object({
  speed: z.number().min(1).max(10).optional(),
  deterministicMode: z.boolean().optional(),
  seed: z.string().min(3).max(64).optional(),
});

const FeaturesQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(2).max(168).default(24),
});

const InvestigationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(6),
});

const ManualCheckInSchema = z.object({
  reason: z.string().min(2).max(180).optional(),
});

// GET /api/simulation/status
router.get('/status', (req, res) => {
  const simulator = getPatientSimulator();
  
  res.json({
    success: true,
    data: {
      isRunning: simulator.isSimulationRunning(),
      timelines: simulator.getAllPatientTimelines(),
      scenario: simulator.getScenarioConfig(),
    },
  });
});

// POST /api/simulation/start
router.post('/start', (req, res) => {
  try {
    const { speed, deterministicMode, seed } = StartSchema.parse(req.body);
    const simulator = getPatientSimulator();
    
    simulator.start({
      speed: speed || 1,
      deterministicMode,
      seed,
    });
    
    res.json({
      success: true,
      message: `Simulation started at ${speed || 1}x speed`,
      data: simulator.getScenarioConfig(),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/simulation/stop
router.post('/stop', (req, res) => {
  const simulator = getPatientSimulator();
  simulator.stop();
  
  res.json({
    success: true,
    message: 'Simulation stopped',
  });
});

// POST /api/simulation/speed
router.post('/speed', (req, res) => {
  try {
    const { speed, deterministicMode, seed } = StartSchema.parse(req.body);
    const simulator = getPatientSimulator();
    
    simulator.start({
      speed: speed || 1,
      deterministicMode,
      seed,
    });
    
    res.json({
      success: true,
      message: `Simulation speed set to ${speed || 1}x`,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/simulation/patients/:patientId/vitals
router.get('/patients/:patientId/vitals', (req, res) => {
  const { patientId } = req.params;
  const simulator = getPatientSimulator();
  
  const vitals = simulator.getPatientVitals(patientId as any);
  const state = simulator.getPatientState(patientId as any);
  const timeline = simulator.getPatientTimeline(patientId as any);
  
  res.json({
    success: true,
    data: {
      patientId,
      state,
      timeline,
      vitals,
    },
  });
});

// GET /api/simulation/patients/:patientId/state
router.get('/patients/:patientId/state', (req, res) => {
  const { patientId } = req.params;
  const simulator = getPatientSimulator();
  
  res.json({
    success: true,
    data: {
      patientId,
      state: simulator.getPatientState(patientId as any),
      timeline: simulator.getPatientTimeline(patientId as any),
    },
  });
});

// GET /api/simulation/patients/:patientId/timeline
router.get('/patients/:patientId/timeline', (req, res) => {
  const { patientId } = req.params;
  const simulator = getPatientSimulator();

  res.json({
    success: true,
    data: {
      patientId,
      timeline: simulator.getPatientTimeline(patientId as any),
    },
  });
});

// GET /api/simulation/patients/:patientId/investigations?limit=6
router.get('/patients/:patientId/investigations', (req, res) => {
  const { patientId } = req.params;
  const { limit } = InvestigationsQuerySchema.parse(req.query);
  const simulator = getPatientSimulator();

  res.json({
    success: true,
    data: {
      patientId,
      investigations: simulator.getPatientInvestigations(patientId as PatientId, limit),
    },
  });
});

// POST /api/simulation/patients/:patientId/check-in
router.post('/patients/:patientId/check-in', async (req, res) => {
  try {
    const patientId = z.enum(['sarah', 'robert', 'emma', 'michael']).parse(req.params.patientId);
    const payload = ManualCheckInSchema.parse(req.body ?? {});
    const simulator = getPatientSimulator();

    const thread = await simulator.runManualCheckIn(patientId as PatientId, payload.reason);
    res.json({
      success: true,
      data: {
        patientId,
        reason: payload.reason ?? 'manual_check_in',
        thread,
      },
      message: 'Manual daily check-in completed',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/simulation/patients/:patientId/features?windowHours=24
router.get('/patients/:patientId/features', (req, res) => {
  const { patientId } = req.params;
  const simulator = getPatientSimulator();
  const vault = getSecureVitalsVault();

  const { windowHours } = FeaturesQuerySchema.parse(req.query);
  const safePatientId = patientId as PatientId;
  const timeline = simulator.getPatientTimeline(safePatientId);
  const maxReadings = Math.min(100, Math.max(8, windowHours * 4));
  const readings = vault.getRaw(safePatientId, maxReadings);
  const features = computeDerivedFeatures(readings);

  res.json({
    success: true,
    data: {
      patientId: safePatientId,
      timeline,
      windowHours,
      computedAt: Date.now(),
      ...features,
    },
  });
});

export function setupSimulationRoutes(): Router {
  return router;
}
