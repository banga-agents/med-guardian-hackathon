# 🎮 MedGuardian Simulation Dashboard

> **"A Living, Breathing Demo of Privacy-Preserving Healthcare"**

## 🎯 Vision

Create an immersive, real-time simulation that visualizes the entire MedGuardian ecosystem in action. Watch AI patient agents live their lives, generate health data, interact with Chainlink CRE workflows, and receive care from virtual doctors - all beautifully visualized in 3D.

---

## 🏗️ Simulation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        MEDGUARDIAN SIMULATION DASHBOARD                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    THREE.JS VISUALIZATION LAYER                        │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │   │
│  │  │ Patient  │  │  Home    │  │ Medical  │  │    Data Flow         │  │   │
│  │  │ Agents   │  │  Icons   │  │ Centers  │  │    Particles         │  │   │
│  │  │ (Orbs)   │  │  (Glow)  │  │ (Towers) │  │    (Encrypted)       │  │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │   │
│  │       │             │             │                   │              │   │
│  │       └─────────────┴─────────────┴───────────────────┘              │   │
│  │                          3D SCENE                                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                            │
│  ┌─────────────────────────────────▼─────────────────────────────────────────┐  │
│  │                      SIMULATION ENGINE (Node.js)                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │   Patient    │  │  Wearable    │  │   Symptom    │  │   Agent      │ │  │
│  │  │   Agents     │  │  Simulators  │  │   Generator  │  │   Chat       │ │  │
│  │  │  (ERC-8004)  │  │              │  │              │  │   System     │ │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │  │
│  │         │                 │                 │                 │        │  │
│  │         └─────────────────┴─────────────────┴─────────────────┘        │  │
│  │                              │                                          │  │
│  │                   ┌──────────▼──────────┐                               │  │
│  │                   │   Event Bus (WS)    │                               │  │
│  │                   └──────────┬──────────┘                               │  │
│  └──────────────────────────────│──────────────────────────────────────────┘  │
│                                 │                                               │
│  ┌──────────────────────────────▼──────────────────────────────────────────┐   │
│  │                      REAL CHAINLINK CRE WORKFLOWS                        │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │   │
│  │  │ HTTP Trigger   │  │ Cron Trigger   │  │ EVM Write (Keystone)       │ │   │
│  │  │ (Data In)      │  │ (Daily Report) │  │ (Report Registry)          │ │   │
│  │  └────────────────┘  └────────────────┘  └────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                 │                                               │
│  ┌──────────────────────────────▼──────────────────────────────────────────┐   │
│  │                      SMART CONTRACTS (Sepolia)                           │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │   │
│  │  │ Access Control │  │ Report Registry│  │ Audit Logs                 │ │   │
│  │  └────────────────┘  └────────────────┘  └────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 👥 Patient Agent System (ERC-8004)

### Simulated Patients

| Patient | Condition | Age | Wearables | Lifestyle |
|---------|-----------|-----|-----------|-----------|
| **Sarah** | Type 1 Diabetes | 28 | CGM, Smartwatch, BP Monitor | Active, works from home |
| **Robert** | Hypertension + Sleep Apnea | 54 | BP Cuff, Sleep Ring, Scale | Sedentary, high stress job |
| **Emma** | Long COVID (Fatigue, Brain Fog) | 34 | Smartwatch, Pulse Ox | Remote worker, inconsistent schedule |
| **Michael** | Heart Arrhythmia | 67 | ECG Monitor, BP Cuff, Fall Detector | Retired, lives alone |

### Agent Behavior Model

```typescript
interface PatientAgent {
  id: string;
  name: string;
  avatar: string;
  condition: MedicalCondition;
  
  // Daily Routine
  schedule: DailySchedule;
  
  // Wearable Devices
  wearables: WearableDevice[];
  
  // State Machine
  state: 'sleeping' | 'active' | 'working' | 'exercising' | 'eating';
  
  // Health Data Generator
  vitalGenerator: VitalSignGenerator;
  symptomGenerator: SymptomGenerator;
  
  // AI Chat Agent
  chatAgent: ERC8004Agent;
  
  // Methods
  emitVitals(): VitalReading;
  reportSymptom(): SymptomEntry | null;
  respondToQuery(query: string): string;
}
```

### ERC-8004 Agent Contract (Simplified)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PatientAgent
 * @dev ERC-8004 inspired agent for patient simulation
 */
contract PatientAgent {
    struct AgentState {
        string name;
        uint8 conditionType;
        uint256 lastUpdate;
        bytes32 currentLocation; // Hashed location
        uint8 activityLevel; // 0-100
        uint8 stressLevel; // 0-100
    }
    
    struct VitalSnapshot {
        uint256 timestamp;
        uint16 heartRate;
        uint16 bloodPressureSystolic;
        uint16 bloodPressureDiastolic;
        uint16 bloodGlucose; // For diabetic patients
        uint8 oxygenSaturation;
        uint8 sleepQuality;
    }
    
    AgentState public state;
    VitalSnapshot[] public history;
    
    // Events that trigger CRE workflows
    event VitalSignsUpdated(VitalSnapshot vitals);
    event SymptomReported(string symptom, uint8 severity, uint256 timestamp);
    event AgentQuery(address indexed doctor, string query, string response);
    
    // AI-generated responses to health queries
    function queryAgent(string memory question) external returns (string memory) {
        // In simulation, this calls OpenAI via CRE workflow
        emit AgentQuery(msg.sender, question, "");
        return "";
    }
    
    function updateVitals(VitalSnapshot memory vitals) external {
        history.push(vitals);
        emit VitalSignsUpdated(vitals);
    }
}
```

---

## 🎮 Dashboard Components

### 1. Command Center (Main View)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🏥 MEDGUARDIAN SIMULATION          [▶ Start] [⏸ Pause] [⏹ Reset]      │
├─────────────────────────────┬───────────────────────────────────────────┤
│                             │                                           │
│   ┌─────────────────────┐   │   ┌───────────────────────────────────┐   │
│   │   PATIENT ROSTER    │   │   │     3D VISUALIZATION VIEW         │   │
│   │                     │   │   │                                   │   │
│   │ ⭕ Sarah (Diabetes)  │   │   │         🏠     🏠                 │   │
│   │    ● Connected      │   │   │          ○       ○                │   │
│   │    HR: 72 BPM       │   │   │         /│\     /│\               │   │
│   │    Glucose: 120     │   │   │          |       |                │   │
│   │                     │   │   │         / \     / \               │   │
│   │ ⭕ Robert (BP)       │   │   │                                   │   │
│   │    ● Sleeping       │   │   │    ════ ENCRYPTED DATA FLOW ═══   │   │
│   │    BP: 135/85       │   │   │         ~~~~~🔒~~~~~              │   │
│   │                     │   │   │              ↓                    │   │
│   │ ⭕ Emma (Long COVID) │   │   │         🏥 MEDICAL CENTER         │   │
│   │    ⚠️ Alert!        │   │   │                                   │   │
│   │    Fatigue: High    │   │   │   ┌─────┐ ┌─────┐ ┌─────┐        │   │
│   │                     │   │   │   │ 👨‍⚕️ │ │ 👩‍⚕️ │ │ 👨‍⚕️ │        │   │
│   │ ⭕ Michael (Heart)   │   │   │   │ Dr.A│ │ Dr.B│ │ Dr.C│        │   │
│   │    ● Stable         │   │   │   └─────┘ └─────┘ └─────┘        │   │
│   │    HR: 68 BPM       │   │   │                                   │   │
│   └─────────────────────┘   │   └───────────────────────────────────┘   │
│                             │                                           │
│   ┌─────────────────────┐   │   ┌───────────────────────────────────┐   │
│   │   SYSTEM LOGS       │   │   │   CHAINLINK CRE STATUS           │   │
│   │                     │   │   │                                   │   │
│   │ [10:42:15] Sarah    │   │   │   ✅ HTTP Trigger: Active         │   │
│   │            reported │   │   │   ✅ Cron Trigger: Next in 4h     │   │
│   │            dizziness│   │   │   ✅ EVM Write: 42 tx confirmed   │   │
│   │                     │   │   │   ✅ Confidential HTTP: Ready     │   │
│   │ [10:42:12] Robert's │   │   │                                   │   │
│   │            BP spiked│   │   │   Latest Block: 18294732          │   │
│   │            to 160/95│   │   │   Gas Price: 12 gwei              │   │
│   │                     │   │   │                                   │   │
│   │ [10:41:58] Emma's   │   │   └───────────────────────────────────┘   │
│   │            agent    │   │                                           │
│   │            responded│   │   ┌───────────────────────────────────┐   │
│   │            to query │   │   │   RECENT BLOCKCHAIN EVENTS       │   │
│   │                     │   │   │                                   │   │
│   └─────────────────────┘   │   │   📝 ReportRegistered            │   │
│                             │   │      Patient: Sarah              │   │
│   ┌─────────────────────┐   │   │      Hash: 0x7a3f...9e2d         │   │
│   │   ACTIVE ALERTS     │   │   │      TX: 0x4b8c...1a5f           │   │
│   │                     │   │   │                                   │   │
│   │ 🔴 HIGH Robert's BP │   │   │   🔓 AccessGranted               │   │
│   │    > 160/95         │   │   │      Doctor: Dr. Chen            │   │
│   │    Duration: 15min  │   │   │      Patient: Michael            │   │
│   │                     │   │   │      Expiry: 24 hours            │   │
│   │ 🟡 MEDIUM Emma's    │   │   │                                   │   │
│   │    fatigue spike    │   │   └───────────────────────────────────┘   │
│   │                     │   │                                           │
│   └─────────────────────┘   │                                           │
│                             │                                           │
└─────────────────────────────┴───────────────────────────────────────────┘
```

### 2. Patient Detail View (Click on Patient)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  👤 SARAH MILLER - TYPE 1 DIABETES                          [⬅ Back]  │
├─────────────────────────────┬───────────────────────────────────────────┤
│                             │                                           │
│  ┌─────────────────────┐    │   ┌───────────────────────────────────┐   │
│  │  VITAL SIGNS        │    │   │   24-HOUR GLUCOSE CHART          │   │
│  │                     │    │   │                                   │   │
│  │  ❤️ Heart Rate       │    │   │   200 ┤                   ╱╲      │   │
│  │     72 BPM          │    │   │       │              ╱╲    ╱  ╲     │   │
│  │     Trend: ↓ Stable │    │   │  150 ┤    ╱╲   ╱╲  ╱  ╲  ╱    ╲    │   │
│  │                     │    │   │       │   ╱  ╲ ╱  ╲╱    ╲╱      ╲   │   │
│  │  🩸 Blood Glucose    │    │   │  100 ┤──╱────╳────╳────────────╳───│   │
│  │     120 mg/dL       │    │   │       │ ╱     ╱    ╲              ╲ │   │
│  │     Trend: → Good   │    │   │   70 ┤╱                              │   │
│  │                     │    │   │       └────────────────────────────   │   │
│  │  🫁 SpO2            │    │   │         00  06  12  18  24 (hours)    │   │
│  │     98%             │    │   │                                   │   │
│  │                     │    │   └───────────────────────────────────┘   │
│  │  💉 Insulin Pump    │    │                                           │   │
│  │     Active          │    │   ┌───────────────────────────────────┐   │
│  │     Reservoir: 45%  │    │   │   AI AGENT CONVERSATION          │   │
│  └─────────────────────┘    │   │                                   │   │
│                             │   │   [10:42] MedGuardian:            │   │
│  ┌─────────────────────┐    │   │   "Sarah, your glucose spiked     │   │
│  │  RECENT SYMPTOMS    │    │   │    to 180 after lunch. How       │   │
│  │                     │    │   │    are you feeling?"             │   │
│  │  📝 Dizziness       │    │   │                                   │   │
│  │     10:42 AM        │    │   │   [10:43] Sarah's Agent:          │   │
│  │     Severity: 3/5   │    │   │   "I'm feeling a bit dizzy and   │   │
│  │                     │    │   │    had a headache since 10 AM.    │   │
│  │  📝 Mild Headache   │    │   │    Might have taken too much      │   │
│  │     10:15 AM        │    │   │    insulin at breakfast."        │   │
│  │     Severity: 2/5   │    │   │                                   │   │
│  │                     │    │   │   [10:44] MedGuardian:            │   │
│  └─────────────────────┘    │   │   "Noted. I've adjusted your      │   │
│                             │   │    basal rate and will alert      │   │
│  ┌─────────────────────┐    │   │    Dr. Chen if it persists."     │   │
│  │  CURRENT ACTIVITY   │    │   │                                   │   │
│  │                     │    │   │   [Type to chat with agent...]    │   │
│  │  🏠 Working from    │    │   │                                   │   │
│  │     home office     │    │   └───────────────────────────────────┘   │
│  │  📍 Location: Home  │    │                                           │
│  │  ⏰ Next: Lunch     │    │   ┌───────────────────────────────────┐   │
│  │     (in 1 hour)     │    │   │   ACTIVE DATA STREAMS            │   │
│  └─────────────────────┘    │   │                                   │   │
│                             │   │   🔴 Dexcom G7 → CRE (Real-time) │   │
│                             │   │   🟢 Apple Watch → CRE (5min)    │   │
│                             │   │   🟡 Manual Logs → CRE (On-demand)│   │
│                             │   │                                   │   │
│                             │   │   Last sync: 10 seconds ago       │   │
│                             │   └───────────────────────────────────┘   │
└─────────────────────────────┴───────────────────────────────────────────┘
```

### 3. Doctor Station View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  👨‍⚕️ DR. CHEN - CARDIOLOGY DEPARTMENT                      [⬅ Back]   │
├─────────────────────────────┬───────────────────────────────────────────┤
│                             │                                           │
│  ┌─────────────────────┐    │   ┌───────────────────────────────────┐   │
│  │ ASSIGNED PATIENTS   │    │   │   PATIENT REPORT: MICHAEL        │   │
│  │                     │    │   │   [Viewing with authorized access]│   │
│  │ ⭕ Michael (Heart)   │    │   │                                   │   │
│  │    ✅ Access: 18h left│   │   │   Report Period: Last 7 Days     │   │
│  │    📝 2 new alerts  │    │   │   Generated: Today at 00:00 UTC  │   │
│  │                     │    │   │                                   │   │
│  │ ⭕ Sarah (Diabetes)  │    │   │   🔒 Encrypted Report Hash:      │   │
│  │    🔒 No access     │    │   │   0x7a3f...9e2d                  │   │
│  │    [Request Access] │    │   │   Verified on: Sepolia           │   │
│  │                     │    │   │                                   │   │
│  │ ⭕ Robert (BP)       │    │   │   ┌──────────────────────────┐   │   │
│  │    🔒 No access     │    │   │   │  AI-GENERATED SUMMARY     │   │   │
│  │    [Request Access] │    │   │   │                          │   │   │
│  │                     │    │   │   │  Patient shows stable    │   │   │
│  └─────────────────────┘    │   │   │  cardiac rhythm with     │   │   │
│                             │   │   │  occasional PVCs noted   │   │   │
│  ┌─────────────────────┐    │   │   │  on 3 occasions. Blood   │   │   │
│  │ ACCESS REQUESTS     │    │   │   │  pressure well controlled│   │   │
│  │                     │    │   │   │  on current medication.  │   │   │
│  │ 🔔 Emma requested   │    │   │   │  Recommended: Continue   │   │   │
│  │    your review      │    │   │   │  current regimen,        │   │   │
│  │    [Grant 24h]      │    │   │   │  follow-up in 2 weeks.   │   │   │
│  │                     │    │   │   │                          │   │   │
│  └─────────────────────┘    │   │   └──────────────────────────┘   │   │
│                             │   │                                   │   │
│  ┌─────────────────────┐    │   │   📊 KEY METRICS:                │   │
│  │ ALERT QUEUE         │    │   │                                   │   │
│  │                     │    │   │   Avg HR: 68 BPM (Normal)        │   │
│  │ 🔴 URGENT           │    │   │   Arrhythmia Events: 3           │   │
│  │    None             │    │   │   BP: 128/82 (Good control)      │   │
│  │                     │    │   │   Medication Adherence: 95%      │   │
│  │ 🟡 MODERATE         │    │   │                                   │   │
│  │    Michael: PVC     │    │   │   📈 TRENDS:                     │   │
│  │    cluster detected │    │   │   Heart Rate ↓ 5% vs last week   │   │
│  │    [View ECG]       │    │   │   Sleep Quality ↑ 10%            │   │
│  │                     │    │   │                                   │   │
│  └─────────────────────┘    │   └───────────────────────────────────┘   │
│                             │                                           │
└─────────────────────────────┴───────────────────────────────────────────┘
```

---

## 🌌 Three.js Visualization

### Scene Elements

```typescript
interface SimulationScene {
  // World
  ground: THREE.Mesh;
  skybox: THREE.CubeTexture;
  fog: THREE.Fog;
  
  // Patient Homes (glowing spheres)
  homes: {
    [patientId: string]: {
      mesh: THREE.Group;
      glowLight: THREE.PointLight;
      patientOrb: THREE.Mesh; // Represents the patient
      dataParticles: THREE.Points; // Floating data symbols
      statusIndicator: THREE.Mesh; // Color coded
    }
  };
  
  // Medical Centers (tower structures)
  medicalCenters: {
    [centerId: string]: {
      building: THREE.Group;
      beacon: THREE.Light;
      doctorOrbs: THREE.Mesh[];
    }
  };
  
  // Data Flow Lines (animated curves)
  dataFlows: {
    from: string;
    to: string;
    curve: THREE.CatmullRomCurve3;
    particles: THREE.Points;
    encryptionStatus: 'encrypted' | 'processing' | 'cleared';
  }[];
  
  // CRE Network Visualization (central nexus)
  creNexus: {
    core: THREE.Mesh;
    rotatingRings: THREE.Mesh[];
    statusParticles: THREE.Points;
  };
  
  // Blockchain (tower of blocks)
  blockchain: {
    base: THREE.Mesh;
    blocks: THREE.Mesh[];
    latestBlock: THREE.Mesh;
    hashParticles: THREE.Points;
  };
}
```

### Visual Effects

1. **Data Encryption Visualization**
   - Particles flowing from patient homes to CRE nexus
   - Particles change from 🔴 (plaintext) to 🔒 (encrypted) mid-flight
   - Encryption happens at the "Confidential HTTP" boundary

2. **CRE Processing Animation**
   - Rotating rings around central nexus
   - Pulse effects when workflows trigger
   - Color-coded by workflow type:
     - Blue: HTTP Trigger (health data)
     - Green: Cron Trigger (report generation)
     - Purple: EVM Write (blockchain)

3. **Blockchain Growth**
   - Tower of blocks growing upward
   - Each new block triggers particle explosion
   - Hash values floating above blocks

4. **Doctor Access Visualization**
   - Authorized doctor orbs turn green
   - Data flows from blockchain to doctor station
   - Access expiry countdown visible

---

## 📡 Real-Time Events

### WebSocket Event Types

```typescript
// From Simulation Engine → Frontend
interface SimulationEvents {
  'patient:vitals': {
    patientId: string;
    vitals: VitalReading;
    timestamp: number;
  };
  
  'patient:symptom': {
    patientId: string;
    symptom: SymptomEntry;
    timestamp: number;
  };
  
  'patient:agent:response': {
    patientId: string;
    query: string;
    response: string;
    latency: number;
  };
  
  'cre:trigger': {
    workflowId: string;
    triggerType: 'http' | 'cron' | 'evm_log';
    payload: any;
    timestamp: number;
  };
  
  'cre:processing': {
    workflowId: string;
    stage: 'input' | 'enclave' | 'consensus' | 'output';
    duration: number;
  };
  
  'blockchain:write': {
    contract: string;
    method: string;
    txHash: string;
    gasUsed: number;
    timestamp: number;
  };
  
  'doctor:access:granted': {
    doctorId: string;
    patientId: string;
    expiry: number;
    allowedQueries: string[];
  };
  
  'alert:new': {
    severity: 'low' | 'medium' | 'high' | 'critical';
    patientId: string;
    message: string;
    timestamp: number;
  };
}
```

---

## 🎬 Demo Scenarios

### Scenario 1: "The Diabetic Alert"
1. Sarah's glucose drops rapidly (CGM alert)
2. Agent asks if she's feeling symptoms
3. Sarah reports dizziness via voice
4. CRE workflow processes in real-time
5. Alert generated → Dr. Chen notified
6. Dr. Chen requests access → Patient grants
7. Dr. Chen views trend data, recommends juice
8. Recovery tracked in real-time

### Scenario 2: "The Silent Arrhythmia"
1. Michael's ECG detects irregular rhythm during sleep
2. CRE workflow analyzes pattern with AI
3. Comparison with historical data
4. Alert sent to Dr. Chen
5. Dr. Chen reviews and schedules appointment
6. Access auto-expires after 24 hours

### Scenario 3: "The Multi-Doctor Consultation"
1. Emma's long COVID symptoms worsen
2. Multiple specialists request access
3. Patient grants different permissions to each:
   - Cardiologist: Vitals only
   - Neurologist: Full summary
   - GP: Symptoms only
4. CRE workflows route appropriate data to each
5. Collaborative care in action

---

## 🛠️ Implementation Phases

### Phase 1: Core Simulation (2 days)
- Patient agent system with state machines
- Wearable data generators
- Basic WebSocket event bus
- Simple 3D visualization (home/medical center markers)

### Phase 2: CRE Integration (2 days)
- Real HTTP triggers from simulation
- Connect to actual CRE workflows
- Blockchain event listeners
- Live transaction viewing

### Phase 3: Visualization Polish (2 days)
- Three.js particle systems
- Data flow animations
- Encryption visual effects
- UI/UX refinement

### Phase 4: Scenario Scripting (1 day)
- Pre-programmed demo scenarios
- Auto-play mode for judges
- Manual override controls

---

## 🎨 Design System

### Color Palette
```css
:root {
  /* Medical Theme */
  --color-primary: #00B4D8;      /* Medical blue */
  --color-secondary: #90E0EF;    /* Light blue */
  --color-accent: #CAF0F8;       /* Pale blue */
  
  /* Status Colors */
  --color-healthy: #2ECC71;      /* Green */
  --color-warning: #F39C12;      /* Orange */
  --color-critical: #E74C3C;     /* Red */
  --color-info: #3498DB;         /* Blue */
  
  /* Chainlink Theme */
  --color-chainlink: #375BD2;    /* Chainlink blue */
  --color-cre: #6366F1;          /* CRE indigo */
  
  /* Dark UI */
  --bg-dark: #0A0E27;            /* Deep navy */
  --bg-panel: #111936;           /* Panel background */
  --text-primary: #FFFFFF;
  --text-secondary: #8B9BB4;
}
```

### Typography
- **Headlines**: Inter, 600 weight
- **Body**: Inter, 400 weight
- **Monospace**: JetBrains Mono (for logs/hashes)

---

This simulation dashboard will be a **showstopper** at the hackathon - judges will see the entire system working in real-time with beautiful visualizations, while the actual CRE workflows and smart contracts process real data!
