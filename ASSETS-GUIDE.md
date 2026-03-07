# 🎨 Kenney Assets Integration Guide

> **Free, high-quality game assets for MedGuardian 3D Visualization**
> 
> Source: [kenney.nl/assets](https://kenney.nl/assets)

---

## 📦 Recommended Asset Packs

### 1. **Space Kit** (For Medical Centers & Tech Feel)
- `spaceStation_*.obj` - Medical centers/hospitals
- `satellite_*.obj` - CRE Nexus nodes
- `meteor_*.obj` - Data packets
- **Style**: Clean, futuristic, sci-fi medical aesthetic

### 2. **Tower Defense Kit** (For Blockchain Tower)
- `tower_*.obj` - Blockchain tower levels
- `tile_*.obj` - Ground/grid
- **Style**: Modular buildings perfect for blockchain visualization

### 3. **City Kit (Suburban)** (For Patient Homes)
- `house_*.obj` - Patient homes
- `tree_*.obj` - Environment decoration
- `road_*.obj` - Ground plane
- **Style**: Clean, readable suburban neighborhood

### 4. **Character Assets** (For Patient/Doctor Orbs)
- `character_*.obj` - Could use as base for patient avatars
- Or use simple spheres with these textures

### 5. **Particle Pack** (For Data Flow)
- Pre-made particle effects
- Great for encrypted data streams

### 6. **UI Pack** (For HUD Elements)
- Buttons, panels, icons
- Replace default Three.js UI

---

## 📥 Download & Setup

### Step 1: Download Assets

```bash
# Create assets directory
mkdir -p medguardian/frontend/public/kenney

cd medguardian/frontend/public/kenney

# Download packs (manually from kenney.nl or use these direct links)
# Note: Kenney assets are CC0 (public domain)
```

**Direct Download Links:**
- Space Kit: https://kenney.nl/assets/space-kit
- Tower Defense: https://kenney.nl/assets/tower-defense-kit
- City Kit Suburban: https://kenney.nl/assets/city-kit-suburban
- Particle Pack: https://kenney.nl/assets/particle-pack
- UI Pack: https://kenney.nl/assets/ui-pack

### Step 2: Convert to Three.js Format

Kenney assets come in FBX/OBJ format. Convert to glTF for better Three.js performance:

```bash
# Install conversion tools
npm install -g @gltf-transform/cli

# Convert OBJ to glTF
gltf-transform optimize house_type01.obj house_type01.glb

# Or use Blender batch script
```

### Step 3: Directory Structure

```
public/kenney/
├── space-kit/
│   ├── spaceStation_module.glb
│   ├── satellite.glb
│   └── antenna_large.glb
├── tower-defense/
│   ├── tower_round.glb
│   ├── tower_square.glb
│   └── tile.glb
├── city-kit/
│   ├── house_type01.glb
│   ├── house_type02.glb
│   ├── tree.glb
│   └── road.glb
├── particles/
│   ├── particle_circle.png
│   ├── particle_square.png
│   └── particle_star.png
└── ui/
    ├── panel_blue.png
    ├── panel_green.png
    ├── button_long.png
    └── icon_check.png
```

---

## 🎮 Three.js Implementation

### Asset Loader Utility

```typescript
// lib/assets.ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { TextureLoader } from 'three';

export const ASSET_PATHS = {
  patientHomes: {
    sarah: '/kenney/city-kit/house_type01.glb',
    robert: '/kenney/city-kit/house_type02.glb',
    emma: '/kenney/city-kit/house_type03.glb',
    michael: '/kenney/city-kit/house_type04.glb',
  },
  medicalCenter: '/kenney/space-kit/spaceStation_module.glb',
  creNexus: '/kenney/space-kit/satellite.glb',
  blockchainTower: '/kenney/tower-defense/tower_round.glb',
  ground: '/kenney/tower-defense/tile.glb',
  tree: '/kenney/city-kit/tree.glb',
  particles: {
    encrypted: '/kenney/particles/particle_circle.png',
    plaintext: '/kenney/particles/particle_square.png',
    processing: '/kenney/particles/particle_star.png',
  }
};

export class AssetManager {
  private gltfLoader = new GLTFLoader();
  private textureLoader = new TextureLoader();
  private cache = new Map<string, any>();

  async loadModel(path: string): Promise<THREE.Group> {
    if (this.cache.has(path)) {
      return this.cache.get(path).clone();
    }

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf) => {
          this.cache.set(path, gltf.scene);
          resolve(gltf.scene.clone());
        },
        undefined,
        reject
      );
    });
  }

  async loadTexture(path: string): Promise<THREE.Texture> {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }

    const texture = await this.textureLoader.loadAsync(path);
    this.cache.set(path, texture);
    return texture;
  }
}

export const assetManager = new AssetManager();
```

### Patient Home Component

```typescript
// components/visualization/PatientHome.tsx
import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { assetManager, ASSET_PATHS } from '@/lib/assets';
import { PatientId } from '@/types/simulation';

interface PatientHomeProps {
  patientId: PatientId;
  position: [number, number, number];
  isActive: boolean;
  hasAlert: boolean;
}

export function PatientHome({ 
  patientId, 
  position, 
  isActive, 
  hasAlert 
}: PatientHomeProps) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const { scene } = useThree();

  useEffect(() => {
    const loadModel = async () => {
      const path = ASSET_PATHS.patientHomes[patientId];
      const loadedModel = await assetManager.loadModel(path);
      
      // Customize based on patient
      loadedModel.position.set(...position);
      loadedModel.scale.set(0.5, 0.5, 0.5);
      
      // Add glow effect for active patients
      if (isActive) {
        const glowColor = hasAlert ? 0xE74C3C : 0x00B4D8;
        // Apply emissive material or point light
      }
      
      setModel(loadedModel);
      scene.add(loadedModel);
    };

    loadModel();

    return () => {
      if (model) {
        scene.remove(model);
      }
    };
  }, [patientId, position, isActive, hasAlert]);

  return null; // Three.js handles rendering
}
```

### Medical Center Component

```typescript
// components/visualization/MedicalCenter.tsx
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { assetManager, ASSET_PATHS } from '@/lib/assets';

export function MedicalCenter({ position }: { position: [number, number, number] }) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const beaconRef = useRef<THREE.PointLight>(null);

  useEffect(() => {
    const loadModel = async () => {
      const loadedModel = await assetManager.loadModel(ASSET_PATHS.medicalCenter);
      loadedModel.position.set(...position);
      loadedModel.scale.set(2, 2, 2);
      
      // Add beacon light
      const beacon = new THREE.PointLight(0x00B4D8, 2, 20);
      beacon.position.set(0, 5, 0);
      loadedModel.add(beacon);
      
      setModel(loadedModel);
    };

    loadModel();
  }, [position]);

  // Animate beacon
  useFrame((state) => {
    if (beaconRef.current) {
      beaconRef.current.intensity = 1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.5;
    }
  });

  return model ? <primitive object={model} /> : null;
}
```

### CRE Nexus Component

```typescript
// components/visualization/CRENexus.tsx
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { assetManager, ASSET_PATHS } from '@/lib/assets';

export function CRENexus({ position }: { position: [number, number, number] }) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const loadModel = async () => {
      // Load satellite model as base
      const loadedModel = await assetManager.loadModel(ASSET_PATHS.creNexus);
      loadedModel.position.set(...position);
      loadedModel.scale.set(1.5, 1.5, 1.5);
      
      // Add rotating rings to represent workflow processing
      const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(3, 0.1, 16, 100),
        new THREE.MeshBasicMaterial({ 
          color: 0x6366F1, 
          transparent: true, 
          opacity: 0.5 
        })
      );
      ring1.position.set(...position);
      
      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(4, 0.05, 16, 100),
        new THREE.MeshBasicMaterial({ 
          color: 0x00B4D8, 
          transparent: true, 
          opacity: 0.3 
        })
      );
      ring2.position.set(...position);
      
      if (groupRef.current) {
        groupRef.current.add(loadedModel);
        groupRef.current.add(ring1);
        groupRef.current.add(ring2);
        ring1Ref.current = ring1;
        ring2Ref.current = ring2;
      }
      
      setModel(loadedModel);
    };

    loadModel();
  }, [position]);

  // Animate rings
  useFrame((state) => {
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = state.clock.elapsedTime * 0.5;
      ring1Ref.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = -state.clock.elapsedTime * 0.3;
      ring2Ref.current.rotation.z = state.clock.elapsedTime * 0.2;
    }
  });

  return <group ref={groupRef} />;
}
```

### Blockchain Tower Component

```typescript
// components/visualization/BlockchainTower.tsx
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { assetManager, ASSET_PATHS } from '@/lib/assets';
import { useSimulationStore } from '@/store/simulationStore';

export function BlockchainTower({ position }: { position: [number, number, number] }) {
  const [baseModel, setBaseModel] = useState<THREE.Group | null>(null);
  const [blocks, setBlocks] = useState<THREE.Mesh[]>([]);
  const groupRef = useRef<THREE.Group>(null);
  
  const blockchainEvents = useSimulationStore(
    (state) => state.blockchainEvents
  );

  useEffect(() => {
    const loadModel = async () => {
      const loadedModel = await assetManager.loadModel(ASSET_PATHS.blockchainTower);
      loadedModel.position.set(...position);
      loadedModel.scale.set(0.8, 0.8, 0.8);
      setBaseModel(loadedModel);
    };

    loadModel();
  }, [position]);

  // Add new block for each blockchain event
  useEffect(() => {
    if (blockchainEvents.length > blocks.length) {
      const newBlock = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.5, 1),
        new THREE.MeshStandardMaterial({ 
          color: 0x375BD2,
          emissive: 0x375BD2,
          emissiveIntensity: 0.2
        })
      );
      
      newBlock.position.set(
        position[0],
        position[1] + blocks.length * 0.6 + 2,
        position[2]
      );
      
      // Add hash text floating above
      // ... text geometry
      
      setBlocks((prev) => [...prev, newBlock]);
      
      if (groupRef.current) {
        groupRef.current.add(newBlock);
      }
    }
  }, [blockchainEvents, blocks, position]);

  return (
    <group ref={groupRef}>
      {baseModel && <primitive object={baseModel} />}
    </group>
  );
}
```

---

## 🎨 Custom Materials

Apply Kenney-style flat shading to all assets:

```typescript
// lib/materials.ts
import * as THREE from 'three';

export const kenneyMaterials = {
  // Patient home colors
  homeSarah: new THREE.MeshStandardMaterial({
    color: 0x3498DB,
    flatShading: true,
    roughness: 0.8,
  }),
  homeRobert: new THREE.MeshStandardMaterial({
    color: 0xE67E22,
    flatShading: true,
    roughness: 0.8,
  }),
  homeEmma: new THREE.MeshStandardMaterial({
    color: 0x9B59B6,
    flatShading: true,
    roughness: 0.8,
  }),
  homeMichael: new THREE.MeshStandardMaterial({
    color: 0x27AE60,
    flatShading: true,
    roughness: 0.8,
  }),
  
  // Medical center
  medicalCenter: new THREE.MeshStandardMaterial({
    color: 0xECF0F1,
    flatShading: true,
    metalness: 0.3,
    roughness: 0.4,
  }),
  
  // CRE Nexus
  creNexus: new THREE.MeshStandardMaterial({
    color: 0x6366F1,
    emissive: 0x6366F1,
    emissiveIntensity: 0.5,
    flatShading: true,
  }),
  
  // Blockchain
  blockchain: new THREE.MeshStandardMaterial({
    color: 0x375BD2,
    emissive: 0x375BD2,
    emissiveIntensity: 0.3,
    flatShading: true,
  }),
  
  // Ground
  ground: new THREE.MeshStandardMaterial({
    color: 0x2C3E50,
    flatShading: true,
    roughness: 1,
  }),
};

// Helper to apply Kenney style to loaded models
export function applyKenneyStyle(model: THREE.Group, material: THREE.Material) {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = material;
    }
  });
}
```

---

## 🚀 Quick Start

```bash
# 1. Download Kenney assets
# Visit https://kenney.nl/assets and download:
# - Space Kit
# - Tower Defense Kit
# - City Kit Suburban
# - Particle Pack

# 2. Extract to public folder
unzip space-kit.zip -d public/kenney/space-kit/
unzip tower-defense.zip -d public/kenney/tower-defense/
unzip city-kit-suburban.zip -d public/kenney/city-kit/
unzip particle-pack.zip -d public/kenney/particles/

# 3. Install Three.js dependencies
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three

# 4. Start dev server
npm run dev
```

---

## 📊 Performance Tips

1. **Use GLB format** - Smaller than OBJ, faster loading
2. **Enable DRACO compression** - Even smaller file sizes
3. **Reuse geometries** - Clone models instead of reloading
4. **Level of Detail (LOD)** - Simplify models when far away
5. **Texture atlases** - Combine multiple textures into one

---

## 🎨 Style Guide

- **Colors**: Use the MedGuardian palette
- **Scale**: Consistent sizing (houses ~1 unit, medical center ~2 units)
- **Lighting**: Flat shading for Kenney style, point lights for glows
- **Animation**: Subtle rotations, gentle floating for "alive" feel

---

All Kenney assets are **CC0 (Public Domain)** - free to use for any project!
