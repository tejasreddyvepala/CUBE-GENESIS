// ============================================================
// CUBE GENESIS — Structure Renderer
// Settlement glow and structure visual updates.
// ============================================================

import * as THREE from 'three';
import { Structure } from '../entities/Structure.ts';
import { Settlement } from '../systems/CivilizationTracker.ts';
import { settlementGlowColor } from '../utils/color.ts';
import { CONFIG } from '../config.ts';

// Settlement ambient lights — one per settlement
interface SettlementGlow {
  light: THREE.PointLight;
  position: THREE.Vector3;
}

export class StructureRenderer {
  private scene: THREE.Scene;
  private settlementGlows: SettlementGlow[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ──────────────────────────────────────────────
  // UPDATE SETTLEMENT GLOW
  // ──────────────────────────────────────────────

  updateSettlementGlow(structures: Structure[], settlements: Settlement[]): void {
    // Remove excess glow lights
    while (this.settlementGlows.length > settlements.length) {
      const glow = this.settlementGlows.pop()!;
      this.scene.remove(glow.light);
    }

    // Add or update glow lights
    for (let i = 0; i < settlements.length; i++) {
      const s = settlements[i];
      const glowColor = settlementGlowColor(s.structures.length);
      const intensity = 0.5 + s.structures.length * 0.1;
      const radius = CONFIG.STRUCTURE_SETTLEMENT_RADIUS * 1.5;

      if (i < this.settlementGlows.length) {
        // Update existing
        const glow = this.settlementGlows[i];
        glow.light.color.copy(glowColor);
        glow.light.intensity = intensity;
        glow.light.distance = radius;
        glow.light.position.set(s.center.x, 2, s.center.z);
      } else {
        // Create new
        const light = new THREE.PointLight(glowColor.getHex(), intensity, radius);
        light.position.set(s.center.x, 2, s.center.z);
        this.scene.add(light);
        this.settlementGlows.push({ light, position: new THREE.Vector3(s.center.x, 2, s.center.z) });
      }
    }
  }

  // ──────────────────────────────────────────────
  // CREATE STRUCTURE MESH (used externally if needed)
  // ──────────────────────────────────────────────

  createStructureMesh(type: string): THREE.Mesh {
    let geo: THREE.BufferGeometry;
    let mat: THREE.Material;

    switch (type) {
      case 'shelter':
        geo = new THREE.SphereGeometry(2.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        mat = new THREE.MeshLambertMaterial({
          color: 0x00cccc,
          emissive: new THREE.Color(0x00bbcc),
          wireframe: true,
          transparent: true,
          opacity: 0.6,
        });
        break;
      case 'beacon':
        geo = new THREE.BoxGeometry(0.5, 4.0, 0.5);
        mat = new THREE.MeshLambertMaterial({
          color: 0xffffff,
          emissive: new THREE.Color(CONFIG.STRUCTURE_EMISSIVE),
          emissiveIntensity: 0.8,
        });
        break;
      default: // wall
        geo = new THREE.BoxGeometry(1.5, 2.0, 1.5);
        mat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(CONFIG.STRUCTURE_COLOR),
          transparent: true,
          opacity: 0.85,
        });
    }

    return new THREE.Mesh(geo, mat);
  }

  dispose(): void {
    for (const glow of this.settlementGlows) {
      this.scene.remove(glow.light);
    }
    this.settlementGlows = [];
  }
}
