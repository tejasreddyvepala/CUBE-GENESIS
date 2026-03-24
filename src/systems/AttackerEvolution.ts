// ============================================================
// CUBE GENESIS — Attacker Evolution
// Co-evolution system for Wave 4+ predators and Wave 6 swarms.
// ============================================================

import { CONFIG } from '../config.ts';
import { NeuralNetwork } from '../brain/NeuralNetwork.ts';
import { HallOfFame, mutateWeights } from '../brain/Evolution.ts';
import { Genome } from '../brain/Genome.ts';
import { Attacker, getSharedSwarmBrain } from '../entities/Attacker.ts';

// Attacker genome uses only 6 inputs → 8 hidden → 3 outputs
const ATTACKER_BRAIN_LAYERS = [6, 8, 3];
const ATTACKER_WEIGHT_COUNT = (6 * 8 + 8) + (8 * 3 + 3); // 48+8+24+3 = 83

export class AttackerEvolution {
  attackerHallOfFame: HallOfFame;
  private swarmKills: number = 0;
  private swarmGeneration: number = 1;

  constructor() {
    this.attackerHallOfFame = new HallOfFame(CONFIG.ATTACKER_HALL_OF_FAME_SIZE);
  }

  // ──────────────────────────────────────────────
  // ATTACKER DEATH SCORING
  // ──────────────────────────────────────────────

  onAttackerDeath(attacker: Attacker, killCount: number): void {
    if (!attacker.brain) return;
    if (attacker.type !== 'predator') return;

    const genome: Genome = {
      weights: attacker.brain.getWeights(),
      fitness: killCount * CONFIG.ATTACKER_REWARD_KILL + attacker.damage * 0.1,
      generation: 1,
      parentId: 0,
      era: 0,
      mutations: 0,
    };
    this.attackerHallOfFame.add(genome);
  }

  // ──────────────────────────────────────────────
  // CREATE PREDATOR BRAIN
  // ──────────────────────────────────────────────

  createPredatorBrain(rng: () => number): NeuralNetwork {
    const brain = new NeuralNetwork(ATTACKER_BRAIN_LAYERS);

    if (!this.attackerHallOfFame.isEmpty) {
      // Crossover + mutate best predator genome
      const hofGenome = this.attackerHallOfFame.getRandom(rng);
      if (hofGenome) {
        const srcWeights = new Float32Array(hofGenome.weights.buffer);
        const mutated = mutateWeights(srcWeights, CONFIG.ATTACKER_MUTATION_RATE, CONFIG.ATTACKER_MUTATION_MAGNITUDE, rng);
        // Re-slice to attacker brain size if weights count mismatches
        const targetCount = brain.totalWeightCount();
        if (mutated.length === targetCount) {
          brain.setWeights(mutated);
          return brain;
        }
      }
    }

    brain.randomize(rng);
    return brain;
  }

  // ──────────────────────────────────────────────
  // UPDATE SHARED SWARM BRAIN (hive mind learning)
  // ──────────────────────────────────────────────

  updateSharedSwarmBrain(swarmUnits: Attacker[], kills: number): void {
    this.swarmKills += kills;
    const sharedBrain = getSharedSwarmBrain();

    // ── Online RL: aggregate rewards across all swarm units ──
    // Average the per-unit accumulated rewards, then do ONE brain update.
    // This keeps the effective learning rate correct regardless of swarm size.
    if (swarmUnits.length > 0) {
      let totalReward = swarmUnits.reduce((sum, u) => sum + u.tickRewardAccumulator, 0);
      totalReward += kills * CONFIG.ATTACKER_REWARD_KILL;
      const avgReward = totalReward / swarmUnits.length;

      if (Math.abs(avgReward) > 1e-6) {
        sharedBrain.updateOutputWeights(avgReward, CONFIG.ATTACKER_LEARNING_RATE);
      }
      // Update each unit's recentRewardRate and reset accumulator
      for (const unit of swarmUnits) {
        unit.recentRewardRate = unit.recentRewardRate * 0.95 + unit.tickRewardAccumulator * 0.05;
        unit.tickRewardAccumulator = 0;
      }
    }

    // ── Evolution: mutate the swarm brain periodically ──
    if (this.swarmKills > 10) {
      this.swarmKills = 0;
      this.swarmGeneration++;
      const weights = mutateWeights(
        sharedBrain.getWeights(),
        CONFIG.ATTACKER_MUTATION_RATE,
        CONFIG.ATTACKER_MUTATION_MAGNITUDE,
        Math.random
      );
      sharedBrain.setWeights(weights);
    }
  }

  // ──────────────────────────────────────────────
  // SERIALIZATION
  // ──────────────────────────────────────────────

  serialize(): { hallOfFame: ReturnType<HallOfFame['serialize']> } {
    return { hallOfFame: this.attackerHallOfFame.serialize() };
  }

  deserialize(data: { hallOfFame: Parameters<HallOfFame['deserialize']>[0] }): void {
    this.attackerHallOfFame.deserialize(data.hallOfFame);
  }
}
