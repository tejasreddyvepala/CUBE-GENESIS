// ============================================================
// CUBE GENESIS — Cube Entity (The Protagonist)
// Neural-network driven agent with RL + evolutionary learning.
// ============================================================

import * as THREE from 'three';
import { CONFIG, CubeState } from '../config.ts';
import { NeuralNetwork } from '../brain/NeuralNetwork.ts';
import { Genome, createGenome, calculateFitness } from '../brain/Genome.ts';
import { ReinforcementLearner } from '../brain/ReinforcementLearner.ts';
import { HallOfFame, createOffspringBrain, extractGenome } from '../brain/Evolution.ts';
import { generationColor, cubeGlowColor } from '../utils/color.ts';
import { normalizeAngle, clamp } from '../utils/math.ts';
import { BRAIN_WEIGHT_COUNT } from '../config.ts';

// ──────────────────────────────────────────────
// MESH POOL
// ──────────────────────────────────────────────

const _meshPool: THREE.Mesh[] = [];
const _lightPool: THREE.PointLight[] = [];
const _shieldPool: THREE.Mesh[] = [];

const _boxGeo = new THREE.BoxGeometry(1, 1, 1);
const _shieldGeo = new THREE.SphereGeometry(1.2, 8, 6);
const _shieldMat = new THREE.MeshLambertMaterial({
  color: 0x00ffc8,
  transparent: true,
  opacity: 0.15,
});

function acquireCubeMesh(size: number, color: THREE.Color): THREE.Mesh {
  if (_meshPool.length > 0) {
    const m = _meshPool.pop()!;
    m.visible = true;
    m.scale.setScalar(size);
    (m.material as THREE.MeshStandardMaterial).color.copy(color);
    return m;
  }
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(CONFIG.CUBE_GLOW_COLOR),
    emissiveIntensity: 0.3,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(_boxGeo, mat);
  mesh.castShadow = true;
  mesh.scale.setScalar(size);
  return mesh;
}

function releaseCubeMesh(mesh: THREE.Mesh): void {
  mesh.visible = false;
  _meshPool.push(mesh);
}

function acquireLight(): THREE.PointLight {
  if (_lightPool.length > 0) {
    const l = _lightPool.pop()!;
    l.visible = true;
    return l;
  }
  return new THREE.PointLight(CONFIG.CUBE_GLOW_COLOR, 1.2, 8);
}

function releaseLight(l: THREE.PointLight): void {
  l.visible = false;
  _lightPool.push(l);
}

function acquireShield(): THREE.Mesh {
  if (_shieldPool.length > 0) {
    const s = _shieldPool.pop()!;
    s.visible = true;
    return s;
  }
  return new THREE.Mesh(_shieldGeo, _shieldMat.clone());
}

function releaseShield(s: THREE.Mesh): void {
  s.visible = false;
  _shieldPool.push(s);
}

// ──────────────────────────────────────────────
// CUBE CLASS
// ──────────────────────────────────────────────

export class Cube {
  id: number;
  position: THREE.Vector3;
  direction: number;      // facing angle in radians (XZ plane)
  energy: number;
  maxEnergy: number;
  age: number;
  maxAge: number;
  generation: number;
  era: number;

  brain: NeuralNetwork;
  genome: Genome;
  rl: ReinforcementLearner;

  // Stats
  foodEaten: number = 0;
  distanceTraveled: number = 0;
  damageDealt: number = 0;
  damageTaken: number = 0;
  offspringCount: number = 0;
  structuresBuilt: number = 0;

  // State machine
  state: CubeState = 'exploring';

  // Visual
  size: number;
  glowIntensity: number = 0.3;
  color: THREE.Color;

  // Lineage
  lineage: number[];       // [parentId, grandparentId, ...]
  _nearestLeafId?: number; // Set by LineageTracker for save system

  // Velocity (XZ)
  velocity: { x: number; z: number } = { x: 0, z: 0 };

  // Build cooldown
  lastBuildTick: number = -CONFIG.STRUCTURE_BUILD_COOLDOWN;

  // Last sensor inputs (for RL and inspection)
  lastSensorInputs: Float32Array = new Float32Array(16);

  // Intelligence metric — RMS of output activations (0=random noise, 1=fully decisive)
  decisionConfidence: number = 0;

  // Reward tracking
  lifetimeRewardScore: number = 0;
  recentRewardRate: number = 0;
  private rewardHistory: number[] = [];        // one entry per TICK (not per addReward call)
  private tickRewardAccumulator: number = 0;   // sums all addReward() calls within one tick
  idleTicks: number = 0;

  // Starvation — ticks spent below low-energy threshold
  lowEnergyTicks: number = 0;
  private prevDistToNearestFood: number = -1;
  private prevDistToNearestAttacker: number = -1;
  wasNearAttacker: boolean = false;

  // Knowledge discovery tracking
  private visitedCells: Map<string, number> = new Map(); // cellKey → last visit tick
  consistentDirTicks: number = 0;   // consecutive ticks holding stable heading
  private prevDirection: number = 0;

  // Speed bonuses
  private foodChainCount: number = 0;
  private foodChainWindowStart: number = 0;
  private foodChainSpeedBonus: number = 0; // flat bonus from food chain (decays)

  // Sprint state machine
  sprintTicksLeft: number = 0;       // ticks remaining in current sprint burst
  sprintCooldownLeft: number = 0;    // ticks until sprint is available again

  // Trail
  trailPositions: THREE.Vector3[] = [];

  // Is defending
  isDefending: boolean = false;
  isSprinting: boolean = false;

  // Set to true when cube bounced off world boundary this tick
  wallBouncedThisTick: boolean = false;

  // Fitness (computed on demand)
  get fitness(): number {
    return calculateFitness(this.age, this.foodEaten, this.offspringCount, this.structuresBuilt);
  }

  // Three.js objects
  mesh: THREE.Mesh;
  glowLight: THREE.PointLight;
  private shieldMesh: THREE.Mesh | null = null;
  private scene: THREE.Scene;

  constructor(
    id: number,
    position: THREE.Vector3,
    scene: THREE.Scene,
    parentCube?: Cube,
    hallOfFame?: HallOfFame,
    rng: () => number = Math.random
  ) {
    this.id = id;
    this.position = position.clone();
    this.direction = rng() * Math.PI * 2;
    this.scene = scene;

    if (parentCube) {
      // Offspring
      this.generation = parentCube.generation + 1;
      this.energy = parentCube.energy * 0.5;   // split energy
      this.lineage = [parentCube.id, ...parentCube.lineage.slice(0, 15)];
      this.brain = createOffspringBrain(parentCube.brain, hallOfFame ?? new HallOfFame(), this.generation, rng);
    } else {
      // Genesis cube
      this.generation = 1;
      this.energy = CONFIG.CUBE_INITIAL_ENERGY;
      this.lineage = [];
      this.brain = new NeuralNetwork();
      this.brain.randomize(rng);
    }

    this.maxEnergy = CONFIG.CUBE_MAX_ENERGY;
    this.age = 0;
    this.maxAge = CONFIG.CUBE_MAX_AGE_BASE + this.generation * CONFIG.CUBE_MAX_AGE_PER_GEN;
    this.era = 0;

    this.genome = createGenome(BRAIN_WEIGHT_COUNT);
    this.genome.generation = this.generation;
    this.genome.parentId = parentCube?.id ?? 0;
    this.genome.era = this.era;

    this.rl = new ReinforcementLearner(CONFIG.LEARNING_RATE);

    // Visuals
    const lineageRoot = this.lineage.length > 0 ? this.lineage[this.lineage.length - 1] : id;
    this.color = generationColor(lineageRoot, this.generation);
    this.size = CONFIG.CUBE_BASE_SIZE + this.generation * CONFIG.CUBE_SIZE_PER_GEN;

    this.mesh = acquireCubeMesh(this.size, this.color);
    this.mesh.position.copy(position);
    this.mesh.position.y = this.size / 2;

    this.glowLight = acquireLight();
    this.mesh.add(this.glowLight);

    scene.add(this.mesh);
  }

  // ──────────────────────────────────────────────
  // UPDATE — main per-tick logic
  // ──────────────────────────────────────────────

  update(deltaTime: number, inputs: Float32Array, currentEra: number, worldSize: number = CONFIG.WORLD_SIZE): void {
    this.era = Math.max(this.era, currentEra);
    this.lastSensorInputs = inputs;

    // Neural net forward pass
    const out = this.brain.forward(inputs);

    // Clamp era-locked outputs
    const turnLeft    = out[0];
    const turnRight   = out[1];
    const moveForward = out[2];
    // out[3] = eat   — always active
    // out[4] = build — era 5+ (index 4)
    const buildRaw    = currentEra >= 4 ? out[4] : 0;
    // out[5] = signal — era 4+ (index 3)
    // out[6] = sprint — era 2+ (index 1)
    const sprintRaw   = currentEra >= 1 ? out[6] : 0;
    // out[7] = defend — era 4+ (index 3)
    const defendRaw   = currentEra >= 3 ? out[7] : 0;

    this.isDefending = defendRaw > CONFIG.CUBE_DEFEND_THRESHOLD;

    // Sprint state machine — duration + cooldown
    if (this.sprintCooldownLeft > 0) {
      this.sprintCooldownLeft--;
      this.isSprinting = false;
    } else if (this.isSprinting && this.sprintTicksLeft > 0) {
      this.sprintTicksLeft--;
      if (this.sprintTicksLeft === 0) {
        this.isSprinting = false;
        this.sprintCooldownLeft = CONFIG.CUBE_SPRINT_COOLDOWN;
      }
    } else if (!this.isSprinting && !this.isDefending && sprintRaw > CONFIG.CUBE_SPRINT_THRESHOLD) {
      // Start a new sprint
      this.isSprinting = true;
      this.sprintTicksLeft = CONFIG.CUBE_SPRINT_DURATION;
    } else if (this.isDefending) {
      // Defending cancels sprint
      this.isSprinting = false;
    }

    // Build action check is handled externally (EntityManager)
    void buildRaw;

    // Compute speed — base + era bonus + food chain bonus, hard-capped at MAX_SPEED
    let speed = CONFIG.CUBE_BASE_SPEED
      + this.era * CONFIG.CUBE_SPEED_PER_ERA
      + this.foodChainSpeedBonus;
    speed = Math.min(speed, CONFIG.CUBE_MAX_SPEED); // enforce hard cap before multipliers
    if (this.isSprinting) speed *= CONFIG.CUBE_SPRINT_MULTIPLIER;
    if (this.isDefending) speed *= CONFIG.CUBE_SPEED_REDUCTION_DEFEND;
    // Re-apply hard cap after multipliers (sprint can briefly exceed but won't go crazy)
    speed = Math.min(speed, CONFIG.CUBE_MAX_SPEED * CONFIG.CUBE_SPRINT_MULTIPLIER);

    // Turn — clamp net turn signal to [-1, 1] so opposing outputs can't amplify beyond max rate
    const turnNet = Math.max(-1, Math.min(1, turnLeft - turnRight));
    const turnDelta = turnNet * CONFIG.CUBE_TURN_RATE * deltaTime * 60;
    this.direction = normalizeAngle(this.direction + turnDelta);

    // Move — lerp velocity toward target each tick.
    // Map moveForward [-1, 1] → [0, 1] so a fresh brain (output ≈ 0) moves at half speed.
    // Without this, Math.max(0, ~0) = 0 and the cube never moves, blocking all learning.
    const dt60 = deltaTime * 60;
    const fwd = (moveForward + 1) * 0.5; // -1→stopped, 0→half speed, +1→full speed
    const targetSpeed = fwd * speed;
    const targetVX = Math.sin(this.direction) * targetSpeed;
    const targetVZ = Math.cos(this.direction) * targetSpeed;
    const damp = CONFIG.CUBE_MOMENTUM_DAMPING;
    this.velocity.x = this.velocity.x * damp + targetVX * (1 - damp);
    this.velocity.z = this.velocity.z * damp + targetVZ * (1 - damp);

    // Apply (dt60 makes movement frame-rate independent)
    const oldX = this.position.x;
    const oldZ = this.position.z;
    this.position.x += this.velocity.x * dt60;
    this.position.z += this.velocity.z * dt60;

    // Bounce off world boundaries — flag bounce for RL penalty in World.ts
    this.wallBouncedThisTick = false;
    const half = worldSize / 2 - this.size * 0.5;
    if (Math.abs(this.position.x) > half) {
      this.position.x = Math.sign(this.position.x) * half;
      this.velocity.x *= -0.5;
      this.wallBouncedThisTick = true;
    }
    if (Math.abs(this.position.z) > half) {
      this.position.z = Math.sign(this.position.z) * half;
      this.velocity.z *= -0.5;
      this.wallBouncedThisTick = true;
    }

    // Distance traveled
    const dx = this.position.x - oldX;
    const dz = this.position.z - oldZ;
    this.distanceTraveled += Math.sqrt(dx * dx + dz * dz);

    // Direction consistency tracking
    const dirDelta = Math.abs(normalizeAngle(this.direction - this.prevDirection));
    if (dirDelta < CONFIG.DIR_CONSISTENCY_THRESHOLD) {
      this.consistentDirTicks++;
    } else {
      this.consistentDirTicks = 0;
    }
    this.prevDirection = this.direction;

    // Exploration novelty — track visited grid cells
    const cellX = Math.floor(this.position.x / CONFIG.EXPLORATION_CELL_SIZE);
    const cellZ = Math.floor(this.position.z / CONFIG.EXPLORATION_CELL_SIZE);
    const cellKey = `${cellX},${cellZ}`;
    const lastVisit = this.visitedCells.get(cellKey) ?? -CONFIG.EXPLORATION_REVISIT_TICKS;
    if (this.age - lastVisit >= CONFIG.EXPLORATION_REVISIT_TICKS) {
      this.visitedCells.set(cellKey, this.age);
      this.addReward(CONFIG.REWARD_EXPLORATION);
    }
    // Prune old entries to prevent unbounded growth (keep last 200)
    if (this.visitedCells.size > 200) {
      const oldest = [...this.visitedCells.entries()].sort((a, b) => a[1] - b[1])[0];
      if (oldest) this.visitedCells.delete(oldest[0]);
    }

    // Energy drain — idle vs moving, scales with speed
    const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const speedFraction = Math.min(currentSpeed / CONFIG.CUBE_MAX_SPEED, 1.0);
    const moveDrain = CONFIG.CUBE_ENERGY_DRAIN_IDLE
      + speedFraction * (CONFIG.CUBE_ENERGY_DRAIN_FAST - CONFIG.CUBE_ENERGY_DRAIN_IDLE);
    let drain = moveDrain * deltaTime * 60;
    if (this.isSprinting) drain += CONFIG.CUBE_SPRINT_DRAIN * deltaTime * 60;
    drain *= 1 + (this.size - 1) * 0.1; // larger cubes drain more
    this.energy -= drain;
    this.energy = clamp(this.energy, 0, this.maxEnergy);

    // Starvation timer — die if energy stays critically low for too long
    if (this.energy < CONFIG.CUBE_LOW_ENERGY_THRESHOLD) {
      this.lowEnergyTicks++;
    } else {
      this.lowEnergyTicks = 0;
    }

    // Age
    this.age++;

    // --- IDLE PUNISHMENT ---
    const vel = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (vel < CONFIG.IDLE_THRESHOLD_VELOCITY) {
      this.idleTicks++;
      let idleReward: number;
      if (this.idleTicks >= CONFIG.IDLE_ESCALATE_TICKS_2) {
        idleReward = CONFIG.REWARD_IDLE_ESCALATE_2;
      } else if (this.idleTicks >= CONFIG.IDLE_ESCALATE_TICKS_1) {
        idleReward = CONFIG.REWARD_IDLE_ESCALATE_1;
      } else {
        idleReward = CONFIG.REWARD_IDLE_BASE;
      }
      this.addReward(idleReward);
    } else {
      this.idleTicks = 0;
      // Moving is neutral — no reward added
    }

    // Direction consistency reward — holding a heading means purposeful movement
    if (this.consistentDirTicks >= CONFIG.DIR_CONSISTENCY_TICKS) {
      this.addReward(CONFIG.REWARD_DIR_CONSISTENCY);
    }

    // Compute decision confidence — RMS of output activations.
    // A random brain produces ~0.2; a decisive trained brain trends toward ~0.6+.
    let rmsSum = 0;
    for (let i = 0; i < out.length; i++) rmsSum += out[i] * out[i];
    this.decisionConfidence = Math.sqrt(rmsSum / out.length);

    // State machine update
    this._updateState(inputs);

    // Update trail (record every tick, cap at CONFIG.TRAIL_POSITION_COUNT)
    this.trailPositions.push(this.position.clone());
    if (this.trailPositions.length > CONFIG.TRAIL_POSITION_COUNT) {
      this.trailPositions.shift();
    }

    // Update mesh position/rotation
    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
    this.mesh.position.y = this.size / 2;
    this.mesh.rotation.y = -this.direction;

    // Sprint stretch effect
    if (this.isSprinting) {
      this.mesh.scale.set(this.size * 0.9, this.size * 0.9, this.size * 1.15);
    } else {
      this.mesh.scale.setScalar(this.size);
    }

    // Glow update
    this.glowIntensity = clamp(this.energy / this.maxEnergy, 0.05, 1.0);
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.emissive.copy(cubeGlowColor(this.glowIntensity));
    mat.emissiveIntensity = this.glowIntensity;
    this.glowLight.intensity = this.glowIntensity * 1.5;

    // Shield mesh visibility
    if (this.isDefending) {
      if (!this.shieldMesh) {
        this.shieldMesh = acquireShield();
        this.mesh.add(this.shieldMesh);
      }
      this.shieldMesh.visible = true;
    } else if (this.shieldMesh) {
      this.shieldMesh.visible = false;
    }

    // Survive tick reward — added here, but commit+update deferred to World.ts
    // so all world rewards (approach-food, near-miss, etc.) are included first.
    this.addReward(CONFIG.REWARD_SURVIVE_TICK);
  }

  /**
   * Called by World.ts AFTER all per-tick rewards have been applied.
   * Commits accumulated rewards to the rolling window and runs the RL weight update.
   */
  finalizeTickRewards(): void {
    this.rl.commitTickReward();
    this.rl.updateWeights(this.brain);
    // Push per-tick total to history (one entry per tick, not per addReward call)
    this.rewardHistory.push(this.tickRewardAccumulator);
    this.tickRewardAccumulator = 0;
    if (this.rewardHistory.length > CONFIG.REWARD_HISTORY_LENGTH) {
      this.rewardHistory.shift();
    }
    this.recentRewardRate = this.rewardHistory.reduce((a, b) => a + b, 0) / Math.max(this.rewardHistory.length, 1);
  }

  // ──────────────────────────────────────────────
  // STATE MACHINE
  // ──────────────────────────────────────────────

  private _updateState(inputs: Float32Array): void {
    const foodDist = inputs[0];
    const attackerDist = inputs[2];
    const localDensity = inputs[10];

    if (this.lowEnergyTicks > 50) {
      this.state = 'starving';
    } else if (this.isDefending) {
      this.state = 'defending';
    } else if (attackerDist < 0.4) {
      this.state = 'fleeing';
    } else if (foodDist < 0.4) {
      this.state = 'hunting';
    } else if (localDensity > 0.3) {
      this.state = 'socializing';
    } else {
      this.state = 'exploring';
    }
  }

  // ──────────────────────────────────────────────
  // EAT FOOD
  // ──────────────────────────────────────────────

  eatFood(value: number): void {
    this.energy = clamp(this.energy + value, 0, this.maxEnergy);
    this.foodEaten++;
    this.addReward(CONFIG.REWARD_EAT);

    // Food chain speed bonus — temporary flat bonus that decays
    if (this.age - this.foodChainWindowStart <= CONFIG.CUBE_FOOD_CHAIN_WINDOW) {
      this.foodChainCount++;
      if (this.foodChainCount >= CONFIG.CUBE_FOOD_CHAIN_COUNT) {
        this.foodChainSpeedBonus = CONFIG.CUBE_SPEED_FOOD_CHAIN;
        this.foodChainCount = 0;
        this.foodChainWindowStart = this.age;
      }
    } else {
      this.foodChainCount = 1;
      this.foodChainWindowStart = this.age;
    }
    // Decay food chain bonus each eat
    this.foodChainSpeedBonus = Math.max(0, this.foodChainSpeedBonus - 0.0001);
  }

  // ──────────────────────────────────────────────
  // DAMAGE
  // ──────────────────────────────────────────────

  takeDamage(amount: number): void {
    const actualDamage = this.isDefending ? amount * CONFIG.CUBE_DAMAGE_REDUCTION_DEFEND : amount;
    this.energy -= actualDamage;
    this.damageTaken += actualDamage;
    this.addReward(CONFIG.REWARD_HIT_BY_ATTACKER);
    this.energy = Math.max(0, this.energy);
  }

  // ──────────────────────────────────────────────
  // DUPLICATION
  // ──────────────────────────────────────────────

  canDuplicate(population: number): boolean {
    return (
      this.energy >= CONFIG.CUBE_DUPLICATE_THRESHOLD &&
      this.age >= CONFIG.CUBE_DUPLICATE_MIN_AGE &&
      population < CONFIG.MAX_CUBES
    );
  }

  duplicate(
    newId: number,
    spawnPos: THREE.Vector3,
    scene: THREE.Scene,
    hallOfFame: HallOfFame,
    rng: () => number
  ): Cube {
    // Parent loses half energy
    this.energy *= 0.5;
    this.offspringCount++;
    this.addReward(CONFIG.REWARD_DUPLICATE);

    // Record genome before offspring creation
    this.genome = extractGenome(
      this.brain,
      this.fitness,
      this.generation,
      this.lineage[0] ?? 0,
      this.era,
      0
    );

    const offspring = new Cube(newId, spawnPos, scene, this, hallOfFame, rng);
    return offspring;
  }

  // ──────────────────────────────────────────────
  // DEATH
  // ──────────────────────────────────────────────

  isDead(): boolean {
    return this.energy <= 0
      || this.age >= this.maxAge
      || this.lowEnergyTicks >= CONFIG.CUBE_STARVATION_TICKS;
  }

  applyDeathPenalty(): void {
    this.rl.applyDeathPenalty(this.brain);
  }

  // ──────────────────────────────────────────────
  // GENOME / FITNESS
  // ──────────────────────────────────────────────

  computeFitness(): number {
    return calculateFitness(this.age, this.foodEaten, this.offspringCount, this.structuresBuilt);
  }

  extractCurrentGenome(): Genome {
    return extractGenome(
      this.brain,
      this.computeFitness(),
      this.generation,
      this.lineage[0] ?? 0,
      this.era,
      0
    );
  }

  // ──────────────────────────────────────────────
  // BUILD ACTION CHECK
  // ──────────────────────────────────────────────

  wantsToBuild(currentEra: number): boolean {
    if (currentEra < 4) return false;
    const out = this.brain.lastOutput;
    return out[4] > CONFIG.CUBE_BUILD_THRESHOLD &&
      this.energy >= CONFIG.STRUCTURE_BUILD_COST &&
      this.age - this.lastBuildTick >= CONFIG.STRUCTURE_BUILD_COOLDOWN;
  }

  wantsToEat(): boolean {
    return this.brain.lastOutput[3] > CONFIG.CUBE_EAT_THRESHOLD;
  }

  wantsToSignal(currentEra: number): boolean {
    if (currentEra < 3) return false;
    return this.brain.lastOutput[5] > CONFIG.CUBE_SIGNAL_THRESHOLD;
  }

  // ──────────────────────────────────────────────
  // REWARD TRACKING
  // ──────────────────────────────────────────────

  addReward(reward: number): void {
    this.rl.addReward(reward);
    this.lifetimeRewardScore += reward;
    this.tickRewardAccumulator += reward; // defer to per-tick history in finalizeTickRewards
  }

  getRewardHistory(): number[] {
    return this.rewardHistory.slice();
  }

  // ──────────────────────────────────────────────
  // DISPOSE
  // ──────────────────────────────────────────────

  dispose(): void {
    if (this.shieldMesh) {
      this.mesh.remove(this.shieldMesh);
      releaseShield(this.shieldMesh);
      this.shieldMesh = null;
    }
    this.mesh.remove(this.glowLight);
    releaseLight(this.glowLight);
    this.scene.remove(this.mesh);
    releaseCubeMesh(this.mesh);
  }
}
