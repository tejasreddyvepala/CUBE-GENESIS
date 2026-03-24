// ============================================================
// CUBE GENESIS — Structure Entity
// Buildable objects: wall, shelter, beacon
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { StructureType } from '../config.ts';
import { structureEmissiveColor } from '../utils/color.ts';

// ──────────────────────────────────────────────
// GEOMETRY / MATERIAL CACHES
// ──────────────────────────────────────────────

const _geoCache: Record<StructureType, THREE.BufferGeometry | null> = {
  wall: null,
  shelter: null,
  beacon: null,
};

const _matCache: Record<StructureType, THREE.Material | null> = {
  wall: null,
  shelter: null,
  beacon: null,
};

function getGeometry(type: StructureType): THREE.BufferGeometry {
  if (_geoCache[type]) return _geoCache[type]!;
  switch (type) {
    case 'wall':
      _geoCache[type] = new THREE.BoxGeometry(1.5, 2.0, 1.5);
      break;
    case 'shelter':
      _geoCache[type] = new THREE.SphereGeometry(2.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      break;
    case 'beacon':
      _geoCache[type] = new THREE.BoxGeometry(0.5, 4.0, 0.5);
      break;
  }
  return _geoCache[type]!;
}

function getMaterial(type: StructureType): THREE.Material {
  if (_matCache[type]) return _matCache[type]!;
  const emissive = structureEmissiveColor(type);
  switch (type) {
    case 'wall':
      _matCache[type] = new THREE.MeshLambertMaterial({
        color: new THREE.Color(CONFIG.STRUCTURE_COLOR),
        emissive,
        transparent: true,
        opacity: 0.85,
      });
      break;
    case 'shelter':
      _matCache[type] = new THREE.MeshLambertMaterial({
        color: new THREE.Color(0x00cccc),
        emissive,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      });
      break;
    case 'beacon':
      _matCache[type] = new THREE.MeshLambertMaterial({
        color: new THREE.Color(0xffffff),
        emissive: new THREE.Color(CONFIG.STRUCTURE_EMISSIVE),
        emissiveIntensity: 0.8,
      });
      break;
  }
  return _matCache[type]!;
}

// ──────────────────────────────────────────────
// STRUCTURE CLASS
// ──────────────────────────────────────────────

export class Structure {
  id: number;
  type: StructureType;
  position: THREE.Vector3;
  hp: number;
  builderId: number;

  mesh: THREE.Mesh;
  // No per-structure PointLight — too many lights crash the WebGL shader.
  // Settlement ambient glow is handled by StructureRenderer (max one light per settlement).

  private scene: THREE.Scene;
  private mat: THREE.MeshLambertMaterial;  // own clone so takeDamage doesn't affect siblings

  constructor(
    id: number,
    type: StructureType,
    position: THREE.Vector3,
    builderId: number,
    scene: THREE.Scene
  ) {
    this.id = id;
    this.type = type;
    this.position = position.clone();
    this.hp = CONFIG.STRUCTURE_HP;
    this.builderId = builderId;
    this.scene = scene;

    // Clone material so opacity changes don't bleed across all structures of the same type
    this.mat = (getMaterial(type) as THREE.MeshLambertMaterial).clone();
    this.mesh = new THREE.Mesh(getGeometry(type), this.mat);
    this.mesh.position.copy(position);

    // Y-offset so structures sit on ground plane
    switch (type) {
      case 'wall':    this.mesh.position.y = 1.0; break;
      case 'shelter': this.mesh.position.y = 0;   break;
      case 'beacon':  this.mesh.position.y = 2.0; break;
    }

    scene.add(this.mesh);
  }

  // ──────────────────────────────────────────────
  // DAMAGE
  // ──────────────────────────────────────────────

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    // Visually dim as hp falls (own clone — doesn't affect other structures)
    const fraction = Math.max(0, this.hp / CONFIG.STRUCTURE_HP);
    if (!this.mat.wireframe) {
      this.mat.opacity = 0.4 + fraction * 0.5;
    }
    return this.hp <= 0;
  }

  isDestroyed(): boolean {
    return this.hp <= 0;
  }

  // ──────────────────────────────────────────────
  // DISPOSE
  // ──────────────────────────────────────────────

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mat.dispose();
  }
}
