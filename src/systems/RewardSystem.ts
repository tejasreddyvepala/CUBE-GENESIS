// ============================================================
// CUBE GENESIS — Reward System
// Centralized reward calculation. All reward logic lives here.
// ============================================================

import { CONFIG } from '../config.ts';

export class RewardSystem {
  // ──────────────────────────────────────────────
  // INDIVIDUAL REWARD COMPONENTS
  // ──────────────────────────────────────────────

  static calcEatReward(): number {
    return CONFIG.REWARD_EAT;
  }

  /**
   * Positive reward if cube moved closer to food this tick.
   * @param prevDist previous distance to nearest food
   * @param newDist  current distance to nearest food
   * @param visionRange cube's vision range (food must be visible)
   */
  static calcApproachFoodReward(prevDist: number, newDist: number, visionRange: number): number {
    if (prevDist > visionRange) return 0;
    const improvement = prevDist - newDist; // positive = got closer
    return improvement > 0 ? CONFIG.REWARD_APPROACH_FOOD * improvement : 0;
  }

  static calcAttackerHitReward(): number {
    return CONFIG.REWARD_HIT_BY_ATTACKER;
  }

  /**
   * Positive reward when fleeing an attacker that was close.
   * @param prevDist previous distance to nearest attacker
   * @param newDist  current distance to nearest attacker
   * @param dangerRadius distance threshold to consider it dangerous
   */
  static calcFleeReward(prevDist: number, newDist: number, dangerRadius: number): number {
    if (prevDist > dangerRadius) return 0;
    const retreat = newDist - prevDist; // positive = moved away
    return retreat > 0 ? CONFIG.REWARD_FLEE_ATTACKER * retreat * 5 : 0;
  }

  /**
   * Proximity reward for being near allies (Era 3+).
   * @param nearbyAllyCount number of allies within ALLY_NEAR_RADIUS
   * @param era current era index (0-based)
   */
  static calcAllyReward(nearbyAllyCount: number, era: number): number {
    if (era < 2) return 0; // Era 3+ = index 2
    if (nearbyAllyCount === 0) return 0;
    return CONFIG.REWARD_NEAR_ALLY * Math.min(nearbyAllyCount, 5);
  }

  /**
   * One-time reward for successfully placing a structure.
   * @param era current era index (0-based)
   */
  static calcBuildReward(era: number): number {
    if (era < 4) return 0; // Era 5+ = index 4
    return CONFIG.REWARD_BUILD;
  }

  static calcDeathReward(): number {
    return CONFIG.REWARD_DEATH;
  }

  static calcSurviveTickReward(): number {
    return CONFIG.REWARD_SURVIVE_TICK;
  }

  static calcDuplicateReward(): number {
    return CONFIG.REWARD_DUPLICATE;
  }

  static calcSignalReward(): number {
    return CONFIG.REWARD_SIGNAL;
  }

  // ──────────────────────────────────────────────
  // NEW REWARD METHODS
  // ──────────────────────────────────────────────

  /**
   * Escalating punishment for standing still.
   */
  static calcIdleReward(idleTicks: number): number {
    if (idleTicks >= CONFIG.IDLE_ESCALATE_TICKS_2) return CONFIG.REWARD_IDLE_ESCALATE_2;
    if (idleTicks >= CONFIG.IDLE_ESCALATE_TICKS_1) return CONFIG.REWARD_IDLE_ESCALATE_1;
    return CONFIG.REWARD_IDLE_BASE;
  }

  /**
   * Punishment for moving away from food when energy is critically low.
   * @param energy cube's current energy
   * @param prevDist distance to nearest food last tick
   * @param newDist distance to nearest food this tick
   */
  static calcFleeHungryReward(energy: number, prevDist: number, newDist: number): number {
    if (energy >= 30) return 0;
    if (prevDist < 0 || newDist < 0) return 0;
    if (newDist > prevDist) return CONFIG.REWARD_FLEE_HUNGRY; // moving away from food while hungry
    return 0;
  }

  /**
   * Punishment for walking toward an attacker while not defending.
   * @param isDefending whether cube is in defend mode
   * @param prevDist distance to nearest attacker last tick
   * @param newDist distance to nearest attacker this tick
   */
  static calcApproachAttackerReward(isDefending: boolean, prevDist: number, newDist: number): number {
    if (isDefending) return 0;
    if (prevDist < 0 || newDist < 0) return 0;
    if (newDist < prevDist) return CONFIG.REWARD_APPROACH_ATTACKER; // moving toward attacker
    return 0;
  }

  /**
   * Bonus for successfully dodging an attacker that was very close.
   * @param prevDist distance to nearest attacker last tick
   * @param newDist distance to nearest attacker this tick
   * @param threatRange the close-call radius (default 3 units)
   */
  static calcNearMissDodgeReward(prevDist: number, newDist: number, threatRange: number = 3): number {
    if (prevDist < 0 || newDist < 0) return 0;
    if (prevDist < threatRange && newDist >= threatRange) return CONFIG.REWARD_NEAR_MISS_DODGE;
    return 0;
  }

  /**
   * Bonus for being inside a shelter structure (Era 4+).
   * @param isInShelter whether the cube is currently inside a shelter
   * @param era current era index (0-based)
   */
  static calcInShelterReward(isInShelter: boolean, era: number): number {
    if (!isInShelter || era < 3) return 0; // Era 4+ = index 3
    return CONFIG.REWARD_IN_SHELTER;
  }

  /**
   * Hunger urgency multiplier — scales food rewards when cube is starving.
   * At energyFraction > HUNGER_URGENCY_LOW: returns 1.0 (no boost)
   * At energyFraction = 0: returns HUNGER_URGENCY_MAX
   */
  static hungerUrgencyMultiplier(energy: number, maxEnergy: number): number {
    const fraction = energy / maxEnergy;
    if (fraction >= CONFIG.HUNGER_URGENCY_LOW) return 1.0;
    // Linear scale from 1x at threshold down to HUNGER_URGENCY_MAX at 0
    const t = 1 - fraction / CONFIG.HUNGER_URGENCY_LOW;
    return 1.0 + (CONFIG.HUNGER_URGENCY_MAX - 1.0) * t;
  }

  /**
   * Food discovery reward — fires once when food enters vision this tick.
   * prevFoodDist was 1.0 (no food visible), now < 1.0 (food spotted).
   */
  static calcFoodDiscoveryReward(prevFoodDist: number, newFoodDist: number): number {
    // prevFoodDist === 1.0 means "no food visible" (normalizeDistance returns 1 when nothing found)
    if (prevFoodDist >= 1.0 && newFoodDist < 1.0) return CONFIG.REWARD_FOOD_DISCOVERY;
    return 0;
  }

  /**
   * Danger turning reward — fires when cube rotates away from a nearby attacker.
   * Uses angle change rather than distance change (less noisy — only cube's action drives this).
   * @param prevAttackerAngle attacker angle relative to cube last tick (-1 to +1)
   * @param newAttackerAngle  attacker angle this tick
   * @param attackerDist      world-unit distance to attacker
   */
  static calcDangerTurnReward(
    prevAttackerAngle: number,
    newAttackerAngle: number,
    attackerDist: number
  ): number {
    if (attackerDist > CONFIG.DANGER_TURN_DISTANCE) return 0;
    // Angle moving toward ±1 means attacker is moving to the side (cube is turning away)
    const prevAbs = Math.abs(prevAttackerAngle);
    const newAbs = Math.abs(newAttackerAngle);
    if (newAbs > prevAbs + 0.05) return CONFIG.REWARD_DANGER_TURN; // attacker moved to side
    return 0;
  }

  // ──────────────────────────────────────────────
  // COMPOSITE REWARD
  // Called once per tick from World.update() for each cube.
  // Note: REWARD_SURVIVE_TICK is applied directly in Cube.update() — do NOT add it here.
  // ──────────────────────────────────────────────

  static calcTickReward(params: {
    prevFoodDist: number;
    newFoodDist: number;
    visionRange: number;
    prevAttackerDist: number;
    newAttackerDist: number;
    dangerRadius: number;
    nearbyAllyCount: number;
    era: number;
    energy: number;
    maxEnergy: number;
    isDefending?: boolean;
    isInShelter?: boolean;
    prevAttackerAngle: number;
    newAttackerAngle: number;
    attackerDist: number;
  }): number {
    let reward = 0;
    const hungerMult = RewardSystem.hungerUrgencyMultiplier(params.energy, params.maxEnergy);

    reward += RewardSystem.calcApproachFoodReward(params.prevFoodDist, params.newFoodDist, params.visionRange) * hungerMult;
    reward += RewardSystem.calcFoodDiscoveryReward(params.prevFoodDist, params.newFoodDist) * hungerMult;
    reward += RewardSystem.calcFleeReward(params.prevAttackerDist, params.newAttackerDist, params.dangerRadius);
    reward += RewardSystem.calcDangerTurnReward(params.prevAttackerAngle, params.newAttackerAngle, params.attackerDist);
    reward += RewardSystem.calcAllyReward(params.nearbyAllyCount, params.era);
    // Note: REWARD_SURVIVE_TICK is NOT added here — it is applied in Cube.update() to avoid double-counting

    // Additional reward signals
    reward += RewardSystem.calcFleeHungryReward(params.energy, params.prevFoodDist, params.newFoodDist);
    if (params.isDefending !== undefined) {
      reward += RewardSystem.calcApproachAttackerReward(params.isDefending, params.prevAttackerDist, params.newAttackerDist);
    }
    reward += RewardSystem.calcNearMissDodgeReward(params.prevAttackerDist, params.newAttackerDist);
    if (params.isInShelter !== undefined) {
      reward += RewardSystem.calcInShelterReward(params.isInShelter, params.era);
    }

    return reward;
  }
}
