/**
 * DialogBubble3D — 3D interaction visuals (data packets only)
 *
 * Simplified to pure 3D elements — no Html text overlays.
 * Text info lives in PatientActivityFeed (2D panel).
 *
 * What renders here:
 *   • DataPacket: arcing octahedrons from patient → CRE on active workflow
 *   • AlertFlare: brief flash above a patient home when an alert fires
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { SCENE_LAYOUT } from '@/lib/assets-config';
import { SIMULATED_PATIENT_IDS } from '@/lib/patient-ids';
import { PatientId } from '@/types/simulation';

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

// ── Animated data packet arcing from patient to CRE ───────────────────────────

function DataPacket({ from, to, color }: {
  from: THREE.Vector3; to: THREE.Vector3; color: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const progress = useRef(Math.random());

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    progress.current = (progress.current + delta * 0.45) % 1;
    const t = progress.current;
    const pos = new THREE.Vector3().lerpVectors(from, to, t);
    pos.y += Math.sin(t * Math.PI) * 8;
    meshRef.current.position.copy(pos);
    const s = 0.28 + Math.sin(t * Math.PI) * 0.18;
    meshRef.current.scale.setScalar(s);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity =
      t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 0.88;
    meshRef.current.rotation.y += delta * 3;
  });

  return (
    <mesh ref={meshRef}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color={color} transparent opacity={0.88} />
    </mesh>
  );
}

// ── Alert flare: brief ring pulse above patient home ─────────────────────────

function AlertFlare({ patientId }: { patientId: PatientId }) {
  const hasAlert = useSimulationStore((s) =>
    s.alerts.some((a) => a.patientId === patientId && !a.isRead &&
      Date.now() - a.timestamp < 5000)
  );
  const ringRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  const [px, , pz] = PATIENT_POS[patientId];

  useFrame((_, delta) => {
    if (!ringRef.current || !hasAlert) return;
    t.current = (t.current + delta * 1.2) % 1;
    const scale = 1 + t.current * 4;
    ringRef.current.scale.setScalar(scale);
    (ringRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - t.current) * 0.7;
  });

  if (!hasAlert) return null;

  return (
    <mesh ref={ringRef} position={[px, 12, pz]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1, 0.12, 8, 32]} />
      <meshBasicMaterial color="#EF4444" transparent opacity={0.7} />
    </mesh>
  );
}

// ── Active workflow packets ────────────────────────────────────────────────────

function ActivePackets() {
  const workflows = useSimulationStore((s) =>
    s.workflows.filter((w) => w.stage !== 'completed' && w.stage !== 'error')
  );
  const crePos = useMemo(() => new THREE.Vector3(...SCENE_LAYOUT.creNexus.position), []);

  const packets = workflows.slice(0, 6).map((w, i) => {
    const ids: PatientId[] = [...SIMULATED_PATIENT_IDS];
    const pid = w.patientId ?? ids[i % 4];
    const patPos = new THREE.Vector3(...PATIENT_POS[pid as PatientId]);
    return { id: w.id, from: patPos, to: crePos, color: PATIENT_COLOR[pid as PatientId] };
  });

  return (
    <>
      {packets.map((p) => (
        <DataPacket key={p.id} from={p.from} to={p.to} color={p.color} />
      ))}
    </>
  );
}

// ── Public export ──────────────────────────────────────────────────────────────

export function InteractionLayer() {
  const patientIds: PatientId[] = [...SIMULATED_PATIENT_IDS];
  return (
    <>
      <ActivePackets />
      {patientIds.map((id) => <AlertFlare key={id} patientId={id} />)}
    </>
  );
}
