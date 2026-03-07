# 🚀 MedGuardian Setup Guide

> **Complete setup instructions for the privacy-preserving health data simulation**

---

## 📋 Prerequisites

- **Node.js 20+**
- **npm** or **yarn**
- **Git**
- **API Keys** (at least one):
  - Gemini API Key: https://ai.google.dev
  - OpenAI API Key: https://platform.openai.com
  - Anthropic API Key: https://console.anthropic.com
  - OR Local LLM (Ollama): https://ollama.ai

---

## 🎨 Step 1: Download Kenney Assets

### Download these asset packs:

1. **Space Kit** → Medical centers, CRE nexus
   - https://kenney.nl/assets/space-kit

2. **Tower Defense Kit** → Blockchain tower
   - https://kenney.nl/assets/tower-defense-kit

3. **City Kit Suburban** → Patient homes
   - https://kenney.nl/assets/city-kit-suburban

4. **Particle Pack** → Data flow effects
   - https://kenney.nl/assets/particle-pack

### Extract assets:

```bash
# Create directories
mkdir -p medguardian/frontend/public/kenney/{space-kit,tower-defense,city-kit,particles}

# Extract downloaded ZIPs to respective directories
# Example:
unzip kenney_space-kit.zip -d medguardian/frontend/public/kenney/space-kit/
unzip kenney_tower-defense.zip -d medguardian/frontend/public/kenney/tower-defense/
unzip kenney_city-kit-suburban.zip -d medguardian/frontend/public/kenney/city-kit/
unzip kenney_particle-pack.zip -d medguardian/frontend/public/kenney/particles/
```

---

## 🔧 Step 2: Install Dependencies

### Install all project dependencies:

```bash
cd medguardian

# Install contract dependencies
cd contracts && npm install && cd ..

# Install CRE workflow dependencies
cd cre-workflows && npm install && cd ..

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

---

## 🔐 Step 3: Configure Environment

### Backend Configuration:

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys
```

**Required in `.env`:**
```env
# At least one of these:
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Or use local LLM (Ollama)
LOCAL_LLM_URL=http://localhost:11434
DEFAULT_LLM_PROVIDER=gemini
LLM_FALLBACK_ORDER=gemini,openai,anthropic,local
GEMINI_MODEL_CHAT=gemini-2.0-flash
GEMINI_MODEL_REPORT=gemini-1.5-pro

# Optional for full simulation
ETHEREUM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Frontend Configuration:

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your settings
```

---

## 🧠 Step 4: Setup Local LLM (Optional)

If using Ollama for local LLM:

```bash
# Install Ollama
# macOS: brew install ollama
# Linux: curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama2
ollama pull mistral

# Start Ollama server
ollama serve
```

---

## ✅ Step 5: Verify Setup

### Check LLM Providers:

```bash
cd backend
npm run agent:check
```

Expected output:
```
🔍 Checking LLM Provider Availability...

Available Providers:
═══════════════════════════════════════
  openai       ✅ Available
  gemini       ✅ Available
  anthropic    ❌ Unavailable
  local        ✅ Available

Active Providers: gemini, openai, local

🧪 Testing query with first available provider...

Response:
─────────────────────────────────────
Hey! I'm doing pretty well today. My glucose...
─────────────────────────────────────

Latency: 842ms
Provider: gemini
Model: gemini-2.0-flash
```

---

## 🚀 Step 6: Start Development

### Start all services:

```bash
# Terminal 1: Backend
cd medguardian/backend
npm run dev

# Terminal 2: Frontend
cd medguardian/frontend
npm run dev
```

### Access the application:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **API Docs**: http://localhost:4000/api/agents/providers

---

## 🎮 Using the Simulation

### Main Dashboard:

1. **Patient Roster** (Left sidebar)
   - See 4 simulated patients
   - Real-time vital signs
   - Connection status

2. **3D Visualization** (Center)
   - Patient homes with Kenney assets
   - Data flow particles
   - CRE nexus animation
   - Blockchain tower

3. **System Status** (Right sidebar)
   - Chainlink CRE status
   - Blockchain events
   - Active alerts

### Controls:

| Button | Action |
|--------|--------|
| **Start** | Begin simulation |
| **Pause** | Pause simulation |
| **Reset** | Reset to initial state |
| **Speed** | 1x, 2x, 5x, 10x simulation speed |

### Interacting with Agents:

Click on any patient to:
- View detailed vitals
- Chat with their AI agent
- See health history
- Grant doctor access

---

## 🔄 Switching LLM Providers

### Via UI:
The simulation dashboard will have a provider selector dropdown.

### Via API:

```bash
# Check available providers
curl http://localhost:4000/api/agents/providers

# Set default provider
curl -X POST http://localhost:4000/api/agents/providers/default \
  -H "Content-Type: application/json" \
  -d '{"provider": "anthropic"}'

# Query specific patient with specific provider
curl -X POST http://localhost:4000/api/agents/query \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "sarah",
    "query": "How are you feeling?",
    "provider": "local"
  }'
```

---

## 📊 Project Structure

```
medguardian/
│
├── 📂 contracts/               # Solidity smart contracts
│   ├── HealthAccessControl.sol
│   └── deploy/
│
├── 📂 cre-workflows/           # Chainlink CRE workflows
│   ├── src/workflows/
│   │   ├── healthDataIngestion.ts
│   │   ├── reportGeneration.ts
│   │   └── doctorAccess.ts
│   └── workflow.yaml
│
├── 📂 backend/                 # Node.js backend
│   ├── src/
│   │   ├── services/agent/
│   │   │   ├── LLMService.ts       # Multi-LLM support
│   │   │   └── AgentService.ts     # Patient agents
│   │   └── routes/
│   └── scripts/check-llm-providers.ts
│
├── 📂 frontend/                # Next.js + Three.js
│   ├── src/
│   │   ├── components/
│   │   │   └── dashboard/
│   │   ├── store/simulationStore.ts
│   │   └── lib/patients.ts
│   └── public/kenney/          # Game assets
│
├── 📄 SIMULATION-DESIGN.md     # Full design document
├── 📄 ASSETS-GUIDE.md          # Kenney assets guide
└── 📄 SETUP-GUIDE.md           # This file
```

---

## 🔥 Features Implemented

### ✅ Patient Agents
- 4 unique simulated patients
- AI-powered conversations
- Personality-based responses
- Real-time vital generation

### ✅ Multi-LLM Support
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3)
- Local LLM (Ollama, llama.cpp)
- Automatic fallback

### ✅ 3D Visualization
- Three.js scene
- Kenney game assets
- Data flow particles
- Real-time animations

### ✅ Chainlink CRE
- HTTP Triggers
- Confidential HTTP
- Cron Triggers
- EVM Write capabilities

### ✅ Smart Contracts
- HealthAccessControl.sol
- IReceiver implementation
- Access control
- Audit logging

---

## 🐛 Troubleshooting

### Issue: LLM providers unavailable
```bash
# Check your API keys
npm run agent:check

# Verify environment variables
cat backend/.env
```

### Issue: Three.js assets not loading
```bash
# Check assets directory
ls frontend/public/kenney/

# Ensure GLB files are present
find frontend/public/kenney -name "*.glb" -o -name "*.gltf"
```

### Issue: Backend won't start
```bash
# Check if port 4000 is available
lsof -i :4000

# Kill existing process
kill $(lsof -t -i:4000)
```

### Issue: Frontend build errors
```bash
# Clear cache
rm -rf frontend/.next
rm -rf frontend/node_modules

# Reinstall
cd frontend && npm install
```

---

## 📚 Additional Resources

- **Kenney Assets**: https://kenney.nl/assets
- **OpenAI API**: https://platform.openai.com
- **Anthropic API**: https://console.anthropic.com
- **Ollama**: https://ollama.ai
- **Three.js**: https://threejs.org/docs
- **Chainlink CRE**: https://docs.chain.link/cre

---

## 🤝 Need Help?

1. Check the design document: `SIMULATION-DESIGN.md`
2. Review assets guide: `ASSETS-GUIDE.md`
3. Run diagnostics: `npm run agent:check`

---

**Ready to build the future of privacy-preserving healthcare!** 🚀
