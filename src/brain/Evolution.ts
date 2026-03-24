// ============================================================
// CUBE GENESIS — Evolution System
//
// Handles:
//   - Hall of Fame: top-N genome storage with insertion sort
//   - Mutation:  per-weight Gaussian noise + structural mutation
//   - Crossover: uniform crossover with Hall of Fame genomes
//   - Offspring brain creation: clone + crossover + mutate
//   - Fitness calculation (delegates to Genome.ts)
// ============================================================

import { CONFIG } from '../config.ts';
import {
  Genome,
  GenomeJSON,
  cloneGenome,
  createOffspringGenome,
  serializeGenome,
  deserializeGenome,
  validateGenomeJSON,
  calculateFitness,
} from './Genome.ts';
import { NeuralNetwork } from './NeuralNetwork.ts';
import { BRAIN_WEIGHT_COUNT } from '../config.ts';

// ──────────────────────────────────────────────
// HALL OF FAME
// Stores the top-N genomes by fitness across all time.
// New genomes replace the worst stored genome if they are better.
// ──────────────────────────────────────────────

export class HallOfFame {
  private genomes: Genome[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = CONFIG.HALL_OF_FAME_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Add a genome to the Hall of Fame.
   * If the HoF is not full, always adds.
   * If full, only adds if this genome beats the current worst.
   * Returns true if the genome was added.
   */
  add(genome: Genome): boolean {
    if (this.genomes.length < this.maxSize) {
      this.genomes.push(cloneGenome(genome));
      this.genomes.sort((a, b) => b.fitness - a.fitness); // descending
      return true;
    }

    const worst = this.genomes[this.genomes.length - 1];
    if (genome.fitness > worst.fitness) {
      this.genomes[this.genomes.length - 1] = cloneGenome(genome);
      this.genomes.sort((a, b) => b.fitness - a.fitness);
      return true;
    }

    return false;
  }

  /**
   * Get the top N genomes (or all if fewer than N exist).
   */
  getBest(n: number): Genome[] {
    return this.genomes.slice(0, Math.min(n, this.genomes.length));
  }

  /**
   * Get a random genome from the Hall of Fame.
   * Uses the provided RNG for determinism.
   * Returns null if the HoF is empty.
   */
  getRandom(rng: () => number): Genome | null {
    if (this.genomes.length === 0) return null;
    const idx = Math.floor(rng() * this.genomes.length);
    return this.genomes[idx];
  }

  /**
   * Get the best genome overall, or null if empty.
   */
  getBestGenome(): Genome | null {
    return this.genomes.length > 0 ? this.genomes[0] : null;
  }

  get size(): number {
    return this.genomes.length;
  }

  get isEmpty(): boolean {
    return this.genomes.length === 0;
  }

  /**
   * Serialize all genomes for saving.
   */
  serialize(): GenomeJSON[] {
    return this.genomes.map(serializeGenome);
  }

  /**
   * Load genomes from serialized data.
   */
  deserialize(data: GenomeJSON[]): void {
    this.genomes = [];
    for (const g of data) {
      if (validateGenomeJSON(g, BRAIN_WEIGHT_COUNT)) {
        this.genomes.push(deserializeGenome(g));
      }
    }
    this.genomes.sort((a, b) => b.fitness - a.fitness);
    this.genomes = this.genomes.slice(0, this.maxSize);
  }

  /**
   * Clear all stored genomes.
   */
  clear(): void {
    this.genomes = [];
  }
}

// ──────────────────────────────────────────────
// MUTATION OPERATORS
// ──────────────────────────────────────────────

/**
 * Apply Gaussian noise mutation to a weight array.
 * Each weight is mutated independently with probability mutationRate.
 * Mutation magnitude follows Gaussian distribution with sigma=magnitude.
 *
 * Returns a NEW Float32Array (original is not modified).
 */
export function mutateWeights(
  weights: Float32Array,
  mutationRate: number,
  magnitude: number,
  rng: () => number
): Float32Array {
  const mutated = new Float32Array(weights);
  let mutationCount = 0;

  for (let i = 0; i < mutated.length; i++) {
    if (rng() < mutationRate) {
      // Box-Muller transform for Gaussian noise
      const u1 = Math.max(rng(), 1e-10);
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      mutated[i] += magnitude * z;
      // Clamp to prevent explosion
      mutated[i] = Math.max(-10, Math.min(10, mutated[i]));
      mutationCount++;
    }
  }

  // Attach mutation count to the array for tracking (via prototype trick)
  (mutated as unknown as { _mutationCount: number })._mutationCount = mutationCount;
  return mutated;
}

/**
 * Structural mutation: randomly zero-out or randomize individual weights.
 * This simulates adding/removing synaptic connections.
 *
 * Returns a NEW Float32Array.
 */
export function structuralMutate(
  weights: Float32Array,
  rate: number,
  rng: () => number
): Float32Array {
  const result = new Float32Array(weights);
  for (let i = 0; i < result.length; i++) {
    if (rng() < rate) {
      if (result[i] === 0) {
        // Activate a dead synapse
        result[i] = (rng() * 2 - 1) * 0.5;
      } else {
        // Prune an active synapse
        result[i] = 0;
      }
    }
  }
  return result;
}

/**
 * Full brain reset — completely randomize all weights.
 * Prevents population stagnation by introducing radical diversity.
 * Returns a NEW Float32Array.
 */
export function fullReset(weightCount: number, rng: () => number): Float32Array {
  const weights = new Float32Array(weightCount);
  for (let i = 0; i < weights.length; i++) {
    weights[i] = (rng() * 2 - 1) * 1.0; // uniform [-1, 1]
  }
  return weights;
}

// ──────────────────────────────────────────────
// CROSSOVER OPERATOR
// ──────────────────────────────────────────────

/**
 * Perform uniform crossover between a parent weight array and a
 * randomly selected Hall of Fame genome.
 *
 * Each weight is taken from either the parent or the HoF genome
 * with 50/50 probability.
 *
 * Returns a NEW Float32Array (neither input is modified).
 * If Hall of Fame is empty, returns a copy of the parent weights.
 */
export function crossover(
  parentWeights: Float32Array,
  hallOfFame: HallOfFame,
  crossoverChance: number,
  rng: () => number
): Float32Array {
  if (rng() >= crossoverChance || hallOfFame.isEmpty) {
    return new Float32Array(parentWeights);
  }

  const hofGenome = hallOfFame.getRandom(rng);
  if (!hofGenome) return new Float32Array(parentWeights);

  const hofWeights = hofGenome.weights;
  const result = new Float32Array(parentWeights.length);

  for (let i = 0; i < result.length; i++) {
    // Uniform crossover: 50/50 from each parent
    result[i] = rng() < 0.5 ? parentWeights[i] : hofWeights[i];
  }

  return result;
}

// ──────────────────────────────────────────────
// OFFSPRING BRAIN CREATION
// ──────────────────────────────────────────────

/**
 * Create a new NeuralNetwork for an offspring cube.
 * Steps:
 *   1. Clone the parent's weight array
 *   2. With crossoverChance probability, crossover with a HoF genome
 *   3. With fullResetRate probability, completely randomize (stagnation breaker)
 *   4. Apply per-weight Gaussian mutation
 *   5. Apply structural mutation (add/remove connections)
 *
 * @param parentBrain   The parent cube's neural network
 * @param hallOfFame    Shared Hall of Fame for crossover
 * @param generation    Generation of the offspring (used to decay mutation rates)
 * @param rng           Seeded PRNG
 * @returns             New NeuralNetwork ready for the offspring
 */
export function createOffspringBrain(
  parentBrain: NeuralNetwork,
  hallOfFame: HallOfFame,
  generation: number,
  rng: () => number
): NeuralNetwork {
  // Decay mutation parameters with generation
  const genDecay = Math.pow(CONFIG.MUTATION_RATE_DECAY, Math.min(generation, 10000));
  const mutationRate = CONFIG.MUTATION_RATE * genDecay;
  const mutationMagnitude = CONFIG.MUTATION_MAGNITUDE * Math.pow(CONFIG.MUTATION_MAGNITUDE_DECAY, Math.min(generation, 10000));

  let weights: Float32Array;

  // Full reset (very rare — prevents stagnation)
  if (rng() < CONFIG.FULL_RESET_RATE) {
    weights = fullReset(parentBrain.totalWeightCount(), rng);
  } else {
    // Step 1: Start with parent weights
    const parentWeights = parentBrain.getWeights();

    // Step 2: Crossover with Hall of Fame
    weights = crossover(parentWeights, hallOfFame, CONFIG.CROSSOVER_CHANCE, rng);

    // Step 3: Structural mutation (add/remove connections)
    if (rng() < CONFIG.STRUCTURAL_MUTATION_RATE) {
      weights = structuralMutate(weights, CONFIG.STRUCTURAL_MUTATION_RATE, rng);
    }

    // Step 4: Gaussian weight mutation
    weights = mutateWeights(weights, mutationRate, mutationMagnitude, rng);
  }

  const offspringBrain = new NeuralNetwork();
  offspringBrain.setWeights(weights);
  return offspringBrain;
}

// ──────────────────────────────────────────────
// GENOME + BRAIN UTILITIES
// ──────────────────────────────────────────────

/**
 * Extract a Genome from a NeuralNetwork with the given metadata.
 */
export function extractGenome(
  brain: NeuralNetwork,
  fitness: number,
  generation: number,
  parentId: number,
  era: number,
  mutations: number
): Genome {
  return {
    weights: brain.getWeights(),
    fitness,
    generation,
    parentId,
    era,
    mutations,
  };
}

/**
 * Load a Genome's weights into a NeuralNetwork.
 * The network must have the same architecture.
 */
export function loadGenomeIntoBrain(genome: Genome, brain: NeuralNetwork): void {
  brain.setWeights(genome.weights);
}

/**
 * Create a new NeuralNetwork loaded with a Genome's weights.
 */
export function brainFromGenome(genome: Genome): NeuralNetwork {
  const brain = new NeuralNetwork();
  brain.setWeights(genome.weights);
  return brain;
}

/**
 * Create an offspring Genome from a parent, with mutated weights.
 */
export function evolveGenome(
  parentGenome: Genome,
  parentId: number,
  hallOfFame: HallOfFame,
  rng: () => number
): Genome {
  // Use brain to handle the mutation logic
  const parentBrain = brainFromGenome(parentGenome);
  const offspringBrain = createOffspringBrain(parentBrain, hallOfFame, parentGenome.generation, rng);

  return createOffspringGenome(
    parentGenome,
    parentId,
    offspringBrain.getWeights(),
    1 // count this as 1 mutation event (individual weights may have 0-N mutations internally)
  );
}

// Re-export calculateFitness for convenience
export { calculateFitness };

// ──────────────────────────────────────────────
// GLOBAL HALL OF FAME INSTANCE
// ──────────────────────────────────────────────

// Singleton Hall of Fame shared by all cubes
export const globalHallOfFame = new HallOfFame(CONFIG.HALL_OF_FAME_SIZE);

// Attacker Hall of Fame (for Wave 4+ predators)
export const attackerHallOfFame = new HallOfFame(CONFIG.ATTACKER_HALL_OF_FAME_SIZE);
