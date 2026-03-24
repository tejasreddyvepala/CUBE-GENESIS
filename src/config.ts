// ============================================================
// CUBE GENESIS — Centralized Configuration
// ALL tunable constants live here. Never hardcode in logic files.
// ============================================================

export const CONFIG = {
  // ──────────────────────────────────────────────
  // WORLD
  // ──────────────────────────────────────────────
  WORLD_SIZE: 120,
  GRID_CELL_SIZE: 10,

  // ──────────────────────────────────────────────
  // CUBES
  // ──────────────────────────────────────────────
  INITIAL_CUBES: 1,          // Start with ONE cube
  MAX_CUBES: 100,
  // Speed — intentionally slow so cubes must use intelligence, not legs
  CUBE_BASE_SPEED: 0.05,       // Gen 1 cube is SLOWER than Seekers (0.07)
  CUBE_MAX_SPEED: 0.10,        // Hard cap — can never exceed this with all bonuses
  CUBE_TURN_RATE: 0.06,        // Sluggish — 180° turn takes ~52 ticks
  CUBE_MOMENTUM_DAMPING: 0.92, // Heavy — takes time to stop and change direction
  CUBE_SPRINT_MULTIPLIER: 1.5, // Sprint: 1.5x current speed (brief burst)
  CUBE_SPRINT_DURATION: 180,   // ticks (~3 seconds at 1x)
  CUBE_SPRINT_COOLDOWN: 300,   // ticks (~5 seconds at 1x)
  CUBE_SPEED_PER_ERA: 0.005,   // Tiny permanent speed bonus per era reached
  CUBE_SPEED_FOOD_CHAIN: 0.005, // Temporary speed bonus from food chain
  CUBE_FOOD_CHAIN_WINDOW: 500, // ticks to eat 3 food for speed bonus
  CUBE_FOOD_CHAIN_COUNT: 3,

  // Energy
  CUBE_INITIAL_ENERGY: 50,
  CUBE_MAX_ENERGY: 100,
  CUBE_ENERGY_DRAIN_IDLE: 0.01,    // standing still — minimal drain
  CUBE_ENERGY_DRAIN_MOVING: 0.02,  // moving at base speed
  CUBE_ENERGY_DRAIN_FAST: 0.03,    // moving at max speed
  CUBE_SPRINT_DRAIN: 0.08,         // additional per tick while sprinting (very expensive)

  // Starvation — cube dies if energy stays critically low too long
  CUBE_LOW_ENERGY_THRESHOLD: 15,  // energy below this starts starvation timer
  CUBE_STARVATION_TICKS: 300,     // ticks at low energy before death (~5s at 1x)

  CUBE_DUPLICATE_THRESHOLD: 60,
  CUBE_DUPLICATE_MIN_AGE: 200,
  CUBE_MAX_AGE_BASE: 5000,
  CUBE_MAX_AGE_PER_GEN: 100, // additional ticks per generation
  CUBE_VISION_RANGE: 25,
  CUBE_VISION_RANGE_ERA2: 40,
  CUBE_BASE_SIZE: 1.0,
  CUBE_SIZE_PER_GEN: 0.005,  // grows slightly with generation
  CUBE_DAMAGE_REDUCTION_DEFEND: 0.5, // 50% damage reduction when defending
  CUBE_SPEED_REDUCTION_DEFEND: 0.5,  // 50% speed reduction when defending
  CUBE_EAT_THRESHOLD: 0.1,    // output > threshold triggers eat
  CUBE_BUILD_THRESHOLD: 0.5,
  CUBE_SIGNAL_THRESHOLD: 0.5,
  CUBE_SPRINT_THRESHOLD: 0.5,
  CUBE_DEFEND_THRESHOLD: 0.5,
  CUBE_EAT_RANGE: 3.5,        // distance to trigger food collection (auto, no output required)
  TRAIL_POSITION_COUNT: 30,   // positions stored for trail

  // ──────────────────────────────────────────────
  // FOOD
  // ──────────────────────────────────────────────
  FOOD_MAX: 80,
  FOOD_SPAWN_INTERVAL: 150,   // ticks between spawns
  FOOD_CLUSTER_CHANCE: 0.3,
  FOOD_CLUSTER_SIZE_MIN: 3,
  FOOD_CLUSTER_SIZE_MAX: 5,
  FOOD_CLUSTER_RADIUS: 8,     // units around existing food for cluster
  FOOD_VALUE_MIN: 15,
  FOOD_VALUE_MAX: 30,
  FOOD_BOB_AMPLITUDE: 0.2,    // Y-axis bobbing
  FOOD_BOB_FREQUENCY: 0.002,  // radians per tick
  FOOD_RADIUS_MIN: 0.3,
  FOOD_RADIUS_MAX: 0.5,

  // ──────────────────────────────────────────────
  // ATTACKERS
  // ──────────────────────────────────────────────
  ATTACKER_WAVES: {
    drifter: {
      speed: 0.04,
      damage: 15,
      spawnInterval: 400,
      maxAlive: 8,
      hp: 30,
      packSize: 1,
      hasBrain: false,
      turnRate: 0.02,
    },
    seeker: {
      speed: 0.07,
      damage: 20,
      spawnInterval: 350,
      maxAlive: 12,
      hp: 40,
      packSize: 1,
      hasBrain: false,
      retargetInterval: 60, // ticks between target recalculations
      turnRate: 0.04,
    },
    pack: {
      speed: 0.09,
      damage: 18,
      spawnInterval: 500,
      maxAlive: 20,
      hp: 35,
      packSize: 3,         // spawns in packs
      packSizeMax: 5,
      hasBrain: false,
      // Boid weights
      separationWeight: 1.5,
      alignmentWeight: 1.0,
      cohesionWeight: 0.8,
      turnRate: 0.05,
    },
    predator: {
      speed: 0.10,
      damage: 25,
      spawnInterval: 500,
      maxAlive: 10,
      hp: 50,
      packSize: 1,
      hasBrain: true,
      brainLayers: [6, 8, 3],
      // Brain inputs: nearestCubeDist, nearestCubeAngle, cubeVelX, cubeVelZ, ownEnergy, wallDist
      // Brain outputs: turnLeft, turnRight, moveForward
      turnRate: 0.07,
    },
    siege: {
      speed: 0.03,
      damage: 40,
      spawnInterval: 1000,
      maxAlive: 3,
      hp: 100,
      packSize: 1,
      hasBrain: false,
      structureDamage: 30,
      sizeMultiplier: 3.0,
      turnRate: 0.01,
    },
    swarm: {
      speed: 0.12,
      damage: 8,
      spawnInterval: 1500,
      maxAlive: 40,
      hp: 15,
      packSize: 20,
      packSizeMax: 40,
      hasBrain: true,
      sharedBrain: true,  // hive mind — all units share one brain
      turnRate: 0.08,
    },
  },

  // ──────────────────────────────────────────────
  // STRUCTURES
  // ──────────────────────────────────────────────
  STRUCTURE_MAX: 150,
  STRUCTURE_BUILD_COST: 8,     // energy cost per block
  STRUCTURE_BUILD_COOLDOWN: 200, // ticks between builds per cube
  STRUCTURE_HP: 50,
  STRUCTURE_WALL_REPEL_RADIUS: 0,      // walls don't repel
  STRUCTURE_BEACON_REPEL_RADIUS: 15,   // beacons repel Wave 1-3
  STRUCTURE_SHELTER_DAMAGE_REDUCTION: 0.5,
  STRUCTURE_SETTLEMENT_RADIUS: 20,     // distance for settlement detection
  STRUCTURE_SETTLEMENT_MIN_COUNT: 5,   // min structures to form settlement

  // ──────────────────────────────────────────────
  // BRAIN / NEURAL NETWORK
  // ──────────────────────────────────────────────
  BRAIN_LAYERS: [16, 24, 16, 8] as const,
  LEARNING_RATE: 0.003,             // low to prevent weight saturation
  MUTATION_RATE: 0.12,              // per-weight mutation probability
  MUTATION_MAGNITUDE: 0.15,         // Gaussian sigma for mutation noise
  MUTATION_RATE_DECAY: 0.999,       // multiplied each generation
  MUTATION_MAGNITUDE_DECAY: 0.999,
  STRUCTURAL_MUTATION_RATE: 0.02,   // add/remove connection
  FULL_RESET_RATE: 0.005,           // full brain randomization
  CROSSOVER_CHANCE: 0.3,
  HALL_OF_FAME_SIZE: 50,
  REWARD_WINDOW: 30,                // ticks for rolling average

  // ──────────────────────────────────────────────
  // ERAS
  // ──────────────────────────────────────────────
  ERA_COUNT: 7,
  ERA_THRESHOLDS: [0, 50, 150, 400, 800, 1500, 3000] as number[],
  ERA_NAMES: [
    'Survival',
    'Awareness',
    'Duplication',
    'Cooperation',
    'Construction',
    'Civilization',
    'Expansion',
  ] as string[],
  ERA_COLORS: [
    '#00ffc8', // Era 1 — teal
    '#00aaff', // Era 2 — blue
    '#aa00ff', // Era 3 — purple
    '#ffaa00', // Era 4 — gold
    '#ffffff', // Era 5 — white
    '#ff88ff', // Era 6 — prismatic pink
    '#ffffc8', // Era 7 — warm white/gold (dawn of a new world)
  ] as string[],

  // ──────────────────────────────────────────────
  // ERA 7 — WORLD EXPANSION
  // ──────────────────────────────────────────────
  WORLD_MAX_SIZE: 480,             // hard cap on world growth (4× base)
  WORLD_EXPANSION_PER_BEACON: 4,  // units added per beacon built in Era 7+
  WORLD_EXPANSION_MAX_CUBES: 200, // MAX_CUBES scales up in Era 7
  ERA_FLASH_DURATION: 3000,         // ms for era flash overlay
  ERA_SLOWMO_FACTOR: 0.25,          // time scale during flash
  ERA_SLOWMO_DURATION: 2000,        // ms

  // ──────────────────────────────────────────────
  // CIV SCORE WEIGHTS
  // ──────────────────────────────────────────────
  CIV_WEIGHT_ALIVE: 1.0,
  CIV_WEIGHT_FOOD_EATEN: 0.1,
  CIV_WEIGHT_MAX_GEN: 2.0,
  CIV_WEIGHT_STRUCTURES: 3.0,
  CIV_WEIGHT_SURVIVAL_TIME: 0.01,
  CIV_WEIGHT_DUPLICATIONS: 1.5,

  // ──────────────────────────────────────────────
  // REWARDS
  // ──────────────────────────────────────────────
  REWARD_EAT: 1.0,
  REWARD_APPROACH_FOOD: 0.1,
  REWARD_HIT_BY_ATTACKER: -2.0,
  REWARD_FLEE_ATTACKER: 0.2,
  REWARD_NEAR_ALLY: 0.05,
  REWARD_BUILD: 0.5,
  REWARD_DEATH: -5.0,
  REWARD_SURVIVE_TICK: 0.001,
  REWARD_DUPLICATE: 2.0,
  REWARD_SIGNAL: 0.01,

  // Knowledge discovery / exploration
  REWARD_EXPLORATION: 0.04,          // entering a grid cell not visited in EXPLORATION_REVISIT_TICKS
  EXPLORATION_CELL_SIZE: 15,         // world units per novelty cell
  EXPLORATION_REVISIT_TICKS: 300,    // ticks before a cell is "novel" again
  REWARD_FOOD_DISCOVERY: 0.25,       // one-time reward when food first enters vision this tick
  REWARD_DIR_CONSISTENCY: 0.004,     // per tick for holding consistent heading
  DIR_CONSISTENCY_TICKS: 8,          // must hold direction at least this many ticks
  DIR_CONSISTENCY_THRESHOLD: 0.15,   // radians — heading change smaller than this = "consistent"
  HUNGER_URGENCY_LOW: 0.35,          // below this energy fraction, urgency scaling starts
  HUNGER_URGENCY_MAX: 3.0,           // max multiplier on food rewards when nearly starving
  REWARD_DANGER_TURN: 0.15,          // per tick for rotating away from nearby attacker
  DANGER_TURN_DISTANCE: 12,          // world units — attacker must be this close to trigger

  // New reward constants
  REWARD_MOVING: 0.0,               // Moving is neutral — expected default state
  REWARD_IDLE_BASE: -0.15,          // Standing still punishment
  REWARD_IDLE_ESCALATE_1: -0.3,     // Still idle after 50 ticks
  REWARD_IDLE_ESCALATE_2: -0.5,     // Still idle after 100 ticks
  IDLE_THRESHOLD_VELOCITY: 0.01,    // Below this velocity = "standing still"
  IDLE_ESCALATE_TICKS_1: 50,
  IDLE_ESCALATE_TICKS_2: 100,
  REWARD_FLEE_HUNGRY: -0.05,        // Moving away from food when hungry (energy < 30)
  REWARD_APPROACH_ATTACKER: -0.1,   // Walking toward attacker (unless defending)
  REWARD_NEAR_MISS_DODGE: 0.5,      // Dodged attacker within 3 units (was close, now safe)
  REWARD_IN_SHELTER: 0.03,          // Being inside a shelter structure
  REWARD_WALL_BOUNCE: -0.08,        // Penalty for hitting world boundary (teaches pre-emptive turning)
  REWARD_BAR_VISIBLE_DISTANCE: 40,  // Camera distance threshold for reward bar LOD
  REWARD_HISTORY_LENGTH: 100,       // Ticks for recent reward rate rolling average

  // ──────────────────────────────────────────────
  // FACTION WAR (Phase 1)
  // ──────────────────────────────────────────────
  FACTION_HERO: 0,
  FACTION_ENEMY: 1,

  // Bases — fortress at each faction's corner
  BASE_HP: 600,
  BASE_RADIUS: 8,              // units — damage zone around base
  BASE_ATTACK_DAMAGE: 0,       // base itself doesn't attack, units do
  BASE_CORNER_OFFSET: 15,      // units from world edge where base spawns
  BASE_LIGHT_INTENSITY: 3.0,
  BASE_LIGHT_RADIUS: 30,

  // Hero attack — cubes can now deal damage when attack output fires
  HERO_ATTACK_DAMAGE: 12,
  HERO_ATTACK_RANGE: 3.5,
  HERO_ATTACK_THRESHOLD: 0.5,  // output must exceed this to trigger attack
  HERO_ATTACK_COOLDOWN: 30,    // ticks between attacks

  // Base zones (Era 7 faction war)
  BASE_PROTECTION_RADIUS: 10,  // entering enemy base inner zone = instant death
  BASE_DAMAGE_RADIUS: 14,      // outer zone — attacks deal damage to base from here
  ERA7_CUBE_SPAWN_COUNT: 8,    // evolved cubes spawned near hero base at Era 7
  ERA7_FOOD_FLOOD: 50,         // food items dropped across world at Era 7 start

  // Faction war rewards
  REWARD_KILL_ENEMY_UNIT: 3.0,
  REWARD_DAMAGE_ENEMY_BASE: 0.5,
  REWARD_NEAR_OWN_BASE: 0.02,   // per tick for defending home
  REWARD_HOLD_MIDFIELD: 0.03,   // per tick for being in contested zone
  REWARD_ENEMY_BASE_DESTROYED: 15.0,

  // Food layout — heavier spawn in contested middle, lighter near bases
  FOOD_MIDFIELD_FRACTION: 0.6,  // 60% of food spawns in middle third of map

  // Phase 2 — Attacker energy system (pack hunters and above)
  ATTACKER_ENERGY_MAX: 200,
  ATTACKER_ENERGY_DRAIN: 0.06,     // per tick — starves in ~3300 ticks without food
  ATTACKER_ENERGY_WAVE_MIN: 2,     // wave index ≥ 2 (pack hunters+) have energy
  ATTACKER_FOOD_EAT_RANGE: 2.5,   // units — auto-eat food within this distance
  ATTACKER_FOOD_RESTORE: 30,       // energy restored per food item eaten

  // Phase 3 — Jump mechanics
  CUBE_JUMP_THRESHOLD: 0.85,       // defend output above this triggers jump
  CUBE_JUMP_IMPULSE: 1.5,          // initial upward velocity (units/s)
  CUBE_GRAVITY: 20.0,              // downward acceleration (units/s²)
  CUBE_JUMP_COOLDOWN: 80,          // ticks between jumps
  CUBE_JUMP_AIRBORNE_HEIGHT: 1.5,  // positionY above this = airborne (dodge ground attacks)
  CUBE_JUMP_ATTACK_RANGE_BONUS: 1.8, // attack range multiplier while airborne (height advantage)

  // Phase 4 — Role specialization
  ROLE_EMA_ALPHA: 0.01,            // exponential moving average factor for output tracking
  ROLE_DOMINANCE_THRESHOLD: 0.5,   // EMA must exceed this for a role to be assigned

  // ──────────────────────────────────────────────
  // RENDERING
  // ──────────────────────────────────────────────
  TRAIL_LENGTH: 30,
  TRAIL_CAMERA_DISTANCE: 60,
  PARTICLE_BUDGET: 200,
  HUD_UPDATE_INTERVAL: 10,          // frames between HUD DOM updates
  BLOOM_STRENGTH: 0.8,
  FOG_DENSITY: 0.003,
  FOG_COLOR: 0x1a1a2e,
  AMBIENT_LIGHT_COLOR: 0x778899,
  AMBIENT_LIGHT_INTENSITY: 0.45,
  DIR_LIGHT_COLOR: 0xffffff,
  DIR_LIGHT_INTENSITY: 0.7,
  STAR_COUNT: 200,
  STAR_SPHERE_RADIUS: 500,
  GRID_COLOR: 0x3a3a52,
  GRID_SIZE: 120,
  GRID_DIVISIONS: 24,               // 120 / 5 = 24 cells of 5 units
  CUBE_GLOW_COLOR: 0x00ffc8,
  FOOD_COLOR: 0x00ff88,
  ATTACKER_COLOR: 0xff2244,
  STRUCTURE_COLOR: 0xaabbcc,
  STRUCTURE_EMISSIVE: 0x00ffc8,

  // Camera
  CAMERA_MIN_DISTANCE: 20,
  CAMERA_MAX_DISTANCE: 200,
  CAMERA_DEFAULT_DISTANCE: 80,
  CAMERA_DEFAULT_ELEVATION: Math.PI / 4,  // 45 degrees
  CAMERA_AUTO_ORBIT_SPEED: 0.0002,        // radians per ms
  CAMERA_FOLLOW_OFFSET_Y: 8,
  CAMERA_FOLLOW_OFFSET_BACK: 12,
  CAMERA_LERP_FACTOR: 0.05,

  // ──────────────────────────────────────────────
  // SIMULATION
  // ──────────────────────────────────────────────
  SIM_SPEEDS: [1, 3, 8, 20] as number[],
  DEFAULT_SIM_SPEED_INDEX: 0,
  MAX_DELTA: 50,                    // ms cap to prevent spiral of death
  SEED: null as number | null,      // null = Date.now(), set for reproducibility

  // ──────────────────────────────────────────────
  // PERSISTENCE
  // ──────────────────────────────────────────────
  AUTOSAVE_INTERVAL: 3600,          // ticks (~60s at 1x)
  AUTOSAVE_ON_ERA_CHANGE: true,
  EMERGENCY_SAVE_ON_UNLOAD: true,
  MAX_LOCALSTORAGE_SIZE: 4_000_000, // 4MB warning threshold in bytes
  SAVE_VERSION: '1.0.0',
  STATS_HISTORY_LENGTH: 500,        // data points kept for mini graphs
  LOCALSTORAGE_KEY_AUTOSAVE: 'cube-genesis-autosave',
  LOCALSTORAGE_KEY_EMERGENCY: 'cube-genesis-emergency',
  LINEAGE_TREE_MAX_EDGES: 500,

  // ──────────────────────────────────────────────
  // FITNESS WEIGHTS (for genome evaluation)
  // ──────────────────────────────────────────────
  FITNESS_SURVIVAL_WEIGHT: 0.4,
  FITNESS_FOOD_WEIGHT: 0.3,
  FITNESS_OFFSPRING_WEIGHT: 0.2,
  FITNESS_STRUCTURES_WEIGHT: 0.1,

  // ──────────────────────────────────────────────
  // SOCIAL / COOPERATION
  // ──────────────────────────────────────────────
  ALLY_NEAR_RADIUS: 10,             // radius for ally proximity bonus
  SIGNAL_RADIUS: 20,                // range of the signal output
  DAMAGE_SHARE_RADIUS: 5,           // Era 4+: damage split among clustered cubes
  DAMAGE_SHARE_MIN_CUBES: 3,

  // ──────────────────────────────────────────────
  // ATTACKER EVOLUTION (Wave 4+)
  // ──────────────────────────────────────────────
  ATTACKER_HALL_OF_FAME_SIZE: 20,
  ATTACKER_MUTATION_RATE: 0.1,
  ATTACKER_MUTATION_MAGNITUDE: 0.12,     // low — same saturation fix as cubes
  ATTACKER_LEARNING_RATE: 0.001,         // very low — stable online RL for long-lived brains
  ATTACKER_REWARD_KILL: 2.0,
  ATTACKER_REWARD_HIT: 0.5,
  ATTACKER_REWARD_APPROACH_CUBE: 0.03,  // shaping: reward for closing distance to nearest cube
  ATTACKER_REWARD_NEAR_STRUCTURE: -0.3,  // punished for dying near structures
  ATTACKER_CROSSOVER_CHANCE: 0.25,
} as const;

// Type helper for era index
export type EraIndex = 0 | 1 | 2 | 3 | 4 | 5;

// Type helper for attacker wave type
export type AttackerWaveType = keyof typeof CONFIG.ATTACKER_WAVES;

// Type helper for structure types
export type StructureType = 'wall' | 'shelter' | 'beacon';

// Type helper for cube states
export type CubeState = 'exploring' | 'hunting' | 'fleeing' | 'building' | 'socializing' | 'defending' | 'starving';

// Derived constants (computed from CONFIG, not stored separately)
export const BRAIN_WEIGHT_COUNT = (() => {
  const layers = CONFIG.BRAIN_LAYERS;
  let count = 0;
  for (let i = 0; i < layers.length - 1; i++) {
    count += layers[i] * layers[i + 1]; // weight matrix
    count += layers[i + 1];              // bias vector
  }
  return count;
})();
