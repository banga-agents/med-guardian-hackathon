# 🎯 PROMPT FOR CLAUDE 3 OPUS

> **MedGuardian 3D Visualization & UI Implementation**

---

## 📋 PROJECT CONTEXT

You are working on **MedGuardian** - a privacy-preserving health data simulation dashboard for a Chainlink hackathon. The project demonstrates:

- **4 AI Patient Agents** with unique conditions (diabetes, hypertension, long COVID, arrhythmia)
- **Chainlink CRE Workflows** processing health data in secure enclaves
- **Blockchain integration** for immutable audit trails
- **Multi-LLM Support** (OpenAI, Anthropic, Local LLMs)
- **Real-time 3D Visualization** of the entire system

---

## 🎨 ASSETS AVAILABLE

Assets are located at: `/home/agent/chainlink-medpriv/free-assets/`

A copy script exists at: `/home/agent/chainlink-medpriv/medguardian/scripts/copy-assets.sh`

### Asset Inventory:

| Asset Pack | Location | Format | Purpose |
|------------|----------|--------|---------|
| **City Kit Suburban** | `kenney_city-kit-suburban_20/Models/GLB format/` | GLB | Patient homes |
| **CyberCity** | `cybercity/FBX/` | FBX | Medical centers |
| **Blocky Characters** | `kenney_blocky-characters_20/Models/` | GLB | Patient/doctor avatars |
| **UI Pack Space** | `kenney_ui-pack-space-expansion/PNG/` | PNG | Dashboard UI |

### Specific Models:

**Patient Homes (GLB):**
- Sarah: `building-type-f.glb` (Modern, Blue #3498DB)
- Robert: `building-type-a.glb` (Classic, Orange #E67E22)
- Emma: `building-type-k.glb` (Cottage, Purple #9B59B6)
- Michael: `building-type-h.glb` (Single-story, Green #27AE60)

**Medical Centers (FBX):**
- Cardiology: `4_story.fbx` (Red #E74C3C)
- General: `4_story_long.fbx` (Blue #3498DB)
- Neurology: `2story_long.fbx` (Purple #9B59B6)

**Environment:**
- Trees: `tree-small.glb`, `tree-large.glb`
- Paths: `path-short.glb`, `path-long.glb`
- Fences: `fence-1x2.glb`, `fence-2x2.glb`

---

## 🏗️ CURRENT STATE

The project structure exists with:

```
medguardian/frontend/src/
├── app/page.tsx                    ← Main dashboard (exists)
├── components/visualization/
│   ├── Scene3D.tsx                 ← Main 3D scene (exists, needs assets)
│   ├── PatientHome3D.tsx           ← Stub exists
│   ├── MedicalCenter3D.tsx         ← Stub exists
│   ├── CRENexus.tsx                ← Procedural rings (exists)
│   ├── BlockchainTower.tsx         ← Growing blocks (exists)
│   ├── DataFlowParticles.tsx       ← Particle system (exists)
│   └── Environment3D.tsx           ← Needs trees/paths
├── components/dashboard/
│   ├── PatientRoster.tsx           ← NEEDS CREATION
│   ├── SystemLogs.tsx              ← NEEDS CREATION
│   ├── ActiveAlerts.tsx            ← NEEDS CREATION
│   ├── BlockchainEvents.tsx        ← NEEDS CREATION
│   └── CreStatus.tsx               ← NEEDS CREATION
├── store/simulationStore.ts        ← Complete Zustand store
├── lib/assets-config.ts            ← Asset paths defined
└── types/simulation.ts             ← Complete TypeScript types
```

---

## 🎯 YOUR MISSION

### TASK 1: Asset Integration

1. **Run the copy script** to copy assets to public folder:
   ```bash
   cd /home/agent/chainlink-medpriv/medguardian
   ./scripts/copy-assets.sh
   ```

2. **Complete PatientHome3D.tsx:**
   - Load GLB models using `@react-three/drei` `useGLTF`
   - Apply patient-specific colors (blue, orange, purple, green)
   - Add emissive glow for active patients
   - Add red alert ring for critical patients
   - Position according to `SCENE_LAYOUT.patientHomes`
   - Make clickable to select patient

3. **Complete MedicalCenter3D.tsx:**
   - Load FBX models using `FBXLoader` from `three/examples/jsm/loaders/FBXLoader`
   - Apply cyberpunk materials with emissive properties
   - Add rotating beacon light on top
   - Show doctor count indicators (green orbs)
   - Position according to `SCENE_LAYOUT.medicalCenters`

4. **Complete Environment3D.tsx:**
   - Place trees around patient homes (2-3 per home)
   - Place trees around medical centers (4 per center)
   - Add path segments connecting homes to center
   - Add fences as decoration
   - Use instanced meshes for performance

5. **Test the 3D Scene:**
   - All 4 patient homes visible with correct models
   - 3 medical centers visible
   - Trees and paths populate the scene
   - CRE Nexus rotating in center
   - Blockchain tower visible
   - Data particles flowing

---

### TASK 2: Dashboard UI Components

Create these components in `frontend/src/components/dashboard/`:

#### 1. PatientRoster.tsx
```typescript
interface PatientRosterProps {
  onSelectPatient: (patientId: string) => void;
  selectedPatient: string | null;
}
```

**Requirements:**
- Left sidebar panel
- List all 4 patients with:
  - Avatar (colored circle with initial)
  - Name and condition
  - Current vital signs (HR, BP, etc.)
  - Status indicator (online/offline)
  - Alert badge if has critical alerts
- Click to select patient
- Highlight selected patient
- Use Tailwind with dark theme

**Design:**
```
┌─────────────────┐
│ PATIENT ROSTER  │
├─────────────────┤
│ ⭕ Sarah Miller │
│    T1 Diabetes  │
│    HR: 72  🟢   │
├─────────────────┤
│ ⭕ Robert Chen  │
│    Hypertension │
│    BP: 135/85   │
├─────────────────┤
│ ⭕ Emma Thompson│
│    🔴 ALERT!    │
│    Fatigue: High│
└─────────────────┘
```

#### 2. SystemLogs.tsx
**Requirements:**
- Bottom panel (48px height)
- Scrollable log feed
- Show real-time events:
  - `[HH:MM:SS] [ICON] Message`
- Event types:
  - Vital received (blue)
  - Symptom reported (yellow)
  - Workflow triggered (purple)
  - Blockchain event (green)
  - Alert generated (red)
- Auto-scroll to bottom
- Max 100 entries (remove old)

**Example entries:**
```
[10:42:15] ❤️ Sarah's glucose: 120 mg/dL
[10:42:12] ⚠️ Robert's BP spike detected: 160/95
[10:41:58] 🤖 Emma's agent responded to query
[10:41:45] ⛓️ Report registered on blockchain
```

#### 3. ActiveAlerts.tsx
**Requirements:**
- Left sidebar below PatientRoster
- Show critical and high severity alerts only
- Each alert card shows:
  - Patient name
  - Alert type (icon)
  - Message
  - Timestamp
  - Severity color (red = critical, orange = high)
- Max 5 alerts visible
- Dismiss button per alert

#### 4. BlockchainEvents.tsx
**Requirements:**
- Right sidebar panel
- Show recent blockchain transactions
- Each event shows:
  - Transaction hash (truncated)
  - Event type badge
  - Gas used
  - Timestamp
  - Block number
- Color-coded by type:
  - Green: ReportRegistered
  - Blue: AccessGranted
  - Red: AccessRevoked
  - Orange: AccessLog

#### 5. CreStatus.tsx
**Requirements:**
- Right sidebar panel
- Show Chainlink CRE status:
  - ✅ HTTP Trigger: Active
  - ✅ Cron Trigger: Next in 4h
  - ✅ EVM Write: 42 tx confirmed
  - ✅ Confidential HTTP: Ready
- Latest block number
- Gas price
- Connection status

#### 6. Statistics.tsx (Bonus)
**Requirements:**
- Small panel showing:
  - Total vitals processed
  - Total symptoms reported
  - Total workflows triggered
  - Total blockchain events
  - Total alerts generated
- Update in real-time

---

### TASK 3: UI Polish & Styling

1. **Color Scheme (Dark Medical Theme):**
   ```css
   --bg-dark: #0A0E27          /* Deep navy */
   --bg-panel: #111936         /* Panel background */
   --bg-card: #1A2342          /* Card background */
   --text-primary: #FFFFFF
   --text-secondary: #8B9BB4
   --medical: #00B4D8          /* Medical blue */
   --chainlink: #375BD2        /* Chainlink blue */
   --cre: #6366F1              /* CRE indigo */
   --healthy: #2ECC71
   --warning: #F39C12
   --critical: #E74C3C
   ```

2. **Use Kenney UI Assets:**
   - Use `panel_blue.png` for main panels
   - Use `button_*.png` for action buttons
   - Use icons from `icon_*.png`
   - Apply using CSS `background-image` or `<img>`

3. **Animations:**
   - Panel hover effects
   - Alert pulse animations
   - Smooth transitions
   - Data update animations

4. **Typography:**
   - Headlines: Inter, 600 weight
   - Body: Inter, 400 weight
   - Monospace: JetBrains Mono for hashes/logs

---

### TASK 4: Integration

1. **Wire up to Zustand store:**
   ```typescript
   import { useSimulationStore } from '@/store/simulationStore';
   
   const patients = useSimulationStore((state) => state.patients);
   const alerts = useSimulationStore((state) => state.alerts);
   const workflows = useSimulationStore((state) => state.workflows);
   ```

2. **Connect WebSocket (if backend running):**
   - Real-time updates from simulation
   - Or use store's mock data initially

3. **Test Everything:**
   - Click patient → Show detail view
   - Alerts appear when triggered
   - Logs scroll with new events
   - Blockchain events populate
   - 3D scene interactive

---

## 📐 LAYOUT SPECIFICATION

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: MedGuardian Logo    [Start] [Pause] [Reset]    Stats  │
├───────────────┬───────────────────────────────┬─────────────────┤
│               │                               │                 │
│  PATIENT      │                               │   CHAINLINK     │
│  ROSTER       │                               │   CRE STATUS    │
│               │        3D VISUALIZATION       ├─────────────────┤
│  [Sarah]      │                               │   BLOCKCHAIN    │
│  [Robert]     │        • Patient Homes        │   EVENTS        │
│  [Emma]       │        • Medical Centers      │                 │
│  [Michael]    │        • CRE Nexus            ├─────────────────┤
│               │        • Data Flow            │   STATISTICS    │
├───────────────┤                               │                 │
│  ACTIVE       │                               │                 │
│  ALERTS       │                               │                 │
│               │                               │                 │
├───────────────┴───────────────────────────────┴─────────────────┤
│  SYSTEM LOGS                                                    │
│  [10:42:15] ❤️ Sarah's HR: 72 BPM                              │
│  [10:42:12] ⚠️ Robert's BP spike: 160/95                       │
└─────────────────────────────────────────────────────────────────┘

Column widths:
- Left sidebar: 250px
- Center (3D): flexible
- Right sidebar: 300px
- Bottom logs: 200px height
```

---

## 🔧 TECHNICAL REQUIREMENTS

1. **Use these libraries:**
   ```bash
   npm install three @react-three/fiber @react-three/drei
   npm install zustand immer
   npm install lucide-react
   npm install tailwind-merge clsx
   ```

2. **Three.js specific:**
   - Use `@react-three/drei` helpers (Stars, Grid, OrbitControls)
   - Use `useGLTF` for GLB loading
   - Use `FBXLoader` for FBX loading
   - Enable shadows
   - Use instanced meshes for particles/trees

3. **Performance:**
   - Use `React.memo` for components
   - Use Zustand selectors to prevent re-renders
   - Lazy load 3D components
   - Limit particle count to 100

---

## ✅ ACCEPTANCE CRITERIA

### Visual:
- [ ] All 4 patient homes visible with correct GLB models
- [ ] 3 medical centers visible with FBX models
- [ ] Trees and environment props placed
- [ ] CRE Nexus rotating with rings
- [ ] Blockchain tower growing with blocks
- [ ] Data particles flowing between elements
- [ ] Patient roster shows all patients with vitals
- [ ] Alerts panel shows critical alerts
- [ ] Logs panel scrolls with events
- [ ] Blockchain events show transactions
- [ ] Dark theme consistent throughout

### Interactive:
- [ ] Click patient home → Select patient
- [ ] Click patient in roster → Highlight in 3D
- [ ] Orbit controls work in 3D view
- [ ] Hover effects on all clickable elements
- [ ] Smooth animations on updates

### Functional:
- [ ] Store integration works
- [ ] Real-time updates (if backend connected)
- [ ] No console errors
- [ ] Responsive layout
- [ ] Performance: 60fps in 3D view

---

## 🚀 TESTING

Test the implementation:

```bash
# Terminal 1: Start backend
cd medguardian/backend
npm run dev

# Terminal 2: Start frontend
cd medguardian/frontend
npm run dev -- --hostname 0.0.0.0 --port 3333

# Access via Tailscale:
# http://100.121.184.92:3333
```

---

## 📚 REFERENCE DOCUMENTS

- `/medguardian/SIMULATION-DESIGN.md` - Full design document
- `/medguardian/ASSETS-USAGE.md` - Asset usage guide
- `/medguardian/frontend/src/lib/assets-config.ts` - Asset paths
- `/medguardian/frontend/src/types/simulation.ts` - TypeScript types
- `/medguardian/frontend/src/store/simulationStore.ts` - State management

---

## 💡 TIPS FOR SUCCESS

1. **Start with assets:** Run copy-assets.sh first
2. **Test 3D scene:** Make sure models load before UI
3. **Use store:** All data comes from simulationStore
4. **Dark theme:** Use Tailwind classes with custom colors
5. **Performance:** Don't over-render, use selectors
6. **Iterate:** Get basic working, then polish

---

**Your goal:** A stunning, interactive health data simulation dashboard that will win the Chainlink hackathon! 🏆

**Questions?** Check the existing code structure and types for guidance.
