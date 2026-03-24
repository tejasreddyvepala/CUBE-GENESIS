// ============================================================
// CUBE GENESIS — Cube Renderer
// Per-frame visual state updates for cube meshes.
// Death and birth effects.
// ============================================================

import * as THREE from 'three';
import { Cube } from '../entities/Cube.ts';
import { ParticleSystem } from './ParticleSystem.ts';

export class CubeRenderer {
  // ──────────────────────────────────────────────
  // UPDATE CUBE MESH (called every frame per cube)
  // ──────────────────────────────────────────────

  updateCubeMesh(cube: Cube): void {
    // Position is synced inside Cube.update() already
    // Here we handle supplementary visual effects

    // Sprinting stretch is also handled in Cube.update()
    // but we can add subtle rotation wobble here
    if (cube.isSprinting) {
      cube.mesh.rotation.z = Math.sin(Date.now() * 0.01) * 0.08;
    } else {
      cube.mesh.rotation.z *= 0.9; // dampen back
    }
  }

  // ──────────────────────────────────────────────
  // DEATH EFFECT
  // ──────────────────────────────────────────────

  spawnDeathEffect(cube: Cube, particles: ParticleSystem): void {
    particles.spawnDeathParticles(cube.position, cube.color);
  }

  // ──────────────────────────────────────────────
  // BIRTH EFFECT
  // ──────────────────────────────────────────────

  spawnBirthEffect(position: THREE.Vector3, particles: ParticleSystem): void {
    particles.spawnBirthParticles(position);
  }
}
