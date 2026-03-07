# Frontend Integration Prompt for Opus

## Backend Status
✅ **Ready at**: `http://100.121.184.92:4000`

## What You Can Use Now

### 1. 3D Scene Integration
- **Patient Homes**: `/assets/models/PatientHome3D.glb`
- **Medical Center**: `/assets/models/MedicalCenter3D.glb`
- **Characters**: Kenney blocky characters via FBX
- **Privacy Flow Visualization**: Show data encryption stages

### 2. WebSocket Events (Real-time)
```javascript
const socket = io('http://100.121.184.92:4000');

// Demo events
socket.on('demo:started', ({ speed }) => console.log('144x speed'));
socket.on('demo:dayComplete', ({ day }) => updateDayCounter(day));
socket.on('demo:symptomProgression', (data) => showSymptom(data));
socket.on('demo:doctorEscalation', (data) => showEscalation(data));

// Vitals (every 5s)
socket.on('patient:vitals', (vitals) => updateChart(vitals));

// Alerts
socket.on('alert:new', (alert) => showNotification(alert));

// Autonomous Arc loop (new)
socket.on('patient:agent:message', (data) => {
  // Agent -> patient investigation prompt
});
socket.on('patient:agent:patient_reply', (data) => {
  // Simulated patient reply -> agent
});
```

### 3. REST API
```bash
# Start the compressed timeline demo (10 min = 1 day)
POST /api/demo/start

# Get current status
GET /api/demo/status

# Get patient conditions with progression schedules
GET /api/demo/conditions

# Get active alerts
GET /api/demo/alerts
```

### 4. DemoOrchestrator Features

**Time Compression**: 144x speed (10 real minutes = 1 simulated day)

**4 Hard-to-Track Patients**:
| Patient | Condition | Key Challenge |
|---------|-----------|---------------|
| Sarah | Brittle Diabetes | Unpredictable glucose swings, dawn phenomenon |
| Robert | Masked Hypertension | Normal at clinic, high at home + sleep apnea |
| Emma | Long COVID | POTS, cognitive fog, PEM crashes |
| Michael | Paroxysmal AFib | Intermittent episodes, hard to catch |

**Symptom Progression**: Pre-programmed schedules (see DEMO-INTEGRATION.md)

**LLM Agents**: Multi-provider (OpenAI, Anthropic, Ollama) - agents don't know it's a simulation

### 5. Privacy Visualization to Build

Show this data flow in the 3D scene:
```
1. Wearable (plaintext vitals)
   ↓ encrypted
2. Gateway (TLS)
   ↓ 
3. CRE TEE (Chainlink Confidential)
   ↓ hash only
4. Blockchain (immutable record)
   ↓ authorized query
5. Doctor Dashboard (decrypted view)
```

Visual elements:
- Lock icons during encryption
- Flowing particle effects for data movement
- Color coding: Green (secure) → Yellow (processing) → Blue (verified)

### 6. Doctor Portal Components

**Access Control Panel**:
- Request access → Auto-approve if specialty matches
- Grant expiration timer (24-48 hours)
- Blockchain hash verification

**Alert Dashboard**:
- Severity levels: info → low → medium → high → critical
- Acknowledge/resolve actions
- Audit trail (who, when, what)

**Patient Timeline**:
- Day-by-day symptom progression
- Vital signs trends
- Agent concern messages
- Doctor intervention points

### 7. Quick Test
```javascript
// Test connection
fetch('http://100.121.184.92:4000/health')
  .then(r => r.json())
  .then(console.log);

// Start demo
fetch('http://100.121.184.92:4000/api/demo/start', { method: 'POST' });
```

### 8. Feature Flags (New)
```bash
# Backend
AGENT_MODE=akasha
MED_AKASHA_BLUEPRINT_DIR=../med-akasha-blueprint

# Frontend
NEXT_PUBLIC_ARC_VIEW_MODE=diagram  # or 3d
```

## Files Created
- `/backend/src/services/demo/DemoOrchestrator.ts` - Time compression & progression
- `/backend/src/services/doctor/DoctorPortal.ts` - Access control & alerts  
- `/backend/src/services/simulation/PatientSimulator.ts` - Vitals & symptoms
- `/backend/src/services/agent/AgentService.ts` - Multi-LLM agents
- `/backend/src/routes/demo.ts` - REST API
- `/backend/src/services/websocket/index.ts` - Real-time events
- `/DEMO-INTEGRATION.md` - Full documentation

## Next Steps for Frontend
1. Load 3D assets (GLB/FBX)
2. Connect WebSocket
3. Build patient home scenes
4. Build doctor dashboard
5. Add privacy flow visualization
6. Integrate with demo orchestrator

## Environment
- VPS IP: 100.121.184.92
- Backend: Port 4000
- Frontend: Port 3333 (your Next.js app)
