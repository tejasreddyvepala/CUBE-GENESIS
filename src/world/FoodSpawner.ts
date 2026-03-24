// ============================================================
// CUBE GENESIS — FoodSpawner
// Manages periodic and cluster food spawning.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { EntityManager } from '../entities/EntityManager.ts';
import { randomRange, randomPositionInWorld, randomPositionNear } from '../utils/math.ts';

export class FoodSpawner {
  private ticksSinceLastSpawn: number = 0;

  // ──────────────────────────────────────────────
  // UPDATE — call every world tick
  // ──────────────────────────────────────────────

  update(deltaTime: number, entityManager: EntityManager, rng: () => number, currentEra: number = 0, worldSize: number = CONFIG.WORLD_SIZE): void {
    // Scale by deltaTime * 60 so ticks are frame-rate independent
    this.ticksSinceLastSpawn += deltaTime * 60;

    // Food cap scales linearly with era: Era 1 = FOOD_MAX, Era 2 = 2×, Era 3 = 3×, etc.
    const eraMultiplier = Math.max(1, currentEra);
    const foodCap = CONFIG.FOOD_MAX * eraMultiplier;

    if (entityManager.foods.size >= foodCap) {
      this.ticksSinceLastSpawn = 0;
      return;
    }

    if (this.ticksSinceLastSpawn >= CONFIG.FOOD_SPAWN_INTERVAL) {
      this.ticksSinceLastSpawn -= CONFIG.FOOD_SPAWN_INTERVAL;
      this.spawnFood(entityManager, rng, foodCap, worldSize);
    }
  }

  // ──────────────────────────────────────────────
  // SPAWN LOGIC
  // ──────────────────────────────────────────────

  spawnFood(entityManager: EntityManager, rng: () => number, foodCap: number = CONFIG.FOOD_MAX, worldSize: number = CONFIG.WORLD_SIZE): void {
    const remaining = foodCap - entityManager.foods.size;
    if (remaining <= 0) return;

    const isCluster = rng() < CONFIG.FOOD_CLUSTER_CHANCE;

    if (isCluster) {
      const existingPos = entityManager.getRandomFoodPosition(rng);
      if (existingPos) {
        const clusterSize = Math.floor(
          randomRange(CONFIG.FOOD_CLUSTER_SIZE_MIN, CONFIG.FOOD_CLUSTER_SIZE_MAX, rng)
        );
        const count = Math.min(clusterSize, remaining);
        for (let i = 0; i < count; i++) {
          const nearby = randomPositionNear(
            existingPos.x,
            existingPos.z,
            CONFIG.FOOD_CLUSTER_RADIUS,
            worldSize,
            rng
          );
          const value = Math.floor(randomRange(CONFIG.FOOD_VALUE_MIN, CONFIG.FOOD_VALUE_MAX, rng));
          entityManager.spawnFood(new THREE.Vector3(nearby.x, 0, nearby.z), value);
        }
        return;
      }
    }

    // Random position within current world boundary
    const p = randomPositionInWorld(worldSize, rng);
    const value = Math.floor(randomRange(CONFIG.FOOD_VALUE_MIN, CONFIG.FOOD_VALUE_MAX, rng));
    entityManager.spawnFood(new THREE.Vector3(p.x, 0, p.z), value);
  }

  reset(): void {
    this.ticksSinceLastSpawn = 0;
  }
}
