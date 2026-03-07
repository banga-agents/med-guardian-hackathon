/**
 * Neighborhood3D — additional Kenney suburban buildings around each patient home
 * Each patient gets 2 nearby neighbor houses to create a real neighbourhood feel
 */

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const BASE = '/assets/kenney_city-kit-suburban_20';

// Neighbor building definitions per patient quadrant
// Using building types that are NOT the main patient buildings (a, f, k, h)
const NEIGHBORS: {
  model: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  color: string;
}[] = [
  // ── Sarah's neighbourhood (top-left, around -26, 0, -22) ──
  { model: `${BASE}/building-type-b.glb`, position: [-16, 0, -14], rotation: [0,  0.3, 0], scale: 5, color: '#5B8DB8' },
  { model: `${BASE}/building-type-n.glb`, position: [-36, 0, -12], rotation: [0, -0.4, 0], scale: 5, color: '#7AAEC8' },

  // ── Robert's neighbourhood (top-right, around +26, 0, -22) ──
  { model: `${BASE}/building-type-c.glb`, position: [ 16, 0, -14], rotation: [0, -0.3, 0], scale: 5, color: '#D4914A' },
  { model: `${BASE}/building-type-m.glb`, position: [ 36, 0, -12], rotation: [0,  0.4, 0], scale: 5, color: '#C8835A' },

  // ── Emma's neighbourhood (bottom-left, around -26, 0, +18) ──
  { model: `${BASE}/building-type-d.glb`, position: [-16, 0,  10], rotation: [0,  0.3, 0], scale: 5, color: '#A87DB8' },
  { model: `${BASE}/building-type-l.glb`, position: [-36, 0,  10], rotation: [0, -0.4, 0], scale: 5, color: '#9B6AAE' },

  // ── Michael's neighbourhood (bottom-right, around +26, 0, +18) ──
  { model: `${BASE}/building-type-e.glb`, position: [ 16, 0,  10], rotation: [0, -0.3, 0], scale: 5, color: '#52AE72' },
  { model: `${BASE}/building-type-j.glb`, position: [ 36, 0,  10], rotation: [0,  0.4, 0], scale: 5, color: '#3A9E62' },
];

function NeighborBuilding({ model, position, rotation, scale, color }: typeof NEIGHBORS[0]) {
  const { scene } = useGLTF(model);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const col = new THREE.Color(color);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.65,
          metalness: 0.08,
        });
      }
    });
    return clone;
  }, [scene, color]);

  return (
    <primitive
      object={clonedScene}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
    />
  );
}

export function Neighborhood3D() {
  return (
    <group>
      {NEIGHBORS.map((n, i) => (
        <NeighborBuilding key={i} {...n} />
      ))}
    </group>
  );
}

// Preload neighbour models (deduplicated with filter)
const _uniqueModels = NEIGHBORS.map((n) => n.model).filter((m, i, arr) => arr.indexOf(m) === i);
_uniqueModels.forEach((m) => useGLTF.preload(m));
