// ============================================================
// CUBE GENESIS — Particle System
// Pooled particles for death, eat, birth, build effects.
// Uses InstancedMesh for performance.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';

interface Particle {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;       // current life (counts down)
  maxLife: number;
  scale: number;
}

// ──────────────────────────────────────────────
// PARTICLE SYSTEM CLASS
// ──────────────────────────────────────────────

export class ParticleSystem {
  private particles: Particle[] = [];
  private scene: THREE.Scene;
  private instancedMesh: THREE.InstancedMesh;

  private _matrix = new THREE.Matrix4();
  private _color = new THREE.Color();
  private _scale = new THREE.Vector3();
  private _pos = new THREE.Vector3();
  private _quat = new THREE.Quaternion();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Pre-allocate particle pool
    for (let i = 0; i < CONFIG.PARTICLE_BUDGET; i++) {
      this.particles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(1, 1, 1),
        life: 0,
        maxLife: 1,
        scale: 0.15,
      });
    }

    // InstancedMesh — one per particle
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.instancedMesh = new THREE.InstancedMesh(geo, mat, CONFIG.PARTICLE_BUDGET);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false;

    // Initialize all instances as invisible (zero scale)
    for (let i = 0; i < CONFIG.PARTICLE_BUDGET; i++) {
      this._matrix.makeScale(0, 0, 0);
      this.instancedMesh.setMatrixAt(i, this._matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.instancedMesh);
  }

  // ──────────────────────────────────────────────
  // PARTICLE SPAWNERS
  // ──────────────────────────────────────────────

  spawnDeathParticles(position: THREE.Vector3, color: THREE.Color): void {
    for (let i = 0; i < 8; i++) {
      const p = this._acquire();
      if (!p) return;
      p.position.copy(position);
      p.position.y += 0.5;
      const angle = (i / 8) * Math.PI * 2;
      const speed = 0.1 + Math.random() * 0.15;
      p.velocity.set(
        Math.cos(angle) * speed,
        0.05 + Math.random() * 0.1,
        Math.sin(angle) * speed
      );
      p.color.copy(color);
      p.maxLife = 40 + Math.random() * 20;
      p.life = p.maxLife;
      p.scale = 0.12 + Math.random() * 0.1;
    }
  }

  spawnEatParticles(position: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      const p = this._acquire();
      if (!p) return;
      p.position.copy(position);
      p.position.y += 0.3;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.05 + Math.random() * 0.08;
      p.velocity.set(
        Math.cos(angle) * speed,
        0.08 + Math.random() * 0.1,
        Math.sin(angle) * speed
      );
      p.color.setHex(CONFIG.FOOD_COLOR);
      p.maxLife = 25 + Math.random() * 15;
      p.life = p.maxLife;
      p.scale = 0.08;
    }
  }

  spawnBirthParticles(position: THREE.Vector3): void {
    for (let i = 0; i < 10; i++) {
      const p = this._acquire();
      if (!p) return;
      p.position.copy(position);
      p.position.y += 0.5;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.06 + Math.random() * 0.1;
      p.velocity.set(
        Math.cos(angle) * speed,
        0.1 + Math.random() * 0.12,
        Math.sin(angle) * speed
      );
      p.color.setHex(CONFIG.CUBE_GLOW_COLOR);
      p.maxLife = 30 + Math.random() * 20;
      p.life = p.maxLife;
      p.scale = 0.1;
    }
  }

  spawnBuildParticles(position: THREE.Vector3): void {
    for (let i = 0; i < 5; i++) {
      const p = this._acquire();
      if (!p) return;
      p.position.copy(position);
      p.position.y += 1;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.04 + Math.random() * 0.06;
      p.velocity.set(
        Math.cos(angle) * speed,
        0.05 + Math.random() * 0.06,
        Math.sin(angle) * speed
      );
      p.color.setHex(CONFIG.STRUCTURE_COLOR);
      p.maxLife = 20 + Math.random() * 10;
      p.life = p.maxLife;
      p.scale = 0.09;
    }
  }

  // ──────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────

  update(deltaTime: number): void {
    const dt = deltaTime * 60;
    let instanceIdx = 0;

    for (const p of this.particles) {
      if (!p.active) {
        // Hide this instance
        this._matrix.makeScale(0, 0, 0);
        this.instancedMesh.setMatrixAt(instanceIdx, this._matrix);
        instanceIdx++;
        continue;
      }

      // Update position
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;

      // Gravity
      p.velocity.y -= 0.003 * dt;

      // Fade life
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this._matrix.makeScale(0, 0, 0);
        this.instancedMesh.setMatrixAt(instanceIdx, this._matrix);
        instanceIdx++;
        continue;
      }

      // Scale by life fraction
      const lifeFraction = p.life / p.maxLife;
      const s = p.scale * lifeFraction;

      this._scale.set(s, s, s);
      this._pos.copy(p.position);
      this._matrix.compose(this._pos, this._quat, this._scale);
      this.instancedMesh.setMatrixAt(instanceIdx, this._matrix);
      this.instancedMesh.setColorAt(instanceIdx, p.color);
      instanceIdx++;
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  // ──────────────────────────────────────────────
  // POOL ACQUIRE
  // ──────────────────────────────────────────────

  private _acquire(): Particle | null {
    for (const p of this.particles) {
      if (!p.active) {
        p.active = true;
        return p;
      }
    }
    // Recycle oldest active particle
    for (const p of this.particles) {
      if (p.life < p.maxLife * 0.2) {
        p.active = true;
        return p;
      }
    }
    return null;
  }

  dispose(): void {
    this.scene.remove(this.instancedMesh);
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
  }
}
