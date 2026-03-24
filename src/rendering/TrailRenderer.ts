// ============================================================
// CUBE GENESIS — Trail Renderer
// Fading movement trails for cubes within camera distance.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { Cube } from '../entities/Cube.ts';

export class TrailRenderer {
  private scene: THREE.Scene;
  private trailLines: Map<number, THREE.Line> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ──────────────────────────────────────────────
  // UPDATE — called every frame
  // ──────────────────────────────────────────────

  update(cubes: Cube[], cameraPos: THREE.Vector3): void {
    const visibleIds = new Set<number>();

    for (const cube of cubes) {
      if (cube.trailPositions.length < 2) continue;

      // LOD: only render trails for cubes near camera
      const dist = cube.position.distanceTo(cameraPos);
      if (dist > CONFIG.TRAIL_CAMERA_DISTANCE) {
        this._removeLine(cube.id);
        continue;
      }

      visibleIds.add(cube.id);

      let line = this.trailLines.get(cube.id);
      if (!line) {
        line = this._createTrailLine(cube);
        this.trailLines.set(cube.id, line);
        this.scene.add(line);
      }

      this._updateTrailLine(line, cube);
    }

    // Remove trails for dead cubes
    for (const [id] of this.trailLines) {
      if (!visibleIds.has(id)) {
        this._removeLine(id);
      }
    }
  }

  // ──────────────────────────────────────────────
  // REMOVE TRAIL
  // ──────────────────────────────────────────────

  removeTrail(cubeId: number): void {
    this._removeLine(cubeId);
  }

  // ──────────────────────────────────────────────
  // INTERNAL HELPERS
  // ──────────────────────────────────────────────

  private _createTrailLine(cube: Cube): THREE.Line {
    const count = CONFIG.TRAIL_LENGTH;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
    });

    return new THREE.Line(geo, mat);
  }

  private _updateTrailLine(line: THREE.Line, cube: Cube): void {
    const trail = cube.trailPositions;
    const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = line.geometry.attributes.color as THREE.BufferAttribute;

    const count = Math.min(trail.length, CONFIG.TRAIL_LENGTH);
    const startIdx = Math.max(0, trail.length - count);

    // Base trail color from cube color
    const cr = cube.color.r;
    const cg = cube.color.g;
    const cb = cube.color.b;

    for (let i = 0; i < count; i++) {
      const pos = trail[startIdx + i];
      const ageFraction = i / count; // 0 = oldest, 1 = newest
      const alpha = ageFraction * 0.6; // fade older positions

      posAttr.setXYZ(i, pos.x, pos.y + 0.1, pos.z);
      colAttr.setXYZ(i, cr * alpha, cg * alpha, cb * alpha);
    }

    // Fill remaining with last position (invisible)
    if (count < CONFIG.TRAIL_LENGTH && trail.length > 0) {
      const last = trail[trail.length - 1];
      for (let i = count; i < CONFIG.TRAIL_LENGTH; i++) {
        posAttr.setXYZ(i, last.x, last.y + 0.1, last.z);
        colAttr.setXYZ(i, 0, 0, 0);
      }
    }

    line.geometry.setDrawRange(0, count);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  private _removeLine(id: number): void {
    const line = this.trailLines.get(id);
    if (line) {
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.trailLines.delete(id);
    }
  }

  dispose(): void {
    for (const [id] of this.trailLines) {
      this._removeLine(id);
    }
  }
}
