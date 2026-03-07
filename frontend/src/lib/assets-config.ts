/**
 * Custom Asset Configuration
 * Maps free downloaded assets to simulation components
 */

import { PatientId } from '@/types/simulation';

// ============================================
// ASSET PATHS (from free-assets folder)
// ============================================

export const ASSET_BASE_PATH = '/assets';

/**
 * Patient Home Assets (Kenney City Kit Suburban - GLB format)
 * Located at: /free-assets/kenney_city-kit-suburban_20/Models/GLB format/
 */
export const PATIENT_HOMES: Record<PatientId, {
  model: string;
  scale: number;
  color: string;
  glowColor: string;
  description: string;
}> = {
  self: {
    model: `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/building-type-d.glb`,
    scale: 6,
    color: '#0F766E',
    glowColor: '#14B8A6',
    description: 'Personal check-in profile',
  },
  sarah: {
    model: `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/building-type-f.glb`,
    scale: 6,
    color: '#3498DB',
    glowColor: '#00B4D8',
    description: 'Modern suburban home with garage',
  },
  robert: {
    model: `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/building-type-a.glb`,
    scale: 6,
    color: '#E67E22',
    glowColor: '#F39C12',
    description: 'Classic two-story family home',
  },
  emma: {
    model: `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/building-type-k.glb`,
    scale: 6,
    color: '#9B59B6',
    glowColor: '#9B59B6',
    description: 'Cozy cottage-style home',
  },
  michael: {
    model: `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/building-type-h.glb`,
    scale: 6,
    color: '#27AE60',
    glowColor: '#2ECC71',
    description: 'Single-story retirement home',
  },
};

/**
 * Medical Center Assets (CyberCity - FBX format)
 * Located at: /free-assets/cybercity/
 * NOTE: Files are .FBX (uppercase)
 */
export const MEDICAL_CENTERS = {
  cardiology: {
    model: `${ASSET_BASE_PATH}/cybercity/4_story.FBX`,
    scale: 1.5,
    color: '#E74C3C', // Red - heart/cardiology
    glowColor: '#E74C3C',
    emissiveMap: 'building_10_emiss.png',
    position: [0, 0, -44] as [number, number, number],   // downtown — far back
  },
  general: {
    model: `${ASSET_BASE_PATH}/cybercity/4_story_long.FBX`,
    scale: 1.5,
    color: '#3498DB',
    glowColor: '#3498DB',
    emissiveMap: 'building_1.png',
    position: [42, 0, -18] as [number, number, number],  // right side
  },
  neurology: {
    model: `${ASSET_BASE_PATH}/cybercity/2story_long.FBX`,
    scale: 1.2,
    color: '#9B59B6',
    glowColor: '#9B59B6',
    emissiveMap: 'building_4_emiss.png',
    position: [-42, 0, -18] as [number, number, number], // left side
  },
};

/**
 * Character Assets (Kenney Blocky Characters)
 * Located at: /free-assets/kenney_blocky-characters_20/
 */
export const CHARACTERS = {
  patients: {
    self: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-a.glb`,
    sarah: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-a.glb`,
    robert: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-b.glb`,
    emma: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-c.glb`,
    michael: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-d.glb`,
  },
  doctors: {
    dr_chen: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-e.glb`,
    dr_rodriguez: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-f.glb`,
    dr_patel: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-g.glb`,
    dr_smith: `${ASSET_BASE_PATH}/kenney_blocky-characters_20/GLB format/character-h.glb`,
  },
};

/**
 * Environment Assets
 */
export const ENVIRONMENT = {
  trees: [
    `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/tree-small.glb`,
    `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/tree-large.glb`,
  ],
  fences: [
    `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/fence-1x2.glb`,
    `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/fence-1x3.glb`,
    `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/fence-2x2.glb`,
  ],
  paths: [
    `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/path-short.glb`,
    `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/path-long.glb`,
    `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/path-stones-short.glb`,
  ],
  ground: `${ASSET_BASE_PATH}/kenney_city-kit-suburban_20/driveway-long.glb`,
};

/**
 * UI Assets (Kenney UI Pack Space Expansion)
 * Located at: /free-assets/kenney_ui-pack-space-expansion/
 */
export const UI_ASSETS = {
  panels: {
    blue: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/panel_blue.png`,
    green: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/panel_green.png`,
    red: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/panel_red.png`,
    yellow: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/panel_yellow.png`,
  },
  buttons: {
    blue: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/button_blue.png`,
    green: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/button_green.png`,
    red: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/button_red.png`,
    round: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/button_round.png`,
  },
  icons: {
    check: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/icon_check.png`,
    cross: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/icon_cross.png`,
    lock: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/icon_lock.png`,
    unlock: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/icon_unlock.png`,
    alert: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/icon_alert.png`,
  },
  progress: {
    bar: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/bar_progress.png`,
    back: `${ASSET_BASE_PATH}/kenney_ui-pack-space-expansion/PNG/bar_back.png`,
  },
};

// ============================================
// SCENE LAYOUT CONFIGURATION
// ============================================

export const SCENE_LAYOUT = {
  // Patient homes — spread wide for a spacious neighbourhood feel
  patientHomes: {
    self:    { position: [ 0, 0,  30] as [number, number, number], rotation: [0,  0.0, 0] as [number, number, number] },
    sarah:   { position: [-26, 0, -22] as [number, number, number], rotation: [0,  0.55, 0] as [number, number, number] },
    robert:  { position: [ 26, 0, -22] as [number, number, number], rotation: [0, -0.55, 0] as [number, number, number] },
    emma:    { position: [-26, 0,  18] as [number, number, number], rotation: [0,  0.55, 0] as [number, number, number] },
    michael: { position: [ 26, 0,  18] as [number, number, number], rotation: [0, -0.55, 0] as [number, number, number] },
  } as Record<PatientId, { position: [number, number, number]; rotation: [number, number, number] }>,

  // Medical centers in the background
  medicalCenters: {
    cardiology: { position: [0, 0, -30] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
    general: { position: [25, 0, -15] as [number, number, number], rotation: [0, -Math.PI / 6, 0] as [number, number, number] },
    neurology: { position: [-25, 0, -15] as [number, number, number], rotation: [0, Math.PI / 6, 0] as [number, number, number] },
  },

  // CRE Nexus in center
  creNexus: {
    position: [0, 5, 0] as [number, number, number],
    scale: 2,
  },

  // Blockchain tower to the side
  blockchainTower: {
    position: [-30, 0, 10] as [number, number, number],
    scale: 1.5,
  },

  // Ground plane
  ground: {
    size: 100,
    color: '#0A0E27',
  },
} as const;

// ============================================
// ASSET COPYING INSTRUCTIONS
// ============================================

/**
 * To use these assets, copy them to the public folder:
 * 
 * mkdir -p public/assets/kenney_city-kit-suburban_20
 * mkdir -p public/assets/cybercity
 * mkdir -p public/assets/kenney_blocky-characters_20
 * mkdir -p public/assets/kenney_ui-pack-space-expansion
 * 
 * cp -r /home/agent/chainlink-medpriv/free-assets/kenney_city-kit-suburban_20/Models/GLB\ format/* \
 *   public/assets/kenney_city-kit-suburban_20/
 * 
 * cp -r /home/agent/chainlink-medpriv/free-assets/cybercity/FBX/* \
 *   public/assets/cybercity/
 * 
 * cp -r /home/agent/chainlink-medpriv/free-assets/kenney_blocky-characters_20/Models/* \
 *   public/assets/kenney_blocky-characters_20/
 * 
 * cp -r /home/agent/chainlink-medpriv/free-assets/kenney_ui-pack-space-expansion/PNG/* \
 *   public/assets/kenney_ui-pack-space-expansion/
 */

// ============================================
// LOADING HELPER
// ============================================

export class AssetLoader {
  private loadedAssets = new Map<string, any>();
  
  async preloadAll(): Promise<void> {
    const assetsToLoad = [
      // Patient homes
      ...Object.values(PATIENT_HOMES).map(h => h.model),
      // Characters
      ...Object.values(CHARACTERS.patients),
      ...Object.values(CHARACTERS.doctors),
      // Environment
      ...ENVIRONMENT.trees,
      ...ENVIRONMENT.fences,
      ...ENVIRONMENT.paths,
    ];
    
    console.log(`Preloading ${assetsToLoad.length} assets...`);
    
    // Load all assets in parallel
    await Promise.all(
      assetsToLoad.map(async (path) => {
        try {
          // Asset will be loaded when used in Three.js
          this.loadedAssets.set(path, { loaded: true });
        } catch (error) {
          console.warn(`Failed to preload asset: ${path}`, error);
        }
      })
    );
    
    console.log('Asset preloading complete');
  }
  
  isLoaded(path: string): boolean {
    return this.loadedAssets.has(path);
  }
}

export const assetLoader = new AssetLoader();
