/**
 * Environment 3D — bigger trees + ground decorations
 */

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ENVIRONMENT, SCENE_LAYOUT } from '@/lib/assets-config';

// Pre-compute fixed tree positions (deterministic, no Math.random at render)
const TREE_POSITIONS = (() => {
  const out: { type: 'small' | 'large'; pos: [number, number, number]; ry: number }[] = [];
  // Simple LCG for deterministic pseudo-random
  let seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // Cluster around each patient home
  Object.values(SCENE_LAYOUT.patientHomes).forEach((home) => {
    const [hx, , hz] = home.position;
    for (let i = 0; i < 5; i++) {
      const angle = rand() * Math.PI * 2;
      const dist  = 9 + rand() * 8;
      out.push({
        type: rand() > 0.45 ? 'large' : 'small',
        pos:  [hx + Math.cos(angle) * dist, 0, hz + Math.sin(angle) * dist] as [number, number, number],
        ry:   rand() * Math.PI * 2,
      });
    }
  });

  // Border row of large trees around the perimeter
  for (let x = -48; x <= 48; x += 11) {
    out.push({ type: 'large', pos: [x, 0, -52] as [number, number, number], ry: 0 });
    out.push({ type: 'large', pos: [x, 0,  52] as [number, number, number], ry: 0 });
  }
  for (let z = -42; z <= 42; z += 11) {
    out.push({ type: 'large', pos: [-55, 0, z] as [number, number, number], ry: 0 });
    out.push({ type: 'large', pos: [ 55, 0, z] as [number, number, number], ry: 0 });
  }

  return out;
})();

function Tree({ model, scale, pos, ry }: {
  model: THREE.Object3D; scale: number;
  pos: [number, number, number]; ry: number;
}) {
  const clone = useMemo(() => {
    const c = model.clone(true);
    c.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return c;
  }, [model]);

  return <primitive object={clone} position={pos} rotation={[0, ry, 0]} scale={[scale, scale, scale]} />;
}

export function Environment3D() {
  const { scene: treeSmallScene } = useGLTF(ENVIRONMENT.trees[0]);
  const { scene: treeLargeScene } = useGLTF(ENVIRONMENT.trees[1]);

  return (
    <group>
      {TREE_POSITIONS.map((t, i) => (
        <Tree
          key={i}
          model={t.type === 'large' ? treeLargeScene : treeSmallScene}
          scale={t.type === 'large' ? 4.5 : 3.0}
          pos={t.pos}
          ry={t.ry}
        />
      ))}

      {/* CRE Nexus ground ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[12, 14.5, 64]} />
        <meshBasicMaterial color="#6366F1" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

useGLTF.preload(ENVIRONMENT.trees[0]);
useGLTF.preload(ENVIRONMENT.trees[1]);
