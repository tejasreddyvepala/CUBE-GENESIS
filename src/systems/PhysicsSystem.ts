// ============================================================
// CUBE GENESIS — Physics System
// Collision detection, wall bouncing, boid flocking helpers.
// All methods are static — no instance state.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { Cube } from '../entities/Cube.ts';
import { Attacker } from '../entities/Attacker.ts';
import { Food } from '../entities/Food.ts';
import { distance2D, normalizeAngle } from '../utils/math.ts';

export class PhysicsSystem {
  // ──────────────────────────────────────────────
  // COLLISION CHECKS
  // ──────────────────────────────────────────────

  static checkCubeAttackerCollision(cube: Cube, attacker: Attacker): boolean {
    // Airborne cube dodges all ground-level attackers
    if (cube.isAirborne) return false;
    const attackerSize = attacker.type === 'siege'
      ? CONFIG.ATTACKER_WAVES.siege.sizeMultiplier * 0.5
      : 0.5;
    const threshold = cube.size * 0.5 + attackerSize;
    return distance2D(cube.position.x, cube.position.z, attacker.position.x, attacker.position.z) < threshold;
  }

  static checkCubeFood(cube: Cube, food: Food): boolean {
    return distance2D(cube.position.x, cube.position.z, food.position.x, food.position.z) < CONFIG.CUBE_EAT_RANGE;
  }

  static checkCubeStructureCollision(
    pos: THREE.Vector3,
    structurePos: THREE.Vector3,
    structureType: string
  ): boolean {
    const radius = structureType === 'shelter' ? 2.5 : structureType === 'beacon' ? 0.5 : 1.0;
    return distance2D(pos.x, pos.z, structurePos.x, structurePos.z) < radius + 0.5;
  }

  // ──────────────────────────────────────────────
  // WALL BOUNCE
  // ──────────────────────────────────────────────

  static bounceOffWalls(entity: {
    position: THREE.Vector3;
    direction: number;
    velocity: { x: number; z: number };
  }, worldSize: number): void {
    const half = worldSize / 2 - 1;

    if (entity.position.x > half) {
      entity.position.x = half;
      entity.velocity.x = -Math.abs(entity.velocity.x) * 0.5;
      entity.direction = normalizeAngle(Math.PI - entity.direction);
    } else if (entity.position.x < -half) {
      entity.position.x = -half;
      entity.velocity.x = Math.abs(entity.velocity.x) * 0.5;
      entity.direction = normalizeAngle(Math.PI - entity.direction);
    }

    if (entity.position.z > half) {
      entity.position.z = half;
      entity.velocity.z = -Math.abs(entity.velocity.z) * 0.5;
      entity.direction = normalizeAngle(-entity.direction);
    } else if (entity.position.z < -half) {
      entity.position.z = -half;
      entity.velocity.z = Math.abs(entity.velocity.z) * 0.5;
      entity.direction = normalizeAngle(-entity.direction);
    }
  }

  // ──────────────────────────────────────────────
  // PACK FLOCKING (Boid Rules)
  // Returns a normalised steering vector [dx, dz]
  // ──────────────────────────────────────────────

  static resolvePackFlocking(
    attacker: Attacker,
    packMates: Attacker[],
    targetPos: THREE.Vector3
  ): { dx: number; dz: number } {
    const cfg = CONFIG.ATTACKER_WAVES.pack as {
      separationWeight: number;
      alignmentWeight: number;
      cohesionWeight: number;
    };

    let sepX = 0, sepZ = 0;
    let aliX = 0, aliZ = 0;
    let cohX = 0, cohZ = 0;
    let count = 0;

    for (const mate of packMates) {
      if (mate.id === attacker.id) continue;
      const dist = distance2D(attacker.position.x, attacker.position.z, mate.position.x, mate.position.z);

      if (dist < 4 && dist > 0.001) {
        sepX += (attacker.position.x - mate.position.x) / dist;
        sepZ += (attacker.position.z - mate.position.z) / dist;
      }
      aliX += Math.sin(mate.direction);
      aliZ += Math.cos(mate.direction);
      cohX += mate.position.x;
      cohZ += mate.position.z;
      count++;
    }

    let dx = 0, dz = 0;

    // Chase target
    dx = targetPos.x - attacker.position.x;
    dz = targetPos.z - attacker.position.z;

    if (count > 0) {
      cohX = cohX / count - attacker.position.x;
      cohZ = cohZ / count - attacker.position.z;
      dx += sepX * cfg.separationWeight + aliX * cfg.alignmentWeight + cohX * cfg.cohesionWeight;
      dz += sepZ * cfg.separationWeight + aliZ * cfg.alignmentWeight + cohZ * cfg.cohesionWeight;
    }

    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return { dx: 0, dz: 0 };
    return { dx: dx / len, dz: dz / len };
  }

  // ──────────────────────────────────────────────
  // SHELTER DAMAGE REDUCTION CHECK
  // ──────────────────────────────────────────────

  // Push an entity out of any structures it overlaps.
  // entityRadius: half-size of the moving entity (0.5 for cubes/attackers).
  // Returns true if any collision was resolved.
  static pushOutOfStructures(
    pos: THREE.Vector3,
    vel: { x: number; z: number },
    structures: Array<{ type: string; position: THREE.Vector3 }>,
    entityRadius: number = 0.5
  ): boolean {
    let hit = false;
    for (const s of structures) {
      const blockR = s.type === 'shelter' ? 2.5 : s.type === 'beacon' ? 0.5 : 1.0;
      const minDist = blockR + entityRadius;
      const dx = pos.x - s.position.x;
      const dz = pos.z - s.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist && dist > 0.0001) {
        // Push out to surface
        const nx = dx / dist;
        const nz = dz / dist;
        pos.x = s.position.x + nx * minDist;
        pos.z = s.position.z + nz * minDist;
        // Cancel velocity component moving into the block
        const dot = vel.x * nx + vel.z * nz;
        if (dot < 0) {
          vel.x -= dot * nx;
          vel.z -= dot * nz;
        }
        hit = true;
      }
    }
    return hit;
  }

  static isInsideShelter(cubePos: THREE.Vector3, structures: Array<{ type: string; position: THREE.Vector3 }>): boolean {
    for (const s of structures) {
      if (s.type !== 'shelter') continue;
      if (distance2D(cubePos.x, cubePos.z, s.position.x, s.position.z) < 2.0) return true;
    }
    return false;
  }
}
