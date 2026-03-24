// ============================================================
// CUBE GENESIS — Reinforcement Learner (Online, Within Lifetime)
//
// Applies a simplified policy gradient to adjust neural network
// weights in real-time during a cube's lifetime.
//
// Algorithm:
//   - Every tick, a reward signal is received.
//   - Rewards are accumulated in a rolling window of 30 ticks.
//   - The rolling average is used as the update signal:
//       weight += learningRate * avgReward * hiddenActivation
//
// This prevents single-event reward spikes from destabilizing
// the network while still allowing rapid online adaptation.
//
// The RL learner ONLY updates the output layer weights.
// Evolutionary crossover/mutation handles the deeper layers.
// ============================================================

import { CONFIG } from '../config.ts';
import { NeuralNetwork } from './NeuralNetwork.ts';
import { RollingAverage } from '../utils/math.ts';

// ──────────────────────────────────────────────
// REWARD CONSTANTS (imported from CONFIG)
// ──────────────────────────────────────────────
// These are defined in CONFIG.ts and referenced here for clarity.
// CONFIG.REWARD_EAT             = +1.0
// CONFIG.REWARD_APPROACH_FOOD   = +0.1 per tick (proximity shaping)
// CONFIG.REWARD_HIT_BY_ATTACKER = -2.0
// CONFIG.REWARD_FLEE_ATTACKER   = +0.2
// CONFIG.REWARD_NEAR_ALLY       = +0.05 per tick (Era 3+)
// CONFIG.REWARD_BUILD           = +0.5
// CONFIG.REWARD_DEATH           = -5.0 (applied before inheritance)
// CONFIG.REWARD_SURVIVE_TICK    = +0.001

// ──────────────────────────────────────────────
// REINFORCEMENT LEARNER CLASS
// ──────────────────────────────────────────────

export class ReinforcementLearner {
  /** Rolling average of recent rewards (last REWARD_WINDOW ticks) */
  private rewardWindow: RollingAverage;

  /** Accumulated instantaneous reward for the current tick (reset after update) */
  private tickReward: number = 0;

  /** Total lifetime reward (for diagnostics) */
  private _totalReward: number = 0;

  /** Number of update calls made */
  private _updateCount: number = 0;

  /** Learning rate (may be tuned externally) */
  private learningRate: number;

  /** Whether to also update hidden layer weights (experimental) */
  private updateHiddenLayers: boolean;

  constructor(
    learningRate: number = CONFIG.LEARNING_RATE,
    windowSize: number = CONFIG.REWARD_WINDOW,
    updateHiddenLayers: boolean = false
  ) {
    this.learningRate = learningRate;
    this.updateHiddenLayers = updateHiddenLayers;
    this.rewardWindow = new RollingAverage(windowSize);
  }

  // ──────────────────────────────────────────────
  // REWARD ACCUMULATION
  // ──────────────────────────────────────────────

  /**
   * Add a reward signal for the current tick.
   * Multiple rewards can be added per tick — they are summed.
   * Common callers: RewardSystem.ts (food, danger, survive, ally, build).
   */
  addReward(reward: number): void {
    this.tickReward += reward;
    this._totalReward += reward;
  }

  /**
   * Commit the current tick's reward to the rolling window.
   * Call this ONCE per tick, after all addReward() calls for the tick.
   */
  commitTickReward(): void {
    this.rewardWindow.push(this.tickReward);
    this.tickReward = 0;
  }

  /**
   * Get the rolling average reward over the last REWARD_WINDOW ticks.
   * This is the signal used for weight updates.
   */
  getAverageReward(): number {
    return this.rewardWindow.average;
  }

  /**
   * Get the accumulated instantaneous reward for the current tick
   * (before commit). Useful for HUD/debug display.
   */
  getCurrentTickReward(): number {
    return this.tickReward;
  }

  // ──────────────────────────────────────────────
  // WEIGHT UPDATE
  // ──────────────────────────────────────────────

  /**
   * Apply a reinforcement learning weight update to the neural network.
   * Uses the rolling average reward as the signal.
   *
   * Update rule (policy gradient approximation):
   *   W_output += learningRate * avgReward * h2_activation
   *
   * Call this once per tick, after commitTickReward().
   *
   * @param brain The neural network to update (in place)
   */
  updateWeights(brain: NeuralNetwork): void {
    const avgReward = this.rewardWindow.average;

    // Skip update if reward window isn't filled enough (noisy signal)
    // or if the signal is negligible
    if (this.rewardWindow.filled < 5 || Math.abs(avgReward) < 1e-6) {
      return;
    }

    // Update output-layer weights using hidden-layer activations as eligibility trace
    brain.updateOutputWeights(avgReward, this.learningRate);

    // Optionally update hidden layers (less stable, disabled by default)
    if (this.updateHiddenLayers) {
      brain.updateHiddenWeights(avgReward, this.learningRate);
    }

    this._updateCount++;
  }

  // ──────────────────────────────────────────────
  // DEATH SIGNAL
  // ──────────────────────────────────────────────

  /**
   * Apply a large negative reward when the cube dies.
   * This final update is applied to the brain before it's
   * passed to offspring (so offspring inherit slightly death-averse weights).
   *
   * @param brain The neural network to penalize
   */
  applyDeathPenalty(brain: NeuralNetwork): void {
    this.addReward(CONFIG.REWARD_DEATH);
    this.commitTickReward();
    // Apply the death penalty directly (don't wait for average)
    brain.updateOutputWeights(CONFIG.REWARD_DEATH * 0.5, this.learningRate);
  }

  // ──────────────────────────────────────────────
  // RESET
  // ──────────────────────────────────────────────

  /**
   * Reset the learner state. Called when a cube is reborn/respawned
   * or when a new brain is loaded.
   */
  reset(): void {
    this.rewardWindow.reset();
    this.tickReward = 0;
    this._totalReward = 0;
    this._updateCount = 0;
  }

  // ──────────────────────────────────────────────
  // DIAGNOSTICS
  // ──────────────────────────────────────────────

  get totalReward(): number { return this._totalReward; }
  get updateCount(): number { return this._updateCount; }

  /**
   * Serialize learner state for save files.
   * Note: the reward window is NOT saved (it's transient).
   * Only persistent stats are stored.
   */
  serialize(): { totalReward: number } {
    return { totalReward: this._totalReward };
  }

  /**
   * Restore minimal state from a save.
   */
  deserialize(data: { totalReward: number }): void {
    this._totalReward = data.totalReward;
  }
}

// ──────────────────────────────────────────────
// REWARD HELPER — Individual Reward Components
// ──────────────────────────────────────────────

/**
 * Calculate the approach-food reward for a tick.
 * Positive if cube moved closer to nearest food, zero/negative otherwise.
 * Only applied when food is within vision range.
 *
 * @param prevDist Distance to food at start of tick
 * @param currDist Distance to food at end of tick
 * @param visionRange Cube's vision range
 * @returns Scalar reward
 */
export function calcApproachFoodReward(
  prevDist: number,
  currDist: number,
  visionRange: number
): number {
  if (prevDist > visionRange) return 0; // food not visible
  const improvement = prevDist - currDist; // positive if got closer
  return improvement > 0 ? CONFIG.REWARD_APPROACH_FOOD * improvement : 0;
}

/**
 * Calculate the flee-attacker reward for a tick.
 * Positive if cube moved away from a nearby attacker.
 *
 * @param prevDist Distance to nearest attacker at start of tick
 * @param currDist Distance to nearest attacker at end of tick
 * @param dangerRadius Distance within which attacker is considered dangerous
 * @returns Scalar reward
 */
export function calcFleeAttackerReward(
  prevDist: number,
  currDist: number,
  dangerRadius: number
): number {
  if (prevDist > dangerRadius) return 0; // attacker not in danger range
  const retreat = currDist - prevDist; // positive if moved away
  return retreat > 0 ? CONFIG.REWARD_FLEE_ATTACKER * retreat : 0;
}

/**
 * Calculate the ally proximity reward (Era 3+).
 * @param nearbyAllyCount Number of allies within ALLY_NEAR_RADIUS
 * @param currentEra Current era index (0-based)
 */
export function calcAllyReward(nearbyAllyCount: number, currentEra: number): number {
  if (currentEra < 2) return 0; // Only Era 3+ (index 2+)
  return nearbyAllyCount > 0 ? CONFIG.REWARD_NEAR_ALLY * Math.min(nearbyAllyCount, 5) : 0;
}

/**
 * Calculate the build reward.
 * Called once when a structure is successfully placed.
 * @param currentEra Current era index (0-based)
 */
export function calcBuildReward(currentEra: number): number {
  if (currentEra < 4) return 0; // Only Era 5+ (index 4+)
  return CONFIG.REWARD_BUILD;
}
