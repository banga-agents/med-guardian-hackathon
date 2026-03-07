/**
 * Medical Center 3D Component
 * Uses CyberCity FBX assets via three-stdlib FBXLoader
 */

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FBXLoader } from 'three-stdlib';
import { MEDICAL_CENTERS } from '@/lib/assets-config';

type MedicalCenterType = 'cardiology' | 'general' | 'neurology';

interface MedicalCenter3DProps {
  type: MedicalCenterType;
  doctorCount?: number;
}

export function MedicalCenter3D({ type, doctorCount = 0 }: MedicalCenter3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.PointLight | null>(null);

  const config = MEDICAL_CENTERS[type];
  const colorHex = parseInt(config.color.replace('#', ''), 16);

  useEffect(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;

    const loader = new FBXLoader();
    loader.load(
      config.model,
      (fbx) => {
        // Uniform scale: FBX files come in large units, scale to scene
        fbx.scale.setScalar(config.scale * 0.015);

        fbx.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = new THREE.MeshStandardMaterial({
              color: 0x1a2535,
              emissive: colorHex,
              emissiveIntensity: 0.25,
              roughness: 0.5,
              metalness: 0.7,
            });
            child.material = mat;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        group.add(fbx);
      },
      undefined,
      (_err) => {
        // Fallback: procedural cyberpunk tower
        buildFallback(group);
      }
    );

    function buildFallback(g: THREE.Group) {
      const dims = type === 'cardiology' ? { w: 6, h: 20, d: 6 }
        : type === 'general' ? { w: 10, h: 17, d: 5 }
        : { w: 8, h: 13, d: 5 };

      // Main tower
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(dims.w, dims.h, dims.d),
        new THREE.MeshStandardMaterial({
          color: 0x1a2535,
          emissive: colorHex,
          emissiveIntensity: 0.2,
          roughness: 0.5,
          metalness: 0.7,
        })
      );
      tower.position.y = dims.h / 2;
      tower.castShadow = true;
      g.add(tower);

      // Window strips
      for (let i = 0; i < Math.floor(dims.h / 3); i++) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(dims.w * 0.8, 1.2),
          new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.15 })
        );
        win.position.set(0, 2.5 + i * 3, dims.d / 2 + 0.05);
        g.add(win);
      }

      // Medical cross
      const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 3.5, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: colorHex, emissiveIntensity: 0.8 })
      );
      crossV.position.set(0, dims.h + 2.5, 0);
      g.add(crossV);

      const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.8, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: colorHex, emissiveIntensity: 0.8 })
      );
      crossH.position.set(0, dims.h + 2.5, 0);
      g.add(crossH);
    }

    // Add beacon light
    const beacon = new THREE.PointLight(colorHex, 2, 35);
    beacon.position.set(0, 26, 0);
    group.add(beacon);
    beaconRef.current = beacon;

    // Doctor orbs
    for (let i = 0; i < doctorCount; i++) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x2ECC71, transparent: true, opacity: 0.85 })
      );
      const angle = (i / Math.max(doctorCount, 1)) * Math.PI * 2;
      orb.position.set(Math.sin(angle) * 8, 2, Math.cos(angle) * 8);
      group.add(orb);
    }

    return () => {
      // Dispose
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      group.clear();
    };
  }, [config, doctorCount, colorHex]);

  useFrame((state) => {
    if (beaconRef.current) {
      beaconRef.current.intensity = 1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.6;
    }
  });

  return (
    <group ref={groupRef} position={config.position as [number, number, number]}>
      {/* Ground ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[10, 12.5, 64]} />
        <meshBasicMaterial color={colorHex} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      {/* Second outer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[13, 14, 64]} />
        <meshBasicMaterial color={colorHex} transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
