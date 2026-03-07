# 🎨 Assets Usage Guide

> **How Your Downloaded Assets Will Be Used in MedGuardian**

---

## 📦 Assets Overview

| Asset Pack | Location | Use In Simulation |
|------------|----------|-------------------|
| **CyberCity** | `/free-assets/cybercity/` | Medical centers (cyberpunk style hospitals) |
| **Blocky Characters** | `/free-assets/kenney_blocky-characters_20/` | Patient & doctor avatars |
| **City Kit Suburban** | `/free-assets/kenney_city-kit-suburban_20/` | Patient homes (GLB format) |
| **UI Pack Space** | `/free-assets/kenney_ui-pack-space-expansion/` | Dashboard UI elements |

---

## 🏠 Patient Homes (City Kit Suburban)

```
free-assets/kenney_city-kit-suburban_20/Models/GLB format/
```

### Assigned to Patients:

| Patient | House Model | Style | Color |
|---------|-------------|-------|-------|
| **Sarah** (Diabetes) | `building-type-f.glb` | Modern with garage | 🔵 Blue |
| **Robert** (BP) | `building-type-a.glb` | Classic two-story | 🟠 Orange |
| **Emma** (Long COVID) | `building-type-k.glb` | Cozy cottage | 🟣 Purple |
| **Michael** (Heart) | `building-type-h.glb` | Single-story | 🟢 Green |

### Code Usage:
```typescript
import { PatientHome3D } from '@/components/visualization/PatientHome3D';

<PatientHome3D
  patientId="sarah"
  isActive={true}
  hasAlert={false}
/>
```

---

## 🏥 Medical Centers (CyberCity)

```
free-assets/cybercity/FBX/
```

### Assigned to Specialties:

| Specialty | Building Model | Style | Color |
|-----------|---------------|-------|-------|
| **Cardiology** | `4_story.fbx` | Tall tower with emissive | 🔴 Red |
| **General** | `4_story_long.fbx` | Wide building | 🔵 Blue |
| **Neurology** | `2story_long.fbx` | Smaller center | 🟣 Purple |

### Code Usage:
```typescript
import { MedicalCenter3D } from '@/components/visualization/MedicalCenter3D';

<MedicalCenter3D 
  type="cardiology"
  doctorCount={2}
/>
```

---

## 👥 Characters (Blocky Characters)

```
free-assets/kenney_blocky-characters_20/Models/
```

### Patients:
- `character-female-a.glb` → Sarah
- `character-male-b.glb` → Robert  
- `character-female-b.glb` → Emma
- `character-male-c.glb` → Michael

### Doctors:
- `character-female-d.glb` → Dr. Chen
- `character-male-a.glb` → Dr. Rodriguez
- `character-female-c.glb` → Dr. Patel
- `character-male-d.glb` → Dr. Smith

---

## 🌳 Environment Props

### Trees:
- `tree-small.glb`
- `tree-large.glb`

### Paths:
- `path-short.glb`
- `path-long.glb`
- `path-stones-short.glb`
- `path-stones-messy.glb`

### Fences:
- `fence-1x2.glb`
- `fence-1x3.glb`
- `fence-2x2.glb`

---

## 🎮 UI Elements (Space Expansion)

```
free-assets/kenney_ui-pack-space-expansion/PNG/
```

### Panels:
- `panel_blue.png` - Main panels
- `panel_green.png` - Success states
- `panel_red.png` - Alerts/Errors
- `panel_yellow.png` - Warnings

### Buttons:
- `button_blue.png` - Primary actions
- `button_green.png` - Confirm
- `button_red.png` - Cancel/Stop
- `button_round.png` - Icon buttons

### Icons:
- `icon_check.png` - Success
- `icon_cross.png` - Error
- `icon_lock.png` - Encrypted
- `icon_unlock.png` - Decrypted
- `icon_alert.png` - Warning

---

## 📂 Copy Script

Run this to copy assets to the frontend:

```bash
cd /home/agent/chainlink-medpriv/medguardian
chmod +x scripts/copy-assets.sh
./scripts/copy-assets.sh
```

This will copy all assets to:
```
frontend/public/assets/
├── kenney_city-kit-suburban_20/
├── cybercity/
├── kenney_blocky-characters_20/
└── kenney_ui-pack-space-expansion/
```

---

## 🎨 Color Scheme

Each patient has a unique color for easy identification:

```typescript
const PATIENT_COLORS = {
  sarah:   '#3498DB', // Blue  - Diabetes
  robert:  '#E67E22', // Orange - BP
  emma:    '#9B59B6', // Purple - Long COVID
  michael: '#27AE60', // Green  - Heart
};
```

These colors appear on:
- House glow effects
- UI badges
- Data flow particles
- Alert indicators

---

## 🎬 Scene Layout

```
                    [Medical Centers]
                   Cardiology  General
                          🏥
                         /
    [Sarah] 🏠 ─────── ⚡ ─────── 🏠 [Robert]
       Blue         CRE Nexus      Orange
                    (Center)
                       |
    [Emma]  🏠 ───────┼─────── 🏠 [Michael]
      Purple          |          Green
                      |
                [Blockchain]
                   Tower 📦
```

---

## 🔧 Technical Details

### File Formats:
- **GLB** - Ready for Three.js (recommended)
- **FBX** - Needs conversion/loader
- **PNG** - UI textures

### Performance:
- All models are low-poly (Kenney style)
- GLB files are optimized
- Textures use flat shading
- InstanceMesh for particles (100+ particles at 60fps)

### Lighting:
- Each house has a point light glow
- Medical centers have beacon lights
- CRE Nexus has rotating glow rings
- Blockchain tower has pulsing top light

---

## ✅ Quick Checklist

- [ ] Downloaded Kenney assets to `/free-assets/`
- [ ] Run `copy-assets.sh` to copy to frontend
- [ ] Install Three.js dependencies: `npm install three @react-three/fiber @react-three/drei`
- [ ] Start frontend: `npm run dev`
- [ ] Open http://localhost:3000

---

Your assets are **perfect** for this project! The cyberpunk medical centers + suburban homes creates a great "future healthcare" aesthetic. 🚀
