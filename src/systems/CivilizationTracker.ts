// ============================================================
// CUBE GENESIS — Civilization Tracker
// Calculates civ score and detects settlements.
// ============================================================

import { CONFIG } from '../config.ts';
import { Structure } from '../entities/Structure.ts';
import { distance2D } from '../utils/math.ts';

export interface Settlement {
  center: { x: number; z: number };
  structures: Structure[];
  radius: number;
}

export class CivilizationTracker {
  // ──────────────────────────────────────────────
  // CIV SCORE FORMULA
  // ──────────────────────────────────────────────

  calculateCivScore(
    aliveCubes: number,
    totalFoodEaten: number,
    maxGeneration: number,
    structures: number,
    avgSurvivalTime: number,
    totalDuplications: number
  ): number {
    return (
      aliveCubes       * CONFIG.CIV_WEIGHT_ALIVE +
      totalFoodEaten   * CONFIG.CIV_WEIGHT_FOOD_EATEN +
      maxGeneration    * CONFIG.CIV_WEIGHT_MAX_GEN +
      structures       * CONFIG.CIV_WEIGHT_STRUCTURES +
      avgSurvivalTime  * CONFIG.CIV_WEIGHT_SURVIVAL_TIME +
      totalDuplications * CONFIG.CIV_WEIGHT_DUPLICATIONS
    );
  }

  // ──────────────────────────────────────────────
  // SETTLEMENT DETECTION
  // A settlement = 3+ structures within radius 15 of each other
  // ──────────────────────────────────────────────

  detectSettlements(structures: Structure[]): Settlement[] {
    if (structures.length < CONFIG.STRUCTURE_SETTLEMENT_MIN_COUNT) return [];

    const visited = new Set<number>();
    const settlements: Settlement[] = [];

    for (const structure of structures) {
      if (visited.has(structure.id)) continue;

      // Find all structures within settlement radius
      const nearby = structures.filter(s => {
        if (s.id === structure.id) return true;
        return distance2D(
          structure.position.x, structure.position.z,
          s.position.x, s.position.z
        ) <= CONFIG.STRUCTURE_SETTLEMENT_RADIUS;
      });

      if (nearby.length >= CONFIG.STRUCTURE_SETTLEMENT_MIN_COUNT) {
        // Compute centroid
        const cx = nearby.reduce((sum, s) => sum + s.position.x, 0) / nearby.length;
        const cz = nearby.reduce((sum, s) => sum + s.position.z, 0) / nearby.length;

        for (const s of nearby) visited.add(s.id);

        settlements.push({
          center: { x: cx, z: cz },
          structures: nearby,
          radius: CONFIG.STRUCTURE_SETTLEMENT_RADIUS,
        });
      }
    }

    return settlements;
  }

  // ──────────────────────────────────────────────
  // SETTLEMENT BONUSES
  // ──────────────────────────────────────────────

  getSettlementBonuses(settlements: Settlement[]): {
    energyBonusPerTick: number;
    damageBonusFraction: number;
    attractorPositions: Array<{ x: number; z: number }>;
  } {
    if (settlements.length === 0) {
      return { energyBonusPerTick: 0, damageBonusFraction: 0, attractorPositions: [] };
    }

    return {
      energyBonusPerTick: settlements.length * 0.005,
      damageBonusFraction: Math.min(settlements.length * 0.05, 0.25),
      attractorPositions: settlements.map(s => s.center),
    };
  }
}
