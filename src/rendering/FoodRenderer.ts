// ============================================================
// CUBE GENESIS — Food Renderer
// Single InstancedMesh for all food — 1 draw call regardless of count.
// Color encodes value: teal (low) → bright green (mid) → gold-green (high).
// ============================================================

import * as THREE from 'three';
import { Food } from '../entities/Food.ts';
import { CONFIG } from '../config.ts';

const _matrix = new THREE.Matrix4();
const _color  = new THREE.Color();
const _scale  = new THREE.Vector3(1, 1, 1);
const _quat   = new THREE.Quaternion();
const _pos    = new THREE.Vector3();

// Max instances — must cover ERA_MAX food cap (Era 6 = 6×80 = 480)
const MAX_FOOD_INSTANCES = 600;

export class FoodRenderer {
  private instancedMesh: THREE.InstancedMesh;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Low-poly sphere — food doesn't need 8 segments
    const geo = new THREE.SphereGeometry(0.38, 5, 4);
    // White base — instance colors are multiplied by material color, so white = instance color as-is
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x003311) });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, MAX_FOOD_INSTANCES);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.count = 0;
    this.instancedMesh.castShadow = false;
    this.instancedMesh.receiveShadow = false;

    // Pre-initialize instanceColor buffer (required before first setColorAt call)
    const initColor = new THREE.Color(0x00ff88);
    for (let i = 0; i < MAX_FOOD_INSTANCES; i++) {
      this.instancedMesh.setColorAt(i, initColor);
    }

    scene.add(this.instancedMesh);
  }

  // ──────────────────────────────────────────────
  // UPDATE — call every render frame
  // ──────────────────────────────────────────────

  update(foods: IterableIterator<Food>, worldAge: number): void {
    let i = 0;

    for (const food of foods) {
      if (food.isEaten || i >= MAX_FOOD_INSTANCES) continue;

      // Bobbing Y
      const bob = 0.5 + Math.sin(worldAge * CONFIG.FOOD_BOB_FREQUENCY + food.bobOffset) * CONFIG.FOOD_BOB_AMPLITUDE;

      _pos.set(food.position.x, bob, food.position.z);

      // Pulse scale slightly based on world age + per-food offset
      const pulse = 1.0 + Math.sin(worldAge * 0.04 + food.bobOffset * 2) * 0.08;
      _scale.setScalar(pulse);

      _matrix.compose(_pos, _quat, _scale);
      this.instancedMesh.setMatrixAt(i, _matrix);

      // Color by value: teal(low) → bright green(mid) → gold-green(high)
      const v = Math.max(0, Math.min(1,
        (food.value - CONFIG.FOOD_VALUE_MIN) / (CONFIG.FOOD_VALUE_MAX - CONFIG.FOOD_VALUE_MIN)
      ));
      // hue: 180°(teal) → 120°(green) → 90°(yellow-green)
      const hue = (0.5 - v * 0.15);
      const lightness = 0.45 + v * 0.2;
      _color.setHSL(hue, 1.0, lightness);
      this.instancedMesh.setColorAt(i, _color);

      i++;
    }

    this.instancedMesh.count = i;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.instancedMesh);
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
  }
}
