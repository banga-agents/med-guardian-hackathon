# Demo Orchestrator Integration Guide

## Overview

The DemoOrchestrator manages a compressed timeline simulation where **10 real minutes = 1 simulated day**. This allows observing patient health progression and doctor interventions in a realistic but accelerated timeframe.

## Time Compression

| Real Time | Simulated Time | Events |
|-----------|---------------|--------|
| 0 min | Day 1 Morning | Demo starts, patients begin activities |
| 2.5 min | Day 1 Noon | First symptom checks |
| 5 min | Day 2 | Overnight symptom progression |
| 10 min | Day 3 | Pattern recognition triggers |
| 20 min | Day 5 | Doctor escalations begin |
| 30 min | Day 7 | Full cycle complete |

## Patient Conditions & Progression

### Sarah - Type 1 Diabetes with Brittle Control

**Hard-to-track aspects:** Unpredictable glucose swings, dawn phenomenon, gastroparesis

| Day | Symptom | Severity | Triggers |
|-----|---------|----------|----------|
| 1 | Morning glucose elevated | 2/5 | Dawn phenomenon |
| 3 | Consistent dawn spikes | 3/5 | Hormonal fluctuations |
| 5 | Severe dawn spikes, fatigue | 4/5 | Stress, irregular sleep |
| 2-4 | Slow meal digestion | 2-3/5 | Gastroparesis |
| 6 | Vomiting, can't keep food | 5/5 | Severe gastroparesis |

**Doctor Decision:** CGM prescription, adjust basal insulin to 3 AM

### Robert - Resistant Hypertension with Sleep Apnea

**Hard-to-track aspects:** Masked hypertension (normal at clinic, high at home), undiagnosed sleep apnea

| Day | Symptom | Severity | Triggers |
|-----|---------|----------|----------|
| 1 | BP normal clinic, high home | 2/5 | White coat reverse |
| 4 | Evening BP elevated | 3/5 | Work stress, salt |
| 6 | Morning headaches | 4/5 | Undiagnosed OSA |
| 2-5 | Unrefreshed sleep, snoring | 2-4/5 | Airway obstruction |
| 7 | Microsleeps during meetings | 5/5 | Severe OSA |

**Doctor Decision:** 24h ambulatory BP monitoring, sleep study

### Emma - Long COVID with Dysautonomia

**Hard-to-track aspects:** POTS, cognitive fog, PEM (post-exertional malaise)

| Day | Symptom | Severity | Triggers |
|-----|---------|----------|----------|
| 1-2 | Dizziness on standing | 2-3/5 | Orthostatic intolerance |
| 4 | Heart racing on standing | 4/5 | Blood pooling |
| 6 | Can't stand >5 minutes | 5/5 | Severe POTS |
| 1-3 | Word-finding difficulty | 2-3/5 | Mental exertion |
| 5-7 | Memory gaps, getting lost | 4-5/5 | Cerebral hypoperfusion |
| 2-8 | PEM crash cycle | 3-5/5 | Overexertion |

**Doctor Decision:** Tilt table test, increase fluids/salt

### Michael - Paroxysmal Atrial Fibrillation

**Hard-to-track aspects:** Intermittent episodes, hard to catch on monitors

| Day | Symptom | Severity | Triggers |
|-----|---------|----------|----------|
| 2-3 | Brief fluttering, 5min palpitations | 2-3/5 | PACs, alcohol |
| 5-6 | Sustained rapid irregular HR | 4-5/5 | Vagal response, AF with RVR |
| 1-4 | Silent episodes (asymptomatic) | 1-2/5 | Undetected AF |
| 7 | Device detects silent AF | 3/5 | Continuous monitoring |

**Doctor Decision:** 30-day event monitor, anticoagulation (Apixaban)

## WebSocket Events

### Demo Events
```javascript
// Demo started
socket.on('demo:started', (data) => {
  console.log('Demo speed:', data.simulatedSpeed); // 144x
  console.log('Day duration:', data.dayDurationMinutes); // 10 min
});

// Day completed
socket.on('demo:dayComplete', (data) => {
  console.log('Day:', data.day);
  console.log('Real time elapsed (ms):', data.realTimeElapsed);
});

// Symptom progression
socket.on('demo:symptomProgression', (data) => {
  console.log('Patient:', data.patientId);
  console.log('Type:', data.type); // e.g., 'dawn_phenomenon'
  console.log('Severity:', data.severity); // 1-5
  console.log('Description:', data.description);
  console.log('Triggers:', data.triggers);
  console.log('Simulated day:', data.simulatedDay);
});

// Agent expresses concern
socket.on('demo:agentConcern', (data) => {
  console.log('Patient:', data.patientId);
  console.log('Query:', data.query); // What patient asked
  console.log('Response:', data.response); // LLM response
  console.log('Symptom:', data.symptom);
  console.log('Severity:', data.severity);
});

// Doctor escalation
socket.on('demo:doctorEscalation', (data) => {
  console.log('Patient:', data.patientId);
  console.log('Doctor:', data.doctorId);
  console.log('Condition:', data.condition);
  console.log('Decisions:', data.decisions); // Array of recommended actions
  console.log('Day:', data.dayOfSimulation);
});
```

### Existing Events
```javascript
// Vitals update (every 5s)
socket.on('patient:vitals', (vitals) => {
  console.log(vitals.patientId, vitals.heartRate, vitals.bloodPressure);
});

// Symptom reported
socket.on('patient:symptom', (symptom) => {
  console.log(symptom.patientId, symptom.type, symptom.severity);
});

// New alert
socket.on('alert:new', (alert) => {
  console.log(alert.title, alert.severity, alert.patientId);
});

// Access granted
socket.on('doctor:access:granted', (grant) => {
  console.log('Doctor:', grant.doctorId);
  console.log('Patient:', grant.patientId);
  console.log('Expires:', grant.expiresAt);
});
```

## REST API

### Start Demo
```bash
POST /api/demo/start
```

### Stop Demo
```bash
POST /api/demo/stop
```

### Get Status
```bash
GET /api/demo/status

Response:
{
  "demo": {
    "isRunning": true,
    "currentDay": 3,
    "speed": 144
  },
  "activeAlerts": 5,
  "activeGrants": 2,
  "patients": [...]
}
```

### Get Patient Conditions
```bash
GET /api/demo/conditions

Response:
[
  {
    "id": "sarah",
    "condition": "Type 1 Diabetes with Brittle Control",
    "description": "Unpredictable blood sugar swings...",
    "hardToTrack": true,
    "symptomPatterns": [...]
  }
]
```

### Get Active Alerts
```bash
GET /api/demo/alerts
```

### Resolve Alert
```bash
POST /api/demo/alerts/:id/resolve
```

### Manual Escalation (Testing)
```bash
POST /api/demo/escalate
{
  "patientId": "sarah",
  "doctorId": "dr_rodriguez"
}
```

## Frontend Integration

### 1. Connect to WebSocket
```javascript
import { io } from 'socket.io-client';

const socket = io('http://100.121.184.92:4000');

socket.on('connect', () => {
  console.log('Connected to demo');
});
```

### 2. Start Demo
```javascript
// Via WebSocket
socket.emit('demo:start');

// Or via REST
fetch('http://100.121.184.92:4000/api/demo/start', { method: 'POST' });
```

### 3. Listen for Events
```javascript
// Timeline visualization
socket.on('demo:dayComplete', ({ day }) => {
  updateTimeline(day);
});

// Symptom indicators
socket.on('demo:symptomProgression', (symptom) => {
  addSymptomToChart(symptom);
  if (symptom.severity >= 4) {
    showAlert(symptom);
  }
});

// Doctor dashboard updates
socket.on('demo:doctorEscalation', (escalation) => {
  updateDoctorDashboard(escalation);
});
```

### 4. Privacy Visualization

When showing data flow, emphasize these stages:

1. **Wearable** (plaintext) - Patient's watch/band
2. **Encrypted Transmission** - TLS/HTTPS
3. **CRE TEE** (Processing) - Chainlink Confidential Runtime Environment
4. **Blockchain** (Hash only) - Report hash stored
5. **Doctor View** (decrypted) - Authorized access only

### 5. Audit Trail

Every access is logged:
```javascript
socket.on('doctor:access:granted', (grant) => {
  addToAuditTrail({
    type: 'access_granted',
    doctor: grant.doctorId,
    patient: grant.patientId,
    timestamp: grant.grantedAt,
    txHash: grant.blockchainHash // if blockchain enabled
  });
});
```

## LLM Agent Behavior

The patient agents are prompted to:
- **NOT know it's a simulation** - They believe they are real patients
- Express genuine concern about symptoms
- Use natural language, not clinical terms
- Show personality traits (optimistic, anxious, etc.)
- Escalate when severity >= 3

Example agent concern:
> "This is the third day I've felt nauseous after meals. It seems to be getting worse and I'm worried it might be affecting my blood sugar control. Should I contact my endocrinologist?"

## Demo Flow (30 minutes)

| Time | Phase | What Happens |
|------|-------|--------------|
| 0:00 | Setup | Introduce patients, show 3D scene |
| 0:30 | Start | Begin simulation, vitals flowing |
| 2:00 | Day 1 | First symptoms appear |
| 5:00 | Day 2 | Pattern emerges (e.g., dawn phenomenon) |
| 10:00 | Day 3 | Agent expresses concern |
| 12:00 | Day 4 | Alert severity increases |
| 15:00 | Day 5 | Doctor access requested |
| 17:00 | Day 5 | Access granted, doctor reviews data |
| 20:00 | Day 6 | Clinical decisions displayed |
| 25:00 | Day 7 | Resolution or ongoing management |
| 30:00 | Conclusion | Summary of privacy features |

## Environment

- **Backend**: http://100.121.184.92:4000
- **WebSocket**: ws://100.121.184.92:4000
- **Frontend**: http://100.121.184.92:3333 (Next.js)

## LLM Providers Available

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Ollama (Local Llama2)

Set `DEFAULT_LLM_PROVIDER` env var or pass in API calls.
