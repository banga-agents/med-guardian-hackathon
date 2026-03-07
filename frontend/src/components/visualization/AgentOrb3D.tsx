/**
 * AgentOrb3D — AI Patient-Agent visualization
 *
 * Each patient's AI agent is shown as a geometric orb floating above their home.
 * • Spins slowly and bobs up/down
 * • Pulses brighter when the agent is actively communicating (recent message / workflow)
 * • Shoots a thin energy beam to the CRE Nexus while a workflow is in progress
 * • Shows an HTML label: "AI Agent · <model>" on hover
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { PatientId } from '@/types/simulation';
import { SCENE_LAYOUT } from '@/lib/assets-config';
import { SIMULATED_PATIENT_IDS } from '@/lib/patient-ids';

// Must match SCENE_LAYOUT.patientHomes
const PATIENT_POS: Record<PatientId, [number, number, number]> = {
  self:    [  0, 0,  30],
  sarah:   [-26, 0, -22],
  robert:  [ 26, 0, -22],
  emma:    [-26, 0,  18],
  michael: [ 26, 0,  18],
};

const PATIENT_COLOR: Record<PatientId, string> = {
  self:    '#0F766E',
  sarah:   '#3498DB',
  robert:  '#E67E22',
  emma:    '#9B59B6',
  michael: '#27AE60',
};


const ORB_HEIGHT = 24; // units above ground — well above the buildings
const CRE_POS = new THREE.Vector3(...SCENE_LAYOUT.creNexus.position);

// ── Energy beam between agent orb and CRE nexus ──────────────────────────────
function AgentBeam({ from, color, active }: {
  from: [number, number, number];
  color: string;
  active: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const start = new THREE.Vector3(...from).setY(ORB_HEIGHT);
  const end   = CRE_POS.clone().setY(CRE_POS.y + 4);
  const mid   = start.clone().lerp(end, 0.5);
  const dir   = end.clone().sub(start);
  const length = dir.length();
  const axis  = new THREE.Vector3(0, 1, 0);
  const quat  = new THREE.Quaternion().setFromUnitVectors(axis, dir.normalize());

  useFrame((state) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = active
      ? 0.25 + Math.sin(state.clock.elapsedTime * 3) * 0.15
      : 0.04 + Math.sin(state.clock.elapsedTime * 0.8) * 0.03;
  });

  return (
    <mesh ref={meshRef} position={mid} quaternion={quat}>
      <cylinderGeometry args={[0.08, 0.08, length, 6, 1]} />
      <meshBasicMaterial color={color} transparent opacity={0.15} />
    </mesh>
  );
}

// ── Single AI agent orb ───────────────────────────────────────────────────────
function AgentOrb({ patientId }: { patientId: PatientId }) {
  const orbRef     = useRef<THREE.Mesh>(null);
  const ringRef    = useRef<THREE.Mesh>(null);
  const glowRef    = useRef<THREE.PointLight>(null);
  const groupRef   = useRef<THREE.Group>(null);
  const phaseOffset = useRef(Object.keys(PATIENT_POS).indexOf(patientId) * 1.1);

  const isConnected = useSimulationStore((s) => s.patients[patientId]?.isConnected ?? false);
  const hasRecentMessage = useSimulationStore((s) =>
    s.messages.some((m) => m.patientId === patientId && Date.now() - m.timestamp < 5000)
  );
  const hasActiveWorkflow = useSimulationStore((s) =>
    s.workflows.some((w) => w.patientId === patientId && w.stage !== 'completed' && w.stage !== 'error')
  );

  const color    = PATIENT_COLOR[patientId];
  const [px, , pz] = PATIENT_POS[patientId];
  const isActive = hasRecentMessage || hasActiveWorkflow;

  useFrame((state) => {
    const t = state.clock.elapsedTime + phaseOffset.current;

    if (orbRef.current) {
      orbRef.current.rotation.y  = t * 0.7;
      orbRef.current.rotation.x  = t * 0.3;
      const pulse = isActive
        ? 1.0 + Math.sin(t * 4) * 0.18
        : 1.0 + Math.sin(t * 1.2) * 0.06;
      orbRef.current.scale.setScalar(pulse);
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = t * 1.2;
      ringRef.current.rotation.x = Math.sin(t * 0.5) * 0.4 + 1.0;
    }

    if (groupRef.current) {
      groupRef.current.position.y = ORB_HEIGHT + Math.sin(t * 0.9) * 0.5;
    }

    if (glowRef.current) {
      glowRef.current.intensity = isActive
        ? 2.5 + Math.sin(t * 4) * 1.2
        : 0.8 + Math.sin(t * 1.2) * 0.3;
    }
  });

  if (!isConnected) return null;

  return (
    <group position={[px, 0, pz]}>
      {/* Energy beam to CRE */}
      <AgentBeam from={[px, 0, pz]} color={color} active={hasActiveWorkflow} />

      {/* Orb group (bobs up/down via useFrame) */}
      <group ref={groupRef} position={[0, ORB_HEIGHT, 0]}>
        {/* Core icosahedron */}
        <mesh ref={orbRef}>
          <icosahedronGeometry args={[1.1, 1]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isActive ? 0.9 : 0.4}
            roughness={0.15}
            metalness={0.8}
            wireframe={false}
          />
        </mesh>

        {/* Outer wireframe shell */}
        <mesh>
          <icosahedronGeometry args={[1.4, 1]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.25} />
        </mesh>

        {/* Orbit ring */}
        <mesh ref={ringRef}>
          <torusGeometry args={[1.8, 0.06, 6, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} />
        </mesh>

        {/* Glow light */}
        <pointLight ref={glowRef} color={color} intensity={1} distance={18} decay={2} />
      </group>
    </group>
  );
}

// ── Master export ─────────────────────────────────────────────────────────────
export function AgentOrbs() {
  const patientIds: PatientId[] = [...SIMULATED_PATIENT_IDS];
  return (
    <>
      {patientIds.map((id) => <AgentOrb key={id} patientId={id} />)}
    </>
  );
}
