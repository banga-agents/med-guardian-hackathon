/**
 * Blockchain Tower 3D Component
 * Visualizes blockchain as a growing tower of blocks
 */

import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SCENE_LAYOUT } from '@/lib/assets-config';
import { useSimulationStore } from '@/store/simulationStore';

interface BlockData {
  id: string;
  height: number;
  color: string;
  timestamp: number;
  txCount: number;
}

export function BlockchainTower() {
  const groupRef = useRef<THREE.Group>(null);
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const blockMeshesRef = useRef<THREE.Mesh[]>([]);
  
  const blockchainEvents = useSimulationStore((state) => state.blockchainEvents);
  const { position } = SCENE_LAYOUT.blockchainTower;
  
  // Update blocks when new blockchain events arrive
  useEffect(() => {
    if (blockchainEvents.length > blocks.length) {
      const newEvent = blockchainEvents[blockchainEvents.length - 1];
      
      const newBlock: BlockData = {
        id: newEvent.txHash.slice(0, 10),
        height: blocks.length,
        color: getEventColor(newEvent.type),
        timestamp: newEvent.timestamp,
        txCount: 1,
      };
      
      setBlocks((prev) => [...prev, newBlock]);
      
      // Animate new block addition
      setTimeout(() => {
        const mesh = blockMeshesRef.current[blockMeshesRef.current.length - 1];
        if (mesh) {
          mesh.scale.set(1, 1, 1);
        }
      }, 100);
    }
  }, [blockchainEvents, blocks.length]);
  
  // Animation
  useFrame((state) => {
    // Rotate entire tower slowly
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
    
    // Animate block glow
    blockMeshesRef.current.forEach((mesh, i) => {
      if (mesh && i === blocks.length - 1) {
        // Latest block pulses
        const intensity = 0.5 + Math.sin(state.clock.elapsedTime * 4) * 0.3;
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = intensity;
      }
    });
  });
  
  function getEventColor(type: string): string {
    switch (type) {
      case 'report_registered': return '#2ECC71'; // Green
      case 'access_granted': return '#3498DB'; // Blue
      case 'access_revoked': return '#E74C3C'; // Red
      case 'access_log': return '#F39C12'; // Orange
      default: return '#95A5A6'; // Gray
    }
  }
  
  return (
    <group ref={groupRef} position={position}>
      {/* Base platform */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[6, 7, 1, 8]} />
        <meshStandardMaterial
          color="#2C3E50"
          emissive="#375BD2"
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Label */}
      <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 1.5]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.7} />
      </mesh>
      
      {/* Blockchain blocks */}
      {blocks.map((block, index) => (
        <mesh
          key={block.id}
          ref={(el) => {
            if (el) blockMeshesRef.current[index] = el;
          }}
          position={[0, 2 + index * 1.2, 0]}
          scale={[0, 0, 0]}
        >
          <boxGeometry args={[3, 1, 3]} />
          <meshStandardMaterial
            color={block.color}
            emissive={block.color}
            emissiveIntensity={0.4}
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
      ))}
      
      {/* Connecting lines between blocks */}
      {blocks.length > 1 && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={blocks.length}
              array={new Float32Array(
                blocks.flatMap((_, i) => [0, 2.5 + i * 1.2, 0])
              )}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#375BD2" linewidth={2} />
        </line>
      )}
      
      {/* Beacon light on top */}
      <pointLight
        position={[0, 2 + blocks.length * 1.2 + 2, 0]}
        color="#375BD2"
        intensity={2}
        distance={20}
      />
      
      {/* Hash text floating above latest block */}
      {blocks.length > 0 && (
        <mesh position={[0, 2 + (blocks.length - 1) * 1.2 + 1.5, 0]}>
          <planeGeometry args={[4, 0.8]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}
