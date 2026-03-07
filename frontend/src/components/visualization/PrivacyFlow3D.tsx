/**
 * PrivacyFlow3D — Animated Privacy Pipeline Visualization
 *
 * Shows the complete Chainlink-powered privacy data flow:
 *   Patient Wearables ──[🔒 encrypted]──▶ CRE TEE ──[⚡ processed]──▶ Blockchain ──[🔑 authorized]──▶ Doctor
 *
 * Color coding:
 *   Patient color  ──  encrypted wearable stream
 *   #F59E0B (amber) ── CRE processing → blockchain
 *   #0EA5E9 (sky)   ── authorized doctor view
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { useSimulationStore } from '@/store/simulationStore';
import { SIMULATED_PATIENT_IDS } from '@/lib/patient-ids';
import { PatientId } from '@/types/simulation';

// ─── Positions (must match DialogBubble3D + assets-config) ───────────────────

const PATIENT_POS: Record<PatientId, [number, number, number]> = {
  self:    [  0, 4,  30],
  sarah:   [-26, 4, -22],
  robert:  [ 26, 4, -22],
  emma:    [-26, 4,  18],
  michael: [ 26, 4,  18],
};

const PATIENT_COLOR: Record<PatientId, string> = {
  self:    '#0F766E',
  sarah:   '#3B82F6',
  robert:  '#F97316',
  emma:    '#A855F7',
  michael: '#22C55E',
};

// CRE & blockchain positions from SCENE_LAYOUT
const CRE_POS:   [number, number, number] = [0,   5,  0];
const CHAIN_POS: [number, number, number] = [-30, 5, 10];
// Doctor "endpoint" — abstract position between medical centers
const DOCTOR_POS: [number, number, number] = [20, 5, -30];

// ─── Single animated packet arc ───────────────────────────────────────────────

interface StreamProps {
  from: [number, number, number];
  to:   [number, number, number];
  color: string;
  count?: number;
  speed?: number;
  arcHeight?: number;
  baseOffset?: number;
  size?: number;
}

function PacketStream({ from, to, color, count = 4, speed = 0.4, arcHeight = 10, baseOffset = 0, size = 0.22 }: StreamProps) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const progresses = useRef<number[]>(
    Array.from({ length: count }, (_, i) => ((i / count) + baseOffset) % 1)
  );

  const fromV = useMemo(() => new THREE.Vector3(...from), []);
  const toV   = useMemo(() => new THREE.Vector3(...to),   []);
  const midV  = useMemo(() => {
    const m = fromV.clone().lerp(toV, 0.5);
    m.y += arcHeight;
    return m;
  }, [fromV, toV, arcHeight]);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(fromV, midV, toV), [fromV, midV, toV]);

  useFrame((_, delta) => {
    progresses.current.forEach((p, i) => {
      progresses.current[i] = (p + delta * speed) % 1;
      const mesh = refs.current[i];
      if (!mesh) return;
      const t = progresses.current[i];
      const pt = curve.getPoint(t);
      mesh.position.copy(pt);
      // fade at endpoints, scale pulse
      const alpha = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;
      const s = size * (0.8 + Math.sin(t * Math.PI) * 0.5);
      mesh.scale.setScalar(s);
      (mesh.material as THREE.MeshBasicMaterial).opacity = alpha * 0.88;
      mesh.rotation.y += delta * 3;
    });
  });

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} />
        </mesh>
      ))}
    </>
  );
}

// ─── Glowing node orb at each pipeline stage ─────────────────────────────────

function PipelineOrb({ position, color, pulseSpeed = 1 }: {
  position: [number, number, number];
  color: string;
  pulseSpeed?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random() * Math.PI * 2);

  useFrame((_, delta) => {
    t.current += delta * pulseSpeed;
    if (meshRef.current) {
      const s = 0.9 + Math.sin(t.current) * 0.1;
      meshRef.current.scale.setScalar(s);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.6;
      ringRef.current.rotation.x += delta * 0.3;
    }
  });

  return (
    <group position={position}>
      {/* Core sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
      {/* Spinning ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[1.4, 0.08, 8, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      {/* Point light glow */}
      <pointLight color={color} intensity={1.5} distance={12} />
    </group>
  );
}

// (labels removed — pipeline info lives in BlockchainDiagram panel)

// ─── Main export ───────────────────────────────────────────────────────────────

export function PrivacyFlow3D() {
  const isRunning = useSimulationStore((s) => s.simulation.isRunning && !s.simulation.isPaused);
  const accessGrants = useSimulationStore((s) => s.accessGrants.filter(g => g.isActive));

  if (!isRunning) return null;

  const patientIds: PatientId[] = [...SIMULATED_PATIENT_IDS];

  return (
    <>
      {/* ── Stage 1: Patient wearables → CRE TEE (patient-colored, encrypted) ── */}
      {patientIds.map((pid, i) => (
        <PacketStream
          key={`pt-cre-${pid}`}
          from={PATIENT_POS[pid]}
          to={CRE_POS}
          color={PATIENT_COLOR[pid]}
          count={3}
          speed={0.32}
          arcHeight={12}
          baseOffset={i * 0.25}
          size={0.22}
        />
      ))}

      {/* ── Stage 2: CRE TEE → Blockchain (amber, processing) ── */}
      <PacketStream
        from={CRE_POS}
        to={CHAIN_POS}
        color="#F59E0B"
        count={5}
        speed={0.55}
        arcHeight={9}
        baseOffset={0}
        size={0.28}
      />

      {/* ── Stage 3: Blockchain → Doctor (sky blue, authorized) — when grants exist ── */}
      {accessGrants.length > 0 && (
        <PacketStream
          from={CHAIN_POS}
          to={DOCTOR_POS}
          color="#0EA5E9"
          count={4}
          speed={0.45}
          arcHeight={10}
          baseOffset={0.1}
          size={0.25}
        />
      )}

      {/* ── Pipeline node orbs (pure 3D, no labels) ── */}
      <PipelineOrb position={CRE_POS}   color="#8B5CF6" pulseSpeed={1.2} />
      <PipelineOrb position={CHAIN_POS} color="#F59E0B" pulseSpeed={0.8} />
      {accessGrants.length > 0 && (
        <PipelineOrb position={DOCTOR_POS} color="#0EA5E9" pulseSpeed={1.0} />
      )}
    </>
  );
}
