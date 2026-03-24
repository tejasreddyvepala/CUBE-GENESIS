// ============================================================
// CUBE GENESIS — Food Entity
// Green sphere that cubes eat to gain energy.
// Bobs on a sin-wave Y axis. Pooled for performance.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { randomRange } from '../utils/math.ts';

// ──────────────────────────────────────────────
// MESH POOL
// ──────────────────────────────────────────────
const _geometryCache: Map<number, THREE.SphereGeometry> = new Map();
const _materialCache: Map<number, THREE.MeshLambertMaterial> = new Map();
const _meshPool: THREE.Mesh[] = [];
const _lightPool: THREE.PointLight[] = [];

function getGeometry(radius: number): THREE.SphereGeometry {
  const key = Math.round(radius * 100);
  if (!_geometryCache.has(key)) {
    _geometryCache.set(key, new THREE.SphereGeometry(radius, 8, 6));
  }
  return _geometryCache.get(key)!;
}

function getMaterial(valueFraction: number): THREE.MeshLambertMaterial {
  const key = Math.round(valueFraction * 10);
  if (!_materialCache.has(key)) {
    const lightness = 0.45 + valueFraction * 0.15;
    const color = new THREE.Color().setHSL(150 / 360, 1.0, lightness);
    const emissive = new THREE.Color().setHSL(150 / 360, 1.0, 0.15);
    _materialCache.set(key, new THREE.MeshLambertMaterial({ color, emissive }));
  }
  return _materialCache.get(key)!;
}

function acquireMesh(radius: number, valueFraction: number): THREE.Mesh {
  if (_meshPool.length > 0) {
    const m = _meshPool.pop()!;
    m.geometry = getGeometry(radius);
    (m.material as THREE.MeshLambertMaterial) = getMaterial(valueFraction);
    m.visible = true;
    return m;
  }
  const mesh = new THREE.Mesh(getGeometry(radius), getMaterial(valueFraction));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function releaseMesh(mesh: THREE.Mesh): void {
  mesh.visible = false;
  _meshPool.push(mesh);
}

function acquireLight(): THREE.PointLight {
  if (_lightPool.length > 0) {
    const l = _lightPool.pop()!;
    l.visible = true;
    return l;
  }
  return new THREE.PointLight(CONFIG.FOOD_COLOR, 0.6, 5);
}

function releaseLight(light: THREE.PointLight): void {
  light.visible = false;
  _lightPool.push(light);
}

// ──────────────────────────────────────────────
// FOOD CLASS
// ──────────────────────────────────────────────

export class Food {
  id: number;
  position: THREE.Vector3;
  value: number;          // energy value on eat
  isEaten: boolean = false;

  mesh: THREE.Mesh;
  private light: THREE.PointLight;
  private baseY: number;
  private bobOffset: number;  // per-food phase offset for bobbing
  private scene: THREE.Scene;

  constructor(id: number, position: THREE.Vector3, value: number, scene: THREE.Scene) {
    this.id = id;
    this.position = position.clone();
    this.value = value;
    this.scene = scene;

    const radius = randomRange(CONFIG.FOOD_RADIUS_MIN, CONFIG.FOOD_RADIUS_MAX, Math.random);
    const valueFraction = (value - CONFIG.FOOD_VALUE_MIN) / (CONFIG.FOOD_VALUE_MAX - CONFIG.FOOD_VALUE_MIN);

    this.mesh = acquireMesh(radius, Math.max(0, Math.min(1, valueFraction)));
    this.mesh.position.copy(position);
    this.mesh.position.y = 0.5;

    this.light = acquireLight();
    this.mesh.add(this.light);

    this.baseY = 0.5;
    this.bobOffset = Math.random() * Math.PI * 2;

    scene.add(this.mesh);
  }

  // ──────────────────────────────────────────────
  // UPDATE — bobbing animation
  // ──────────────────────────────────────────────

  update(worldAge: number): void {
    if (this.isEaten) return;
    const bobY = this.baseY + Math.sin(worldAge * CONFIG.FOOD_BOB_FREQUENCY + this.bobOffset) * CONFIG.FOOD_BOB_AMPLITUDE;
    this.mesh.position.y = bobY;
  }

  // ──────────────────────────────────────────────
  // EAT — mark consumed, visual handled by particle system
  // ──────────────────────────────────────────────

  eat(): void {
    this.isEaten = true;
  }

  // ──────────────────────────────────────────────
  // DISPOSE — return mesh to pool
  // ──────────────────────────────────────────────

  dispose(): void {
    this.mesh.remove(this.light);
    releaseLight(this.light);
    this.scene.remove(this.mesh);
    releaseMesh(this.mesh);
  }
}
