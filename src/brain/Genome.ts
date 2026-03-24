// ============================================================
// CUBE GENESIS — Genome
// Serializable representation of a neural network's weights
// plus evolutionary metadata. This is the unit of inheritance.
//
// The genome is a flat Float32Array of all network weights
// (in canonical NeuralNetwork order) plus scalar metadata.
//
// JSON serialization converts Float32Array → number[] because
// JSON.stringify cannot handle typed arrays directly.
// ============================================================

// ──────────────────────────────────────────────
// INTERFACES
// ──────────────────────────────────────────────

/**
 * Raw genome data. This is what gets stored in the Hall of Fame,
 * passed to offspring, and included in save files.
 */
export interface Genome {
  /** Flat weight array (all network weights + biases in order). */
  weights: Float32Array;

  /** Fitness score at time of evaluation. */
  fitness: number;

  /** Generation number of the cube this genome came from. */
  generation: number;

  /** ID of the parent cube (0 if no parent / genesis). */
  parentId: number;

  /** Highest era reached by the cube during its lifetime. */
  era: number;

  /** Cumulative number of weight mutations applied across lineage. */
  mutations: number;
}

/**
 * JSON-safe representation of a Genome for save files.
 * Float32Array is stored as a regular number[] for JSON compatibility.
 */
export interface GenomeJSON {
  weights: number[];
  fitness: number;
  generation: number;
  parentId: number;
  era: number;
  mutations: number;
}

// ──────────────────────────────────────────────
// GENOME FACTORY
// ──────────────────────────────────────────────

/**
 * Create a new genome with zero weights and default metadata.
 */
export function createGenome(weightCount: number): Genome {
  return {
    weights: new Float32Array(weightCount),
    fitness: 0,
    generation: 1,
    parentId: 0,
    era: 0,
    mutations: 0,
  };
}

/**
 * Clone a genome, producing an independent copy.
 */
export function cloneGenome(genome: Genome): Genome {
  return {
    weights: new Float32Array(genome.weights),
    fitness: genome.fitness,
    generation: genome.generation,
    parentId: genome.parentId,
    era: genome.era,
    mutations: genome.mutations,
  };
}

/**
 * Create a genome for an offspring.
 * Sets generation = parent.generation + 1, clears fitness.
 */
export function createOffspringGenome(
  parentGenome: Genome,
  parentId: number,
  weights: Float32Array,
  mutationCount: number = 0
): Genome {
  return {
    weights: new Float32Array(weights),
    fitness: 0,
    generation: parentGenome.generation + 1,
    parentId,
    era: parentGenome.era,
    mutations: parentGenome.mutations + mutationCount,
  };
}

// ──────────────────────────────────────────────
// SERIALIZATION
// ──────────────────────────────────────────────

/**
 * Serialize a Genome to a JSON-safe object.
 * Float32Array is converted to a regular number array.
 *
 * IMPORTANT: Always use this for any save/transfer operation.
 * JSON.stringify(Float32Array) produces an object, not an array.
 */
export function serializeGenome(genome: Genome): GenomeJSON {
  return {
    weights: Array.from(genome.weights),  // Float32Array → number[]
    fitness: genome.fitness,
    generation: genome.generation,
    parentId: genome.parentId,
    era: genome.era,
    mutations: genome.mutations,
  };
}

/**
 * Deserialize a GenomeJSON back to a Genome with proper Float32Array.
 * Call this when loading from localStorage or a file.
 */
export function deserializeGenome(data: GenomeJSON): Genome {
  return {
    weights: new Float32Array(data.weights),  // number[] → Float32Array
    fitness: data.fitness,
    generation: data.generation,
    parentId: data.parentId,
    era: data.era,
    mutations: data.mutations,
  };
}

/**
 * Validate that a GenomeJSON has the required fields and correct weight count.
 * Returns true if valid, false if corrupt.
 */
export function validateGenomeJSON(data: unknown, expectedWeightCount: number): boolean {
  if (!data || typeof data !== 'object') return false;
  const g = data as Record<string, unknown>;

  if (!Array.isArray(g.weights)) return false;
  if (g.weights.length !== expectedWeightCount) return false;
  if (typeof g.fitness !== 'number') return false;
  if (typeof g.generation !== 'number') return false;
  if (typeof g.parentId !== 'number') return false;
  if (typeof g.era !== 'number') return false;
  if (typeof g.mutations !== 'number') return false;

  // Check all weights are finite numbers
  for (const w of g.weights as unknown[]) {
    if (typeof w !== 'number' || !isFinite(w)) return false;
  }

  return true;
}

// ──────────────────────────────────────────────
// FITNESS CALCULATION
// ──────────────────────────────────────────────

/**
 * Calculate fitness score for a cube at end of life.
 * Used by the Hall of Fame to rank genomes.
 *
 * Weights:
 *   survivalTime    × 0.4  — longevity is fundamental
 *   foodEaten       × 0.3  — resource gathering
 *   offspringCount  × 0.2  — reproductive success
 *   structuresBuilt × 0.1  — civilization contribution
 */
export function calculateFitness(
  survivalTime: number,
  foodEaten: number,
  offspringCount: number,
  structuresBuilt: number
): number {
  return (
    survivalTime    * 0.4 +
    foodEaten       * 0.3 * 10  + // scale food to be comparable with time
    offspringCount  * 0.2 * 100 + // scale offspring heavily
    structuresBuilt * 0.1 * 50    // structures are rare, give them weight
  );
}

/**
 * Normalized fitness relative to a max value (for Hall of Fame ranking).
 */
export function normalizeFitness(fitness: number, maxFitness: number): number {
  if (maxFitness <= 0) return 0;
  return Math.min(fitness / maxFitness, 1);
}
