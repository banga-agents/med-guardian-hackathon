/**
 * WebSocket Service
 * Handles real-time events between patients, agents, and doctors
 */

import { Server as SocketIOServer } from 'socket.io';
import { getPatientSimulator } from '../simulation/PatientSimulator';
import { getDoctorPortal } from '../doctor/DoctorPortal';
import { getDemoOrchestrator } from '../demo/DemoOrchestrator';
import { getReceiptStore } from '../cre/ReceiptStore';
import { getProfessionalNetworkService } from '../network/ProfessionalNetworkService';

export function setupWebSocketHandlers(io: SocketIOServer): void {
  const simulator = getPatientSimulator();
  const portal = getDoctorPortal();
  const receiptStore = getReceiptStore();
  const network = getProfessionalNetworkService();

  // ============================================
  // SIMULATION EVENTS → WEBSOCKET
  // ============================================

  // Vitals generated
  simulator.on('vitals:generated', (vitals) => {
    io.emit('patient:vitals', vitals);
  });

  simulator.on('privacy:vitals', (redacted) => {
    io.emit('privacy:vitals', redacted);
  });

  simulator.on('blockchain:event', (event) => {
    io.emit('blockchain:event', event);
  });

  // Symptom reported
  simulator.on('symptom:reported', (symptom) => {
    io.emit('patient:symptom', symptom);
    
    // Create alert for doctors
    if (symptom.severity >= 4) {
      portal.createAlert({
        type: 'symptom_severe',
        severity: symptom.severity === 5 ? 'critical' : 'high',
        patientId: symptom.patientId,
        title: 'Severe Symptom Reported',
        message: `${symptom.type}: ${symptom.description}`,
        timestamp: Date.now(),
      });

      const intake = network.autoIntakeFromSymptom({
        patientId: symptom.patientId,
        symptomType: symptom.type,
        severity: symptom.severity,
        description: symptom.description,
        triggers: symptom.triggers,
      });

      if (intake?.deduped) {
        console.log(`ℹ️ Reused existing network case for ${symptom.patientId}`);
      }
    }
  });

  // Agent message
  simulator.on('agent:message', (data) => {
    io.emit('patient:agent:message', data);
  });

  simulator.on('agent:patient_reply', (data) => {
    io.emit('patient:agent:patient_reply', data);
  });

  simulator.on('investigation:updated', (data) => {
    io.emit('patient:investigation:updated', data);
  });

  simulator.on('investigation:evidence', (data) => {
    io.emit('patient:investigation:evidence', data);
  });

  simulator.on('investigation:escalation', (data) => {
    io.emit('patient:investigation:escalation', data);
  });

  // Agent response
  simulator.on('agent:response', (data) => {
    io.emit('patient:agent:response', data);
  });

  // Patient state changed
  simulator.on('patient:stateChanged', (data) => {
    io.emit('patient:stateChanged', data);
  });

  simulator.on('patient:timeline', (data) => {
    io.emit('patient:timeline', data);
  });

  // Simulation started/stopped
  simulator.on('simulation:started', (data) => {
    io.emit('simulation:started', data);
  });

  simulator.on('simulation:stopped', () => {
    io.emit('simulation:stopped');
  });

  // ============================================
  // DOCTOR PORTAL EVENTS → WEBSOCKET
  // ============================================

  // Access granted
  portal.on('access:granted', (grant) => {
    io.emit('doctor:access:granted', grant);
    // Backward compatibility alias (remove after one sprint).
    io.emit('doctor:accessGranted', grant);
  });

  portal.on('access:requested', (request) => {
    io.emit('doctor:access:requested', request);
    // Backward compatibility alias (remove after one sprint).
    io.emit('doctor:accessRequested', request);
  });

  portal.on('access:approved', (payload) => {
    io.emit('doctor:access:approved', payload);
    // Backward compatibility alias (remove after one sprint).
    io.emit('doctor:accessApproved', payload);
  });

  portal.on('access:denied', (request) => {
    io.emit('doctor:access:denied', request);
    // Backward compatibility alias (remove after one sprint).
    io.emit('doctor:accessDenied', request);
  });

  // Access revoked
  portal.on('access:revoked', (data) => {
    io.emit('doctor:access:revoked', data);
  });

  portal.on('access:expired', (grant) => {
    io.emit('doctor:access:expired', grant);
  });

  portal.on('alert:new', (alert) => {
    io.emit('alert:new', alert);
  });

  // Alert acknowledged
  portal.on('alert:acknowledged', (data) => {
    io.emit('alert:acknowledged', data);
  });

  // Report generated
  portal.on('report:generated', (report) => {
    io.emit('doctor:report:generated', report);
  });

  // Consultation message
  portal.on('consultation:message', (data) => {
    io.emit('doctor:consultation:message', data);
  });

  portal.on('access:audit', (event) => {
    io.emit('doctor:access:audit', event);
  });

  receiptStore.on('receipt:new', (receipt) => {
    io.emit('cre:receipt', receipt);
  });

  if (network.isEnabled()) {
    network.on('professional:registered', (profile) => {
      io.emit('network:professional:registered', profile);
    });

    network.on('case:created', (caseRecord) => {
      io.emit('network:case:created', caseRecord);
    });

    network.on('case:validated', (caseRecord) => {
      io.emit('network:case:validated', caseRecord);
    });

    network.on('task:created', (task) => {
      io.emit('network:task:created', task);
    });

    network.on('task:claimed', (task) => {
      io.emit('network:task:claimed', task);
    });

    network.on('task:submitted', (task) => {
      io.emit('network:task:submitted', task);
      io.emit('network:task:validated', task);
    });

    network.on('task:approved', (task) => {
      io.emit('network:task:approved', task);
      io.emit('network:task:validated', task);
    });

    network.on('payout:issued', (payout) => {
      io.emit('network:payout:issued', payout);
    });
  }

  // ============================================
  // CLIENT CONNECTION HANDLING
  // ============================================

  io.on('connection', (socket) => {
    console.log('🟢 Client connected:', socket.id);

    // Send initial state
    socket.emit('init', {
      simulationRunning: simulator.isSimulationRunning(),
      doctors: portal.getAllDoctors(),
      receipts: receiptStore.getReceipts({ limit: 10 }),
      accessRequests: portal.getAccessRequests({ limit: 20 }),
      timelines: simulator.getAllPatientTimelines(),
      investigations: simulator.getAllInvestigations(3),
      network: network.isEnabled() ? network.getSnapshot(20) : null,
    });

    // Handle client requests
    socket.on('simulation:start', (data) => {
      simulator.start({
        speed: data?.speed || 1,
        deterministicMode: data?.deterministicMode,
        seed: data?.seed,
      });
    });

    socket.on('simulation:stop', () => {
      simulator.stop();
    });

    socket.on('simulation:speed', (data) => {
      simulator.start({
        speed: data?.speed || 1,
        deterministicMode: data?.deterministicMode,
        seed: data?.seed,
      });
    });

    // Doctor actions
    socket.on('doctor:requestAccess', async (data) => {
      const result = portal.requestAccess(
        data.doctorId,
        data.patientId,
        data.duration,
        data.requestedQueries
      );
      socket.emit('doctor:accessRequestResult', result);
    });

    socket.on('doctor:decideAccess', async (data) => {
      try {
        const result = portal.decideAccessRequest(data);
        socket.emit('doctor:accessDecisionResult', { success: true, data: result });
      } catch (error: any) {
        socket.emit('doctor:accessDecisionResult', { success: false, error: error.message });
      }
    });

    socket.on('doctor:consult', async (data) => {
      try {
        const result = await portal.sendConsultationMessage(
          data.doctorId,
          data.patientId,
          data.message
        );
        socket.emit('doctor:consultResult', { success: true, data: result });
      } catch (error: any) {
        socket.emit('doctor:consultResult', { success: false, error: error.message });
      }
    });

    socket.on('doctor:acknowledgeAlert', (data) => {
      portal.acknowledgeAlert(data.alertId, data.doctorId);
    });

    // Patient agent query
    socket.on('patient:queryAgent', async (data) => {
      const { getAgentService } = await import('../agent/AgentService');
      const agentService = getAgentService();
      
      try {
        const result = await agentService.queryPatient(
          data.patientId,
          data.query,
          data.context,
          data.provider
        );
        const payload = {
          patientId: data.patientId,
          query: data.query,
          response: result.response,
          latency: result.latency,
          timestamp: result.timestamp,
          provider: result.provider,
          status: result.status,
          id: result.id,
        };
        socket.emit('patient:agent:response', payload);
        socket.emit('patient:agentResponse', payload);
      } catch (error: any) {
        const payload = {
          patientId: data.patientId,
          query: data.query,
          response: '',
          latency: 0,
          timestamp: Date.now(),
          error: error.message,
        };
        socket.emit('patient:agent:response', payload);
        socket.emit('patient:agentResponse', payload);
      }
    });

    socket.on('disconnect', () => {
      console.log('🔴 Client disconnected:', socket.id);
    });
  });

  console.log('✅ WebSocket handlers initialized');
}

// ============================================
// DEMO WEBSOCKET HANDLERS
// ============================================

export function setupDemoWebSocketHandlers(io: SocketIOServer): void {
  const orchestrator = getDemoOrchestrator();

  // Demo events
  orchestrator.on('demo:started', (data) => {
    io.emit('demo:started', data);
  });

  orchestrator.on('demo:stopped', () => {
    io.emit('demo:stopped');
  });

  orchestrator.on('demo:dayComplete', (data) => {
    io.emit('demo:dayComplete', data);
  });

  orchestrator.on('demo:symptomProgression', (data) => {
    io.emit('demo:symptomProgression', data);
  });

  orchestrator.on('demo:agentConcern', (data) => {
    io.emit('demo:agentConcern', data);
  });

  orchestrator.on('demo:doctorEscalation', (data) => {
    io.emit('demo:doctorEscalation', data);
  });

  // Client demo control
  io.on('connection', (socket) => {
    socket.on('demo:start', () => {
      orchestrator.start();
    });

    socket.on('demo:stop', () => {
      orchestrator.stop();
    });

    socket.on('demo:status', () => {
      socket.emit('demo:status', orchestrator.getDemoStatus());
    });
  });

  console.log('✅ Demo WebSocket handlers initialized');
}
