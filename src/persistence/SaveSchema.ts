// ============================================================
// CUBE GENESIS — Save Schema
// Versioned save file interfaces + migration system.
// ============================================================

export const CURRENT_SAVE_VERSION = '1.0.0';

// ──────────────────────────────────────────────
// SAVE FILE ROOT
// ──────────────────────────────────────────────

export interface SaveFile {
  version: string;
  savedAt: number;
  checksum: string;
  _emergency?: boolean;

  simulation: SimulationState;
  hallOfFame: GenomeSave[];
  cubes: CubesSave;
  lineageTree: LineageTreeSave;
  attackers: AttackerSave[];
  attackerHallOfFame: AttackerGenomeSave[];
  foods: FoodSave[];
  structures: StructureSave[];
  statsHistory: StatsHistorySave;
}

// ──────────────────────────────────────────────
// SIMULATION STATE
// ──────────────────────────────────────────────

export interface SimulationState {
  worldAge: number;
  currentEra: number;
  civScore: number;
  maxGenerationReached: number;
  totalDeaths: number;
  totalDuplications: number;
  totalFoodEaten: number;
  bestSurvivalTime: number;
  seed: number | null;
  tickCount: number;
}

// ──────────────────────────────────────────────
// GENOME SAVES
// ──────────────────────────────────────────────

export interface GenomeSave {
  weights: number[];      // Float32Array serialized to number[]
  fitness: number;
  generation: number;
  parentId: number;
  era: number;
  mutations: number;
}

export interface AttackerGenomeSave {
  weights: number[];
  kills: number;
  generation: number;
}

// ──────────────────────────────────────────────
// CUBE SAVES
// ──────────────────────────────────────────────

export interface LeafNodeSave {
  id: number;
  position: [number, number, number];
  direction: number;
  energy: number;
  age: number;
  generation: number;
  era: number;
  state: string;
  brain: number[];          // Full serialized weights
  stats: {
    foodEaten: number;
    distanceTraveled: number;
    offspringCount: number;
    structuresBuilt: number;
    damageTaken: number;
  };
  lineage: number[];
  lineageDepth: number;
  isLeaf: true;
}

export interface GhostSave {
  id: number;
  position: [number, number, number];
  direction: number;
  energy: number;
  age: number;
  generation: number;
  era: number;
  state: string;
  nearestLeafId: number;
}

export interface CubesSave {
  leafNodes: LeafNodeSave[];
  ghosts: GhostSave[];
}

// ──────────────────────────────────────────────
// LINEAGE TREE
// ──────────────────────────────────────────────

export interface LineageTreeSave {
  edges: Array<[number, number]>;   // [childId, parentId]
  roots: number[];
}

// ──────────────────────────────────────────────
// ATTACKER SAVE
// ──────────────────────────────────────────────

export interface AttackerSave {
  type: string;
  position: [number, number, number];
  direction: number;
  hp: number;
  brain: number[] | null;
  packId: number | null;
}

// ──────────────────────────────────────────────
// FOOD SAVE
// ──────────────────────────────────────────────

export interface FoodSave {
  position: [number, number, number];
  value: number;
}

// ──────────────────────────────────────────────
// STRUCTURE SAVE
// ──────────────────────────────────────────────

export interface StructureSave {
  type: 'wall' | 'shelter' | 'beacon';
  position: [number, number, number];
  hp: number;
  builderId: number;
}

// ──────────────────────────────────────────────
// STATS HISTORY
// ──────────────────────────────────────────────

export interface StatsHistorySave {
  population: number[];
  avgFitness: number[];
  foodSupply: number[];
  killDeathRatio: number[];
}

// ──────────────────────────────────────────────
// SCHEMA VALIDATION
// ──────────────────────────────────────────────

export function validateSaveFile(data: unknown): data is SaveFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'string') return false;
  if (typeof d.savedAt !== 'number') return false;
  if (!d.simulation || typeof d.simulation !== 'object') return false;
  if (!Array.isArray(d.hallOfFame)) return false;
  if (!d.cubes || typeof d.cubes !== 'object') return false;

  const sim = d.simulation as Record<string, unknown>;
  if (typeof sim.worldAge !== 'number') return false;
  if (typeof sim.currentEra !== 'number') return false;

  return true;
}

// ──────────────────────────────────────────────
// SCHEMA MIGRATION
// ──────────────────────────────────────────────

export function migrate(data: Record<string, unknown>): SaveFile {
  const version = (data.version as string) ?? '0.0.0';

  // Future: migrate v1.0.0 → v1.1.0 etc.
  // For now, just ensure required fields exist with defaults.

  const sim = (data.simulation as Record<string, unknown>) ?? {};

  return {
    version: CURRENT_SAVE_VERSION,
    savedAt: (data.savedAt as number) ?? Date.now(),
    checksum: (data.checksum as string) ?? '',
    _emergency: (data._emergency as boolean) ?? false,
    simulation: {
      worldAge:             (sim.worldAge as number)             ?? 0,
      currentEra:           (sim.currentEra as number)           ?? 0,
      civScore:             (sim.civScore as number)              ?? 0,
      maxGenerationReached: (sim.maxGenerationReached as number)  ?? 1,
      totalDeaths:          (sim.totalDeaths as number)           ?? 0,
      totalDuplications:    (sim.totalDuplications as number)     ?? 0,
      totalFoodEaten:       (sim.totalFoodEaten as number)        ?? 0,
      bestSurvivalTime:     (sim.bestSurvivalTime as number)      ?? 0,
      seed:                 (sim.seed as number | null)            ?? null,
      tickCount:            (sim.tickCount as number)             ?? 0,
    },
    hallOfFame:        (data.hallOfFame as GenomeSave[])               ?? [],
    cubes:             (data.cubes as CubesSave)                       ?? { leafNodes: [], ghosts: [] },
    lineageTree:       (data.lineageTree as LineageTreeSave)            ?? { edges: [], roots: [] },
    attackers:         (data.attackers as AttackerSave[])              ?? [],
    attackerHallOfFame:(data.attackerHallOfFame as AttackerGenomeSave[]) ?? [],
    foods:             (data.foods as FoodSave[])                      ?? [],
    structures:        (data.structures as StructureSave[])            ?? [],
    statsHistory:      (data.statsHistory as StatsHistorySave)         ?? {
      population: [], avgFitness: [], foodSupply: [], killDeathRatio: [],
    },
  };
}
