// ============================================================
// CUBE GENESIS — Base Entity
// Each faction's home fortress. Has HP — destroy it to win.
// Composed of a tall central pillar + surrounding ring walls.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';

export class Base {
  id: number;
  factionId: number;       // 0 = hero (teal), 1 = enemy (red)
  position: THREE.Vector3;
  hp: number;
  maxHp: number;
  isDestroyed: boolean = false;

  // Three.js
  private scene: THREE.Scene;
  private pillarMesh: THREE.Mesh;
  private ringMesh: THREE.Mesh;
  private light: THREE.PointLight;
  private healthBar: THREE.Mesh;    // flat box above pillar showing HP fraction

  // Cached geometries / materials
  private static _pillarGeo: THREE.CylinderGeometry | null = null;
  private static _ringGeo:   THREE.TorusGeometry   | null = null;
  private static _barGeo:    THREE.BoxGeometry      | null = null;

  constructor(id: number, factionId: number, position: THREE.Vector3, scene: THREE.Scene) {
    this.id       = id;
    this.factionId = factionId;
    this.position  = position.clone();
    this.hp        = CONFIG.BASE_HP;
    this.maxHp     = CONFIG.BASE_HP;
    this.scene     = scene;

    const isHero   = factionId === CONFIG.FACTION_HERO;
    const color    = isHero ? 0x00ffc8 : 0xff2244;
    const emissive = isHero ? 0x007744 : 0x660011;

    // ── Pillar ──
    if (!Base._pillarGeo) Base._pillarGeo = new THREE.CylinderGeometry(1.2, 2.0, 10, 8);
    const pillarMat = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(emissive) });
    this.pillarMesh = new THREE.Mesh(Base._pillarGeo, pillarMat);
    this.pillarMesh.position.set(position.x, 5, position.z);
    scene.add(this.pillarMesh);

    // ── Ring / fortress wall ──
    if (!Base._ringGeo) Base._ringGeo = new THREE.TorusGeometry(5, 0.6, 6, 16);
    const ringMat = new THREE.MeshLambertMaterial({
      color,
      emissive: new THREE.Color(emissive),
      transparent: true,
      opacity: 0.7,
    });
    this.ringMesh = new THREE.Mesh(Base._ringGeo, ringMat);
    this.ringMesh.rotation.x = Math.PI / 2;
    this.ringMesh.position.set(position.x, 0.6, position.z);
    scene.add(this.ringMesh);

    // ── Glow light ──
    this.light = new THREE.PointLight(color, CONFIG.BASE_LIGHT_INTENSITY, CONFIG.BASE_LIGHT_RADIUS);
    this.light.position.set(position.x, 8, position.z);
    scene.add(this.light);

    // ── HP bar ──
    if (!Base._barGeo) Base._barGeo = new THREE.BoxGeometry(1, 0.3, 0.3);
    const barMat = new THREE.MeshLambertMaterial({ color });
    this.healthBar = new THREE.Mesh(Base._barGeo, barMat);
    this.healthBar.position.set(position.x, 12, position.z);
    scene.add(this.healthBar);
  }

  // ──────────────────────────────────────────────
  // DAMAGE
  // ──────────────────────────────────────────────

  takeDamage(amount: number): void {
    if (this.isDestroyed) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this._destroy();
    else this._updateVisuals();
  }

  private _updateVisuals(): void {
    const frac = this.hp / this.maxHp;
    // Shrink health bar width
    this.healthBar.scale.x = Math.max(0.01, frac);
    // Dim pillar emissive as HP drops
    const mat = this.pillarMesh.material as THREE.MeshLambertMaterial;
    mat.emissiveIntensity = frac;
    this.light.intensity = CONFIG.BASE_LIGHT_INTENSITY * frac;
  }

  private _destroy(): void {
    this.isDestroyed = true;
    // Flash red/white and hide
    this.pillarMesh.visible = false;
    this.ringMesh.visible   = false;
    this.healthBar.visible  = false;
    this.light.intensity    = 0;
  }

  // ──────────────────────────────────────────────
  // UPDATE — slow ring rotation
  // ──────────────────────────────────────────────

  update(worldAge: number): void {
    if (this.isDestroyed) return;
    this.ringMesh.rotation.z = worldAge * 0.005;
    // Pulse pillar
    const pulse = 1.0 + Math.sin(worldAge * 0.03) * 0.04;
    this.pillarMesh.scale.y = pulse;
  }

  // ──────────────────────────────────────────────
  // SERIALIZATION
  // ──────────────────────────────────────────────

  serialize(): { id: number; factionId: number; position: [number, number, number]; hp: number } {
    return {
      id: this.id,
      factionId: this.factionId,
      position: [this.position.x, this.position.y, this.position.z],
      hp: this.hp,
    };
  }

  dispose(): void {
    this.scene.remove(this.pillarMesh);
    this.scene.remove(this.ringMesh);
    this.scene.remove(this.light);
    this.scene.remove(this.healthBar);
  }
}
