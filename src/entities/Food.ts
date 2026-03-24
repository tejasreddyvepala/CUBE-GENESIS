// ============================================================
// CUBE GENESIS — Food Entity (pure data)
// Rendering is handled entirely by FoodRenderer (InstancedMesh).
// This class holds only simulation state — no Three.js objects.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { randomRange } from '../utils/math.ts';

export class Food {
  id: number;
  position: THREE.Vector3;
  value: number;
  isEaten: boolean = false;

  // Exposed for FoodRenderer bobbing & color
  readonly bobOffset: number;

  constructor(id: number, position: THREE.Vector3, value: number, _scene?: THREE.Scene) {
    this.id = id;
    this.position = position.clone();
    this.value = value;
    this.bobOffset = Math.random() * Math.PI * 2;
    // _scene intentionally unused — rendering is external (FoodRenderer)
    void _scene;
    void randomRange; // keep import alive for other callers
  }

  eat(): void {
    this.isEaten = true;
  }

  dispose(): void {
    // No Three.js objects to clean up — FoodRenderer manages all meshes
  }
}
