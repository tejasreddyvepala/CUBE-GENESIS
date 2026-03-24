// ============================================================
// CUBE GENESIS — Attacker Renderer
// Per-frame mesh updates for attacker entities.
// ============================================================

import * as THREE from 'three';
import { Attacker } from '../entities/Attacker.ts';
import { CONFIG, AttackerWaveType } from '../config.ts';
import { attackerColor } from '../utils/color.ts';

const WAVE_INDEX: Record<AttackerWaveType, number> = {
  drifter: 0,
  seeker: 1,
  pack: 2,
  predator: 3,
  siege: 4,
  swarm: 5,
};

export class AttackerRenderer {
  // ──────────────────────────────────────────────
  // UPDATE MESH (called each frame per attacker)
  // ──────────────────────────────────────────────

  updateAttackerMesh(attacker: Attacker): void {
    // Position is synced inside Attacker.update()
    // Extra visual polish here

    // Pulse emissive based on health
    const mat = attacker.mesh.material as THREE.MeshLambertMaterial;
    const waveConfig = CONFIG.ATTACKER_WAVES[attacker.type] as { hp: number };
    const healthFraction = attacker.hp / waveConfig.hp;
    const emissiveIntensity = 0.1 + (1 - healthFraction) * 0.4;
    const waveIdx = WAVE_INDEX[attacker.type];
    const baseColor = attackerColor(waveIdx);
    mat.emissive.copy(baseColor).multiplyScalar(emissiveIntensity);

    // Predator: pulse when near a cube (detected from scale)
    if (attacker.type === 'predator') {
      const pulse = 0.9 + Math.sin(Date.now() * 0.006) * 0.1;
      attacker.mesh.scale.setScalar(0.5 * pulse);
    }

    // Siege: slow pulsing glow
    if (attacker.type === 'siege') {
      const siegeScale = CONFIG.ATTACKER_WAVES.siege.sizeMultiplier;
      const pulse = siegeScale * (0.95 + Math.sin(Date.now() * 0.001) * 0.05);
      attacker.mesh.scale.setScalar(pulse);
    }
  }

  // ──────────────────────────────────────────────
  // GEOMETRY & MATERIAL FACTORIES (cached internally in Attacker.ts)
  // These are exposed for potential external use.
  // ──────────────────────────────────────────────

  getAttackerGeometry(type: AttackerWaveType): THREE.BufferGeometry {
    switch (type) {
      case 'drifter':  return new THREE.BoxGeometry(0.6, 0.6, 0.6);
      case 'seeker':   return new THREE.OctahedronGeometry(0.5);
      case 'pack':     return new THREE.TetrahedronGeometry(0.5);
      case 'predator': return new THREE.IcosahedronGeometry(0.5, 0);
      case 'siege':    return new THREE.BoxGeometry(3, 3, 3);
      case 'swarm':    return new THREE.OctahedronGeometry(0.18);
    }
  }

  getAttackerMaterial(type: AttackerWaveType): THREE.MeshLambertMaterial {
    const waveIdx = WAVE_INDEX[type];
    const color = attackerColor(waveIdx);
    const emissive = color.clone().multiplyScalar(0.3);
    return new THREE.MeshLambertMaterial({ color, emissive });
  }
}
