/**
 * Main 3D Scene — Daytime, Sky, Kenney assets, interaction bubbles
 */

import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Grid, PerspectiveCamera, Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';

import { PatientHome3D } from './PatientHome3D';
import { MedicalCenter3D } from './MedicalCenter3D';
import { CRENexus } from './CRENexus';
import { BlockchainTower } from './BlockchainTower';
import { DataFlowParticles } from './DataFlowParticles';
import { Environment3D } from './Environment3D';
import { PatientCharacters, DoctorCharacters } from './Character3D';
import { InteractionLayer } from './DialogBubble3D';
import { Neighborhood3D } from './Neighborhood3D';
import { AgentOrbs } from './AgentOrb3D';
import { PrivacyFlow3D } from './PrivacyFlow3D';

import { useSimulationStore } from '@/store/simulationStore';
import { PatientId } from '@/types/simulation';
import { SIMULATED_PATIENT_IDS } from '@/lib/patient-ids';

export interface SceneContextSelection {
  type: 'patient' | 'cre' | 'access' | 'blockchain';
  patientId?: PatientId;
}

interface SceneProps {
  onContextSelect?: (selection: SceneContextSelection) => void;
}

function Scene({ onContextSelect }: SceneProps) {
  const patients = useSimulationStore((state) => state.patients);
  const alerts = useSimulationStore((state) => state.alerts);
  const doctors = useSimulationStore((state) => state.doctors);

  const doctorCountBySpecialty = {
    cardiology: Object.values(doctors).filter(d => d.specialty === 'cardiology' && d.isOnline).length,
    general:    Object.values(doctors).filter(d => d.specialty === 'general'    && d.isOnline).length,
    neurology:  Object.values(doctors).filter(d => d.specialty === 'neurology'  && d.isOnline).length,
  };

  const patientsWithAlerts = new Set(
    alerts.filter(a => a.severity === 'high' || a.severity === 'critical').map(a => a.patientId)
  );

  return (
    <>
      {/* ─── CAMERA — pulled back to show the wider neighbourhood ─── */}
      <PerspectiveCamera makeDefault position={[0, 30, 60]} fov={62} />
      <OrbitControls
        enablePan={true} enableZoom={true} enableRotate={true}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={10} maxDistance={140}
        target={[0, 3, 0]}
      />

      {/* ─── DAYTIME LIGHTING ─── */}
      <ambientLight intensity={0.7} color="#FFF5E6" />
      {/* Sun — positioned high and to the right for a nice afternoon */}
      <directionalLight
        position={[30, 60, 20]}
        intensity={2.2}
        castShadow
        color="#FFF8E7"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.1}
        shadow-camera-far={200}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      {/* Soft fill from opposite side */}
      <directionalLight position={[-20, 15, -20]} intensity={0.5} color="#C8E6FF" />
      {/* CRE nexus purple accent */}
      <pointLight position={[0, 15, 0]} intensity={1.2} color="#8B5CF6" distance={40} />

      {/* ─── SKY — vivid blue daytime sky ─── */}
      <Sky
        distance={450000}
        sunPosition={[1, 0.8, 0.1]}
        inclination={0.47}
        azimuth={0.22}
        mieCoefficient={0.003}
        mieDirectionalG={0.85}
        rayleigh={2.2}
        turbidity={5}
      />

      {/* ─── CLOUDS ─── */}
      <Clouds material={THREE.MeshLambertMaterial}>
        <Cloud position={[-40, 55, -30]} seed={1} scale={4}   volume={12} color="white" fade={50} />
        <Cloud position={[ 30, 60, -50]} seed={2} scale={3.5} volume={10} color="#F0F8FF" fade={50} />
        <Cloud position={[  0, 65,  20]} seed={3} scale={5}   volume={14} color="white" fade={60} />
        <Cloud position={[-60, 50, -10]} seed={4} scale={3}   volume={8}  color="#E8F4FF" fade={40} />
        <Cloud position={[ 55, 58,  10]} seed={5} scale={4.5} volume={11} color="white" fade={55} />
      </Clouds>

      {/* ─── GROUND — green grass ─── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#5A8A3C" roughness={0.9} metalness={0} />
      </mesh>

      {/* Road/path network */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
        <planeGeometry args={[8, 60]} />
        <meshStandardMaterial color="#6B7280" roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
        <planeGeometry args={[60, 8]} />
        <meshStandardMaterial color="#6B7280" roughness={0.95} metalness={0} />
      </mesh>

      {/* Subtle grid just for scale reference */}
      <Grid
        position={[0, -0.15, 0]}
        args={[100, 100]}
        cellSize={2}
        cellThickness={0.2}
        cellColor="#4A7A2C"
        sectionSize={20}
        sectionThickness={0.4}
        sectionColor="#3A6A1C"
        fadeDistance={60}
        fadeStrength={1}
        infiniteGrid
      />

      {/* ─── KENNEY CITY KIT: Patient Homes ─── */}
      {SIMULATED_PATIENT_IDS.filter((patientId) => Boolean(patients[patientId])).map((patientId) => (
        <PatientHome3D
          key={patientId}
          patientId={patientId}
          isActive={patients[patientId].isConnected}
          hasAlert={patientsWithAlerts.has(patientId)}
          onClick={() => onContextSelect?.({ type: 'patient', patientId })}
        />
      ))}

      {/* ─── KENNEY BLOCKY CHARACTERS: Patients + Doctors ─── */}
      <PatientCharacters />
      <DoctorCharacters />

      {/* ─── CYBERCITY FBX: Medical Centers ─── */}
      <group onClick={() => onContextSelect?.({ type: 'access' })}>
        <MedicalCenter3D type="cardiology" doctorCount={doctorCountBySpecialty.cardiology} />
        <MedicalCenter3D type="general" doctorCount={doctorCountBySpecialty.general} />
        <MedicalCenter3D type="neurology" doctorCount={doctorCountBySpecialty.neurology} />
      </group>

      {/* ─── CRE Nexus ─── */}
      <group onClick={() => onContextSelect?.({ type: 'cre' })}>
        <CRENexus />
      </group>

      {/* ─── Blockchain Tower ─── */}
      <group onClick={() => onContextSelect?.({ type: 'blockchain' })}>
        <BlockchainTower />
      </group>

      {/* ─── Data Flow Particles ─── */}
      <DataFlowParticles />

      {/* ─── KENNEY CITY KIT: Trees, Paths, Environment ─── */}
      <Environment3D />

      {/* ─── KENNEY CITY KIT: Neighbour houses around each patient ─── */}
      <Neighborhood3D />

      {/* ─── AI AGENT ORBS: floating above each patient home ─── */}
      <AgentOrbs />

      {/* ─── PRIVACY FLOW: animated data pipeline Wearable → CRE → Chain → Doctor ─── */}
      <PrivacyFlow3D />

      {/* ─── INTERACTION LAYER: dialog bubbles, agent comms ─── */}
      <InteractionLayer />
    </>
  );
}

function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0D1B2A]">
      <div className="text-center">
        <div className="w-14 h-14 border-4 border-[#0EA5E9] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[#0EA5E9] font-semibold text-sm">Loading Scene...</p>
        <p className="text-[#64748B] text-xs mt-1">Kenney City Kit · CyberCity · Characters</p>
      </div>
    </div>
  );
}

export function Scene3D({ onContextSelect }: SceneProps) {
  const [ready, setReady] = useState(false);

  return (
    <div className="w-full h-full relative">
      {!ready && <LoadingScreen />}
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 30, 60], fov: 62 }}
        onCreated={() => setReady(true)}
      >
        <Suspense fallback={null}>
          <Scene onContextSelect={onContextSelect} />
        </Suspense>
      </Canvas>

      {/* Controls hint */}
      <div className="absolute top-3 right-3 bg-black/30 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-[10px] text-white/60 space-y-0.5">
        <p>Drag · Rotate  &nbsp; Right drag · Pan  &nbsp; Scroll · Zoom</p>
      </div>

      {/* Asset badges */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
        {['City Kit Suburban', 'CyberCity FBX', 'Blocky Characters'].map((t) => (
          <span key={t} className="bg-black/40 backdrop-blur-sm text-[9px] text-white/50 px-2 py-0.5 rounded-full border border-white/10">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
