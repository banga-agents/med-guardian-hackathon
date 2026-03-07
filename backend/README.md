# MedGuardian Backend

Real-time patient simulation engine with AI agents and doctor portal.

## Features

### 🤖 AI Agent System
- Multi-LLM support (OpenAI GPT-4, Anthropic Claude, Local LLMs via Ollama)
- Patient-specific AI agents with unique personalities
- Real-time health consultations
- Proactive health alerts and messaging

### 👨‍⚕️ Doctor Portal
- Access control with time-limited grants
- Health report generation with AI analysis
- Real-time consultations with patient agents
- Alert management and acknowledgment

### 📊 Patient Simulation
- 4 virtual patients with realistic conditions
- Real-time vital sign generation
- Symptom reporting based on conditions
- Daily schedule simulation

### 🔄 Real-time Events
- WebSocket for live updates
- Vitals streaming
- Agent conversations
- Doctor notifications

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm run dev
```

## API Endpoints

### Agents
- `GET /api/agents/providers` - List available LLM providers
- `POST /api/agents/query` - Query a patient agent
- `POST /api/agents/report` - Generate AI health report

### Simulation
- `POST /api/simulation/start` - Start patient simulation
- `POST /api/simulation/stop` - Stop simulation
- `GET /api/simulation/patients/:id/vitals` - Get patient vitals

### Doctors
- `GET /api/doctors` - List all doctors
- `POST /api/doctors/access/request` - Request patient access
- `GET /api/doctors/:id/patients` - Get doctor's patients
- `POST /api/doctors/:id/patients/:id/consult` - Send consultation message

## WebSocket Events

### Client → Server
- `simulation:start` - Start simulation
- `simulation:stop` - Stop simulation
- `doctor:consult` - Send message to patient agent
- `doctor:acknowledgeAlert` - Acknowledge alert

### Server → Client
- `patient:vitals` - New vital signs
- `patient:symptom` - Symptom reported
- `patient:agent:message` - Agent proactive message
- `alert:new` - New alert created
- `doctor:access:granted` - Access approved

## Environment Variables

```env
PORT=4000
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LOCAL_LLM_URL=http://localhost:11434
DEFAULT_LLM_PROVIDER=openai
FRONTEND_URL=http://localhost:3000
```

## Architecture

```
backend/src/
├── services/
│   ├── agent/
│   │   ├── LLMService.ts       # Multi-LLM provider management
│   │   └── AgentService.ts     # Patient AI agents
│   ├── doctor/
│   │   └── DoctorPortal.ts     # Doctor access & consultations
│   ├── simulation/
│   │   └── PatientSimulator.ts # Real-time patient simulation
│   └── websocket/
│       └── index.ts            # WebSocket event handlers
├── routes/
│   ├── agent.ts                # Agent API routes
│   ├── simulation.ts           # Simulation control routes
│   └── doctor.ts               # Doctor portal routes
└── types/
    └── simulation.ts           # TypeScript types
```

## License

MIT
