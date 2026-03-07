/**
 * Character 3D Component
 * Uses Kenney Blocky Characters GLB assets for patients and doctors
 */

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PatientId } from '@/types/simulation';
import { SCENE_LAYOUT } from '@/lib/assets-config';
import { useSimulationStore } from '@/store/simulationStore';
import { SIMULATED_PATIENT_IDS } from '@/lib/patient-ids';

const ASSET_BASE = '/assets/kenney_blocky-characters_20/GLB format';

// Patient to character mapping with their color tint
const PATIENT_CHARACTERS: Record<PatientId, { model: string; color: string; offset: [number, number, number] }> = {
  self: { model: `${ASSET_BASE}/character-a.glb`, color: '#0F766E', offset: [0, 0, 0] },
  sarah: { model: `${ASSET_BASE}/character-a.glb`, color: '#3498DB', offset: [3, 0, 0] },
  robert: { model: `${ASSET_BASE}/character-b.glb`, color: '#E67E22', offset: [3, 0, 0] },
  emma: { model: `${ASSET_BASE}/character-c.glb`, color: '#9B59B6', offset: [-3, 0, 0] },
  michael: { model: `${ASSET_BASE}/character-d.glb`, color: '#27AE60', offset: [3, 0, 0] },
};

// Doctor characters near medical centers
const DOCTOR_CHARACTERS = [
  { model: `${ASSET_BASE}/character-e.glb`, position: [-4, 0, -28] as [number, number, number], color: '#E74C3C' },
  { model: `${ASSET_BASE}/character-f.glb`, position: [4, 0, -28] as [number, number, number], color: '#E74C3C' },
  { model: `${ASSET_BASE}/character-g.glb`, position: [22, 0, -13] as [number, number, number], color: '#3498DB' },
  { model: `${ASSET_BASE}/character-h.glb`, position: [-23, 0, -13] as [number, number, number], color: '#9B59B6' },
];

// Individual patient character
function PatientCharacter({ patientId }: { patientId: PatientId }) {
  const groupRef = useRef<THREE.Group>(null);
  const config = PATIENT_CHARACTERS[patientId];
  const layout = SCENE_LAYOUT.patientHomes[patientId];
  const { scene } = useGLTF(config.model);
  const isActive = useSimulationStore((state) => state.patients[patientId]?.isConnected ?? false);
  const hasAlert = useSimulationStore((state) =>
    state.alerts.some((a) => a.patientId === patientId && !a.isRead && (a.severity === 'high' || a.severity === 'critical'))
  );

  useEffect(() => {
    if (!groupRef.current) return;
    const cloned = scene.clone();
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        // Apply tint: primary meshes get patient color, keep face/details natural
        const mat = (child.material as THREE.MeshStandardMaterial).clone();
        mat.color = new THREE.Color(config.color);
        mat.roughness = 0.6;
        mat.metalness = 0.1;
        if (hasAlert) {
          mat.emissive = new THREE.Color('#E74C3C');
          mat.emissiveIntensity = 0.3;
        }
        child.material = mat;
      }
    });
    cloned.scale.set(1.2, 1.2, 1.2);
    groupRef.current.add(cloned);
    return () => { groupRef.current?.clear(); };
  }, [scene, config.color, hasAlert]);

  // Idle bob animation
  useFrame((state) => {
    if (groupRef.current && isActive) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5 + layout.position[0]) * 0.08;
    }
  });

  // Position character just outside the home
  const pos: [number, number, number] = [
    layout.position[0] + config.offset[0],
    layout.position[1],
    layout.position[2] + config.offset[2],
  ];

  // Face toward the CRE nexus (center)
  const angle = Math.atan2(0 - pos[2], 0 - pos[0]) - Math.PI / 2;

  return (
    <group
      ref={groupRef}
      position={pos}
      rotation={[0, angle, 0]}
    >
      {/* Connection indicator floating above */}
      {isActive && (
        <mesh position={[0, 8, 0]}>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshBasicMaterial color={hasAlert ? '#E74C3C' : '#2ECC71'} />
        </mesh>
      )}
    </group>
  );
}

// Individual doctor character
function DoctorCharacter({ config }: { config: typeof DOCTOR_CHARACTERS[0] }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(config.model);

  useEffect(() => {
    if (!groupRef.current) return;
    const cloned = scene.clone();
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        const mat = (child.material as THREE.MeshStandardMaterial).clone();
        mat.color = new THREE.Color('#FFFFFF');
        mat.emissive = new THREE.Color(config.color);
        mat.emissiveIntensity = 0.1;
        child.material = mat;
      }
    });
    cloned.scale.set(1.2, 1.2, 1.2);
    groupRef.current.add(cloned);
    return () => { groupRef.current?.clear(); };
  }, [scene, config.color]);

  // Face toward center
  const angle = Math.atan2(0 - config.position[2], 0 - config.position[0]) - Math.PI / 2;

  return (
    <group ref={groupRef} position={config.position} rotation={[0, angle, 0]} />
  );
}

// Export all patient characters
export function PatientCharacters() {
  return (
    <>
      {SIMULATED_PATIENT_IDS.map((patientId) => (
        <PatientCharacter key={patientId} patientId={patientId} />
      ))}
    </>
  );
}

// Export all doctor characters
export function DoctorCharacters() {
  return (
    <>
      {DOCTOR_CHARACTERS.map((doc, i) => (
        <DoctorCharacter key={i} config={doc} />
      ))}
    </>
  );
}

// Preload all character models
useGLTF.preload(`${ASSET_BASE}/character-a.glb`);
useGLTF.preload(`${ASSET_BASE}/character-b.glb`);
useGLTF.preload(`${ASSET_BASE}/character-c.glb`);
useGLTF.preload(`${ASSET_BASE}/character-d.glb`);
useGLTF.preload(`${ASSET_BASE}/character-e.glb`);
useGLTF.preload(`${ASSET_BASE}/character-f.glb`);
useGLTF.preload(`${ASSET_BASE}/character-g.glb`);
useGLTF.preload(`${ASSET_BASE}/character-h.glb`);
