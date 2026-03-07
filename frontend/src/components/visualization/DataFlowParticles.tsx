/**
 * Data Flow Particles
 * Visualizes encrypted data moving through the system
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { SCENE_LAYOUT } from '@/lib/assets-config';

interface ParticleData {
  id: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
  speed: number;
  type: 'encrypted' | 'plaintext' | 'processing';
}

export function DataFlowParticles() {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<ParticleData[]>([]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  const workflows = useSimulationStore((state) => state.workflows);
  const dataFlows = useSimulationStore((state) => state.dataFlows);
  
  // Create particle system
  const particleCount = 100;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Colors for different particle types
  const colors = {
    encrypted: new THREE.Color('#00B4D8'),   // Medical blue
    plaintext: new THREE.Color('#F39C12'),   // Warning orange
    processing: new THREE.Color('#6366F1'),  // CRE indigo
  };
  
  // Generate paths between scene elements
  const paths = useMemo(() => {
    const patientPositions = Object.values(SCENE_LAYOUT.patientHomes).map(h => h.position);
    const crePosition = SCENE_LAYOUT.creNexus.position;
    const blockchainPosition = SCENE_LAYOUT.blockchainTower.position;
    const medicalPositions = Object.values(SCENE_LAYOUT.medicalCenters).map(m => m.position);
    
    return {
      patientToCRE: patientPositions.map(p => ({ from: new THREE.Vector3(...p), to: new THREE.Vector3(...crePosition) })),
      creToBlockchain: { from: new THREE.Vector3(...crePosition), to: new THREE.Vector3(...blockchainPosition) },
      creToMedical: medicalPositions.map(m => ({ from: new THREE.Vector3(...crePosition), to: new THREE.Vector3(...m) })),
    };
  }, []);
  
  // Animation
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    // Create new particles based on active workflows
    const activeWorkflowCount = workflows.filter(
      w => w.stage !== 'completed' && w.stage !== 'error'
    ).length;
    
    // Spawn new particles
    if (particlesRef.current.length < particleCount && activeWorkflowCount > 0) {
      const path = paths.patientToCRE[Math.floor(Math.random() * paths.patientToCRE.length)];
      
      particlesRef.current.push({
        id: Math.random().toString(36).substr(2, 9),
        from: path.from.clone(),
        to: path.to.clone(),
        progress: 0,
        speed: 0.3 + Math.random() * 0.4,
        type: Math.random() > 0.7 ? 'processing' : 'encrypted',
      });
    }
    
    // Update particles
    let instanceIndex = 0;
    
    particlesRef.current = particlesRef.current.filter((particle) => {
      // Update progress
      particle.progress += particle.speed * delta;
      
      // Remove completed particles
      if (particle.progress >= 1) {
        // Spawn return particle from CRE to blockchain or medical
        if (Math.random() > 0.5) {
          const medicalPath = paths.creToMedical[Math.floor(Math.random() * paths.creToMedical.length)];
          particlesRef.current.push({
            id: Math.random().toString(36).substr(2, 9),
            from: medicalPath.from.clone(),
            to: medicalPath.to.clone(),
            progress: 0,
            speed: 0.3 + Math.random() * 0.4,
            type: 'encrypted',
          });
        }
        return false;
      }
      
      // Calculate position along path
      const position = new THREE.Vector3().lerpVectors(
        particle.from,
        particle.to,
        particle.progress
      );
      
      // Add some arc to the path
      const height = Math.sin(particle.progress * Math.PI) * 3;
      position.y += height;
      
      // Update instance
      dummy.position.copy(position);
      dummy.scale.setScalar(0.3 + Math.sin(particle.progress * Math.PI) * 0.2);
      dummy.updateMatrix();
      
      meshRef.current!.setMatrixAt(instanceIndex, dummy.matrix);
      meshRef.current!.setColorAt(instanceIndex, colors[particle.type]);
      
      instanceIndex++;
      return true;
    });
    
    // Hide unused instances
    for (let i = instanceIndex; i < particleCount; i++) {
      dummy.position.set(0, -1000, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });
  
  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshBasicMaterial />
      </instancedMesh>
      
      {/* Glow effect for particles */}
      <pointLight
        position={[0, 5, 0]}
        color="#00B4D8"
        intensity={1}
        distance={50}
      />
    </group>
  );
}
