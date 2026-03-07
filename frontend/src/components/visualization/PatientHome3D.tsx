/**
 * Patient Home 3D Component
 * Kenney City Kit Suburban GLB buildings — useMemo + primitive pattern
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PatientId } from '@/types/simulation';
import { PATIENT_HOMES, SCENE_LAYOUT } from '@/lib/assets-config';
import { useSimulationStore } from '@/store/simulationStore';

interface PatientHome3DProps {
  patientId: PatientId;
  isActive: boolean;
  hasAlert: boolean;
  onClick?: () => void;
}

function HomeModel({ patientId, isActive, hasAlert, onClick }: PatientHome3DProps) {
  const config = PATIENT_HOMES[patientId];
  const layout = SCENE_LAYOUT.patientHomes[patientId];
  const glowRef = useRef<THREE.PointLight>(null);

  const { scene } = useGLTF(config.model);

  // Clone and re-material with patient color, every time state changes
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const color = new THREE.Color(config.color);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.6,
          metalness: 0.1,
          flatShading: false,
        });
        if (hasAlert) {
          mat.emissive = new THREE.Color('#E74C3C');
          mat.emissiveIntensity = 0.4;
        } else if (isActive) {
          mat.emissive = new THREE.Color(config.glowColor);
          mat.emissiveIntensity = 0.15;
        }
        child.material = mat;
      }
    });
    return clone;
  }, [scene, config.color, config.glowColor, isActive, hasAlert]);

  // Animate glow light
  useFrame((state) => {
    if (glowRef.current) {
      const t = state.clock.elapsedTime;
      if (hasAlert) {
        glowRef.current.intensity = 1.5 + Math.sin(t * 5) * 0.8;
      } else if (isActive) {
        glowRef.current.intensity = 0.6 + Math.sin(t * 1.5) * 0.2;
      }
    }
  });

  const [px, py, pz] = layout.position;
  const [rx, ry, rz] = layout.rotation;

  return (
    <group
      position={[px, py, pz]}
      rotation={[rx, ry, rz]}
      onClick={onClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      {/* ─── KENNEY CITY KIT SUBURBAN BUILDING ─── */}
      <primitive
        object={clonedScene}
        scale={[config.scale, config.scale, config.scale]}
      />

      {/* Glow light under the house */}
      {(isActive || hasAlert) && (
        <pointLight
          ref={glowRef}
          color={hasAlert ? '#E74C3C' : config.glowColor}
          intensity={hasAlert ? 1.5 : 0.6}
          distance={14}
          decay={2}
          position={[0, 2, 0]}
        />
      )}

      {/* Status sphere floating above */}
      {isActive && (
        <mesh position={[0, 6, 0]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshBasicMaterial
            color={hasAlert ? '#E74C3C' : '#2ECC71'}
            transparent
            opacity={0.9}
          />
        </mesh>
      )}

      {/* Alert ring pulsing on ground */}
      {hasAlert && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4, 4.8, 48]} />
          <meshBasicMaterial
            color="#E74C3C"
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

export function PatientHome3D(props: PatientHome3DProps) {
  return <HomeModel {...props} />;
}

// Preload all models
useGLTF.preload(PATIENT_HOMES.sarah.model);
useGLTF.preload(PATIENT_HOMES.robert.model);
useGLTF.preload(PATIENT_HOMES.emma.model);
useGLTF.preload(PATIENT_HOMES.michael.model);
