/**
 * CRE Nexus 3D Component
 * Central processing hub with rotating rings
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SCENE_LAYOUT } from '@/lib/assets-config';
import { useSimulationStore } from '@/store/simulationStore';

export function CRENexus() {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  
  const activeWorkflows = useSimulationStore(selectActiveWorkflows);
  const isProcessing = activeWorkflows.length > 0;
  
  // Animation
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Rotate rings at different speeds
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = time * 0.3;
      ring1Ref.current.rotation.y = time * 0.5;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = -time * 0.4;
      ring2Ref.current.rotation.z = time * 0.3;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.y = -time * 0.2;
      ring3Ref.current.rotation.z = -time * 0.4;
    }
    
    // Pulse core when processing
    if (coreRef.current && isProcessing) {
      const scale = 1 + Math.sin(time * 8) * 0.1;
      coreRef.current.scale.set(scale, scale, scale);
    }
    
    // Glow intensity
    if (glowRef.current) {
      const intensity = isProcessing 
        ? 3 + Math.sin(time * 4) * 1
        : 1.5 + Math.sin(time * 2) * 0.3;
      glowRef.current.intensity = intensity;
    }
  });
  
  const { position, scale } = SCENE_LAYOUT.creNexus;
  
  return (
    <group ref={groupRef} position={position}>
      {/* Central core */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshStandardMaterial
          color="#6366F1"
          emissive="#6366F1"
          emissiveIntensity={0.8}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      
      {/* Rotating rings */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[4, 0.15, 16, 100]} />
        <meshStandardMaterial
          color="#6366F1"
          emissive="#6366F1"
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
        />
      </mesh>
      
      <mesh ref={ring2Ref}>
        <torusGeometry args={[6, 0.1, 16, 100]} />
        <meshStandardMaterial
          color="#00B4D8"
          emissive="#00B4D8"
          emissiveIntensity={0.4}
          transparent
          opacity={0.6}
        />
      </mesh>
      
      <mesh ref={ring3Ref}>
        <torusGeometry args={[8, 0.08, 16, 100]} />
        <meshStandardMaterial
          color="#375BD2"
          emissive="#375BD2"
          emissiveIntensity={0.3}
          transparent
          opacity={0.5}
        />
      </mesh>
      
      {/* Inner glow */}
      <pointLight
        ref={glowRef}
        color="#6366F1"
        intensity={2}
        distance={30}
        decay={2}
      />
      
      {/* Processing indicator particles */}
      {isProcessing && (
        <>
          {Array.from({ length: 8 }).map((_, i) => (
            <mesh
              key={i}
              position={[
                Math.sin((i / 8) * Math.PI * 2) * 5,
                Math.cos((i / 8) * Math.PI * 2) * 5,
                0
              ]}
            >
              <sphereGeometry args={[0.1, 8, 8]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
          ))}
        </>
      )}
      
      {/* Label */}
      <mesh position={[0, 6, 0]}>
        <planeGeometry args={[4, 1]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// Selector helper
function selectActiveWorkflows(state: any) {
  return state.workflows.filter(
    (w: any) => w.stage !== 'completed' && w.stage !== 'error'
  );
}
