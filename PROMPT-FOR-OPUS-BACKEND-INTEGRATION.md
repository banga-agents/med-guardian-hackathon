# 🎯 PROMPT FOR CLAUDE 3 OPUS - Backend Integration

> **Wire the Frontend to the Real Backend Services**

---

## 📋 CONTEXT

The backend is now **COMPLETE** and running. You need to wire the frontend to use real data from the backend instead of mock data.

**Backend URL:** `http://100.121.184.92:4000`  
**WebSocket:** `ws://100.121.184.92:4000`

---

## ✅ BACKEND SERVICES NOW READY

### 1. 🤖 AI Agent System (Multi-LLM)
- **OpenAI GPT-4**, **Anthropic Claude**, **Local LLM (Ollama)**
- 4 patient agents with unique personalities
- Real-time chat with patient agents
- Health report generation

### 2. 📊 Patient Simulation Engine
- **Generates vitals every 5 seconds** for all 4 patients
- Smart vital signs based on activity (sleeping, exercising, working)
- Sarah has diabetes → glucose varies
- Michael has heart condition → arrhythmia detection
- Symptoms auto-generate based on conditions

### 3. 👨‍⚕️ Doctor Portal
- **4 Doctors**: Dr. Chen (Cardiology), Dr. Rodriguez (Endocrinology), Dr. Patel (Neurology), Dr. Smith (General)
- Access control with time-limited grants (auto-expire)
- Health report generation with AI analysis
- Real-time consultations
- Alert management

---

## 🔌 API ENDPOINTS (All Working)

### Health Check
```bash
GET /health
```

### Agents
```bash
# Get available LLM providers
GET /api/agents/providers

# Query a patient agent
POST /api/agents/query
Body: {
  "patientId": "sarah" | "robert" | "emma" | "michael",
  "query": "How are you feeling?",
  "provider": "openai" | "anthropic" | "local" (optional)
}

# Generate AI health report
POST /api/agents/report
Body: {
  "patientId": "sarah",
  "healthData": { vitals, symptoms, period },
  "provider": "openai" (optional)
}
```

### Simulation Control
```bash
# Start simulation
POST /api/simulation/start
Body: { "speed": 1 } // 1x, 2x, 5x, 10x

# Stop simulation
POST /api/simulation/stop

# Get simulation status
GET /api/simulation/status

# Get patient vitals
GET /api/simulation/patients/:patientId/vitals

# Get patient state
GET /api/simulation/patients/:patientId/state
```

### Doctor Portal
```bash
# List all doctors
GET /api/doctors

# Get doctor info
GET /api/doctors/:doctorId

# Get doctor's patients
GET /api/doctors/:doctorId/patients

# Get doctor's alerts
GET /api/doctors/:doctorId/alerts

# Request patient access
POST /api/doctors/access/request
Body: {
  "doctorId": "dr_chen",
  "patientId": "sarah",
  "duration": 24, // hours
  "requestedQueries": ["vitals", "symptoms", "reports"]
}

# Generate health report
GET /api/doctors/:doctorId/patients/:patientId/report
Query: ?start=timestamp&end=timestamp

# Send consultation message
POST /api/doctors/:doctorId/patients/:patientId/consult
Body: { "message": "How is your chest pain?" }

# Acknowledge alert
POST /api/doctors/alerts/:alertId/acknowledge
Body: { "doctorId": "dr_chen" }
```

---

## 🔄 WEBSOCKET EVENTS (Real-time)

### Connect to WebSocket
```typescript
import { io } from 'socket.io-client';

const socket = io('http://100.121.184.92:4000');
```

### Server → Client Events (Listen for these)

```typescript
// New vital signs (every 5 seconds)
socket.on('patient:vitals', (vitals: {
  patientId: string;
  timestamp: number;
  heartRate: number;
  bloodPressure?: { systolic: number; diastolic: number };
  bloodGlucose?: number; // Only for Sarah
  oxygenSaturation?: number;
}) => {
  // Update patient vitals in UI
});

// Symptom reported
socket.on('patient:symptom', (symptom: {
  id: string;
  patientId: string;
  type: string;
  severity: 1-5;
  description: string;
  timestamp: number;
}) => {
  // Show symptom notification
  // If severity >= 4, show critical alert
});

// Agent proactive message
socket.on('patient:agent:message', (data: {
  patientId: string;
  message: string;
  trigger: string;
  timestamp: number;
}) => {
  // Show AI agent message in chat
});

// Agent response to query
socket.on('patient:agent:response', (data: {
  patientId: string;
  query: string;
  response: string;
  latency: number;
  timestamp: number;
}) => {
  // Show agent response in chat
});

// Patient state changed (sleeping, working, exercising)
socket.on('patient:stateChanged', (data: {
  patientId: string;
  state: 'sleeping' | 'active' | 'working' | 'exercising' | 'eating' | 'resting';
}) => {
  // Update patient state indicator
});

// New alert for doctors
socket.on('alert:new', (alert: {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  patientId: string;
  title: string;
  message: string;
  timestamp: number;
}) => {
  // Show alert in alerts panel
  // Play sound if critical
});

// Access granted to doctor
socket.on('doctor:access:granted', (grant: {
  doctorId: string;
  patientId: string;
  grantedAt: number;
  expiresAt: number;
  allowedQueries: string[];
}) => {
  // Update doctor's patient list
});

// Access revoked
socket.on('doctor:access:revoked', (data: {
  doctorId: string;
  patientId: string;
}) => {
  // Remove patient from doctor's list
});

// Health report generated
socket.on('doctor:report:generated', (report: {
  id: string;
  patientId: string;
  generatedAt: number;
  summary: string;
  insights: string[];
  recommendations: string[];
  riskFlags: string[];
}) => {
  // Show report notification
});

// Doctor status changed
socket.on('doctor:statusChanged', (data: {
  doctorId: string;
  isOnline: boolean;
}) => {
  // Update doctor online indicator
});

// Simulation events
socket.on('simulation:started', (data: { speed: number }) => {
  // Update UI to show running state
});

socket.on('simulation:stopped', () => {
  // Update UI to show stopped state
});
```

### Client → Server Events (Emit these)

```typescript
// Start simulation
socket.emit('simulation:start', { speed: 1 });

// Stop simulation
socket.emit('simulation:stop');

// Send consultation message
socket.emit('doctor:consult', {
  doctorId: 'dr_chen',
  patientId: 'sarah',
  message: 'How are you feeling today?'
});

// Acknowledge alert
socket.emit('doctor:acknowledgeAlert', {
  alertId: 'alert-xxx',
  doctorId: 'dr_chen'
});

// Query patient agent
socket.emit('patient:queryAgent', {
  patientId: 'sarah',
  query: 'What did you eat for breakfast?',
  context: { recentVitals: {...} },
  provider: 'openai'
});
```

---

## 🎯 YOUR TASKS

### TASK 1: Create API Client

Create `frontend/src/lib/api.ts`:

```typescript
const API_BASE = 'http://100.121.184.92:4000';

export const api = {
  // Simulation
  startSimulation: (speed = 1) => fetch(`${API_BASE}/api/simulation/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speed })
  }),
  
  stopSimulation: () => fetch(`${API_BASE}/api/simulation/stop`, { method: 'POST' }),
  
  getPatientVitals: (patientId: string) => 
    fetch(`${API_BASE}/api/simulation/patients/${patientId}/vitals`).then(r => r.json()),
  
  // Doctors
  getDoctors: () => fetch(`${API_BASE}/api/doctors`).then(r => r.json()),
  
  getDoctorPatients: (doctorId: string) => 
    fetch(`${API_BASE}/api/doctors/${doctorId}/patients`).then(r => r.json()),
  
  getDoctorAlerts: (doctorId: string) => 
    fetch(`${API_BASE}/api/doctors/${doctorId}/alerts`).then(r => r.json()),
  
  requestAccess: (data: any) => fetch(`${API_BASE}/api/doctors/access/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  consultPatient: (doctorId: string, patientId: string, message: string) => 
    fetch(`${API_BASE}/api/doctors/${doctorId}/patients/${patientId}/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    }).then(r => r.json()),
  
  // Agents
  queryAgent: (patientId: string, query: string) => 
    fetch(`${API_BASE}/api/agents/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, query })
    }).then(r => r.json()),
};
```

### TASK 2: Create WebSocket Hook

Create `frontend/src/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSimulationStore } from '@/store/simulationStore';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useSimulationStore();

  useEffect(() => {
    const socket = io('http://100.121.184.92:4000');
    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Connected to backend');
    });

    socket.on('disconnect', () => {
      console.log('🔴 Disconnected from backend');
    });

    // Initialize state
    socket.on('init', (data) => {
      store.setSimulationRunning(data.simulationRunning);
    });

    // Patient vitals
    socket.on('patient:vitals', (vitals) => {
      store.addVital(vitals);
    });

    // Symptoms
    socket.on('patient:symptom', (symptom) => {
      store.addSymptom(symptom);
    });

    // Agent messages
    socket.on('patient:agent:message', (data) => {
      store.addMessage({
        id: `agent-${Date.now()}`,
        patientId: data.patientId,
        sender: 'patient_agent',
        content: data.message,
        timestamp: data.timestamp,
        aiGenerated: true,
      });
    });

    socket.on('patient:agent:response', (data) => {
      store.completeQuery(data.patientId, data.response, data.latency);
    });

    // State changes
    socket.on('patient:stateChanged', (data) => {
      store.updatePatientState(data.patientId, { state: data.state });
    });

    // Alerts
    socket.on('alert:new', (alert) => {
      store.addAlert(alert);
    });

    // Simulation
    socket.on('simulation:started', (data) => {
      store.setSimulationRunning(true);
      store.setSimulationSpeed(data.speed);
    });

    socket.on('simulation:stopped', () => {
      store.setSimulationRunning(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const emit = (event: string, data?: any) => {
    socketRef.current?.emit(event, data);
  };

  return { socket: socketRef.current, emit };
}
```

### TASK 3: Update Components

#### PatientRoster.tsx
```typescript
// Fetch real vitals from store (populated by WebSocket)
const vitals = useSimulationStore(selectPatientVitals(patientId));

// Show real-time heart rate, BP, glucose
// Highlight if has alerts
```

#### SystemLogs.tsx
```typescript
// Use store.messages for agent conversations
// Use store.vitals for vital logs
// Use store.symptoms for symptom logs

// Auto-scroll to bottom when new entries added
```

#### ActiveAlerts.tsx
```typescript
// Use store.alerts
// Filter by severity (show high/critical only)
// Add acknowledge button that emits WebSocket event
```

#### Dashboard Controls
```typescript
const { emit } = useWebSocket();

// Start button
const handleStart = () => {
  emit('simulation:start', { speed: simulation.speed });
};

// Stop button
const handleStop = () => {
  emit('simulation:stop');
};
```

### TASK 4: Create Doctor View

Create `frontend/src/components/dashboard/DoctorView.tsx`:

```typescript
interface DoctorViewProps {
  doctorId: DoctorId;
}

export function DoctorView({ doctorId }: DoctorViewProps) {
  const [patients, setPatients] = useState<PatientId[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientId | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  
  const { emit } = useWebSocket();

  // Load doctor's patients on mount
  useEffect(() => {
    api.getDoctorPatients(doctorId).then(data => {
      setPatients(data.data.patients);
    });
    
    api.getDoctorAlerts(doctorId).then(data => {
      setAlerts(data.data);
    });
  }, [doctorId]);

  // Handle consultation
  const sendMessage = async () => {
    if (!selectedPatient || !chatMessage) return;
    
    const result = await api.consultPatient(doctorId, selectedPatient, chatMessage);
    
    // Add to chat
    // Show doctor message + agent response
    setChatMessage('');
  };

  return (
    <div className="doctor-view">
      {/* Patient list */}
      {/* Alert list */}
      {/* Chat interface */}
      {/* Access request button */}
    </div>
  );
}
```

### TASK 5: Update Main Page

Modify `frontend/src/app/page.tsx`:

```typescript
'use client';

import { useWebSocket } from '@/hooks/useWebSocket';

export default function SimulationDashboard() {
  const { emit } = useWebSocket(); // Connects to backend
  
  // ... rest of component
}
```

---

## 📊 DATA FLOW

```
┌──────────────────────────────────────────────────────────────┐
│                        DATA FLOW                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   Backend (Port 4000)          Frontend (Port 3000)          │
│   ───────────────────          ───────────────────           │
│                                                               │
│   PatientSimulator ──WebSocket──▶ Zustand Store              │
│   (vitals every 5s)              (real-time state)           │
│        │                              │                      │
│        │                              ▼                      │
│        │                       React Components              │
│        │                       (re-render on change)         │
│        │                              │                      │
│        │                              ▼                      │
│        │                       Dashboard UI                  │
│        │                       (PatientRoster, etc.)         │
│        │                                                     │
│   AgentService ◀──HTTP API──── User Actions                  │
│   (LLM calls)                   (query agent, consult)       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔧 TESTING CHECKLIST

### Backend Connection
- [ ] Frontend connects to WebSocket successfully
- [ ] Can start/stop simulation from UI
- [ ] Vitals appear in real-time (every 5 seconds)

### Patient Roster
- [ ] Shows all 4 patients
- [ ] Vitals update in real-time
- [ ] State changes (sleeping, working, etc.)
- [ ] Alert badges appear for critical patients

### System Logs
- [ ] Shows vital signs as they arrive
- [ ] Shows symptoms when reported
- [ ] Shows agent messages
- [ ] Auto-scrolls to bottom

### Doctor Portal
- [ ] Can view doctors list
- [ ] Can request patient access
- [ ] Can see assigned patients
- [ ] Can chat with patient agents
- [ ] Receives alerts in real-time
- [ ] Can acknowledge alerts

### 3D Visualization
- [ ] Patient homes glow by status
- [ ] Data particles flow
- [ ] Click patient → Show detail

---

## 🚨 IMPORTANT NOTES

1. **CORS is enabled** - Frontend can call backend directly
2. **WebSocket auto-reconnects** - Handle disconnect gracefully
3. **Store is source of truth** - All data flows through Zustand
4. **Use selectors** - Prevent unnecessary re-renders
5. **Handle errors** - Backend might be temporarily unavailable

---

## 📁 FILES TO CREATE/MODIFY

### New Files:
- `frontend/src/lib/api.ts` - API client
- `frontend/src/hooks/useWebSocket.ts` - WebSocket hook
- `frontend/src/components/dashboard/DoctorView.tsx` - Doctor interface

### Modify:
- `frontend/src/app/page.tsx` - Add WebSocket hook
- `frontend/src/components/dashboard/PatientRoster.tsx` - Use real data
- `frontend/src/components/dashboard/SystemLogs.tsx` - Use real data
- `frontend/src/components/dashboard/ActiveAlerts.tsx` - Use real data
- `frontend/src/components/dashboard/BlockchainEvents.tsx` - Use real data
- `frontend/src/components/dashboard/CreStatus.tsx` - Use real data

---

## 💡 TIPS

1. **Start WebSocket first** - Everything flows from there
2. **Use Zustand selectors** - Not `useSimulationStore.getState()`
3. **Handle loading states** - Data takes time to arrive
4. **Throttle rapid updates** - Vitals come every 5s, don't over-render
5. **Test with browser DevTools** - Network tab, WebSocket tab

---

## 🎯 SUCCESS CRITERIA

- ✅ Frontend connects to backend WebSocket
- ✅ Patient vitals stream in real-time
- ✅ Symptoms appear with alerts
- ✅ Can start/stop simulation
- ✅ Can chat with patient agents
- ✅ Doctor portal works end-to-end
- ✅ 3D scene reflects real patient states
- ✅ All data is LIVE, not mock data

---

**The backend is ready and waiting at `http://100.121.184.92:4000`!**

Make the frontend come alive with real data! 🚀
