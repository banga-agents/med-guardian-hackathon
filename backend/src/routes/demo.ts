/**
 * Demo API Routes
 * Provides endpoints for orchestrating the compressed timeline demo
 */

import { Router, Request, Response } from 'express';
import { getDemoOrchestrator } from '../services/demo/DemoOrchestrator';
import { getDoctorPortal } from '../services/doctor/DoctorPortal';
import { getPatientSimulator } from '../services/simulation/PatientSimulator';
import { PatientId, DoctorId } from '../types/simulation';

const router = Router();

// Get demo status
router.get('/status', (req: Request, res: Response) => {
  const orchestrator = getDemoOrchestrator();
  const portal = getDoctorPortal();
  const simulator = getPatientSimulator();

  res.json({
    demo: orchestrator.getDemoStatus(),
    activeAlerts: portal.getActiveAlerts().length,
    activeGrants: portal.getActiveGrants().length,
    patients: simulator.getAllPatients().map(p => ({
      id: p.id,
      name: p.name,
      condition: p.condition,
      state: p.state,
      timeline: simulator.getPatientTimeline(p.id),
    })),
  });
});

// Start demo
router.post('/start', (req: Request, res: Response) => {
  const orchestrator = getDemoOrchestrator();
  
  try {
    orchestrator.start();
    res.json({ success: true, message: 'Demo started - 10 min = 1 day' });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Stop demo
router.post('/stop', (req: Request, res: Response) => {
  const orchestrator = getDemoOrchestrator();
  
  try {
    orchestrator.stop();
    res.json({ success: true, message: 'Demo stopped' });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Get patient condition details
router.get('/patient/:id/condition', (req: Request, res: Response) => {
  const orchestrator = getDemoOrchestrator();
  const condition = orchestrator.getPatientCondition(req.params.id as PatientId);
  
  if (!condition) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }
  
  res.json(condition);
});

// Get all patient conditions
router.get('/conditions', (req: Request, res: Response) => {
  const orchestrator = getDemoOrchestrator();
  const simulator = getPatientSimulator();
  
  const patients = simulator.getAllPatients().map(p => ({
    id: p.id,
    ...orchestrator.getPatientCondition(p.id),
  }));
  
  res.json(patients);
});

// Get active alerts
router.get('/alerts', (req: Request, res: Response) => {
  const portal = getDoctorPortal();
  const { patientId } = req.query;
  
  const alerts = portal.getActiveAlerts(patientId as PatientId | undefined);
  res.json(alerts);
});

// Get active access grants
router.get('/grants', (req: Request, res: Response) => {
  const portal = getDoctorPortal();
  const { doctorId } = req.query;
  
  const grants = portal.getActiveGrants(doctorId as DoctorId | undefined);
  res.json(grants);
});

// Resolve an alert
router.post('/alerts/:id/resolve', (req: Request, res: Response) => {
  const portal = getDoctorPortal();
  
  try {
    portal.resolveAlert(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Manually trigger escalation (for testing)
router.post('/escalate', (req: Request, res: Response) => {
  const { patientId, doctorId } = req.body;
  const portal = getDoctorPortal();
  
  try {
    const grant = portal.grantAccess(doctorId, patientId, 24);
    res.json({ success: true, grant });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
