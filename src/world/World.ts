// ============================================================
// CUBE GENESIS — World
// Master simulation state manager. Runs the full simulation loop.
// ============================================================

import * as THREE from 'three';
import { CONFIG, AttackerWaveType } from '../config.ts';
import { EntityManager } from '../entities/EntityManager.ts';
import { FoodSpawner } from './FoodSpawner.ts';
import { EraManager } from '../systems/EraManager.ts';
import { CivilizationTracker, Settlement } from '../systems/CivilizationTracker.ts';
import { AttackerEvolution } from '../systems/AttackerEvolution.ts';
import { PhysicsSystem } from '../systems/PhysicsSystem.ts';
import { RewardSystem } from '../systems/RewardSystem.ts';
import { LineageTracker } from '../systems/LineageTracker.ts';
import { HallOfFame, globalHallOfFame, extractGenome } from '../brain/Evolution.ts';
import { initGlobalRNG, rng, createPRNG, clamp, distance2D, directionTo, relativeAngle, normalizeDistance, normalizeAngle, randomPositionInWorld } from '../utils/math.ts';
import { Cube } from '../entities/Cube.ts';
import { Attacker } from '../entities/Attacker.ts';
import { Base } from '../entities/Base.ts';

// ──────────────────────────────────────────────
// WORLD STATS (for HUD)
// ──────────────────────────────────────────────

export interface WorldStats {
  worldAge: number;
  population: number;
  maxPopulation: number;
  generation: number;
  foodCount: number;
  maxFood: number;
  structureCount: number;
  attackerCount: number;
  currentEra: number;
  eraName: string;
  civScore: number;
  bestSurvivalTime: number;
  activeWave: string;
  totalDeaths: number;
  totalDuplications: number;
  totalFoodEaten: number;
  // Intelligence tracking
  intelligenceIndex: number;   // rolling avg fitness-per-tick at death, normalized 0–100
  intelligenceTrend: 'rising' | 'falling' | 'stable';
  avgDecisionConfidence: number; // population avg of output-layer RMS (0=random, 1=decisive)
}

// ──────────────────────────────────────────────
// WORLD CLASS
// ──────────────────────────────────────────────

export class World {
  entityManager: EntityManager;
  foodSpawner: FoodSpawner;
  eraManager: EraManager;
  civTracker: CivilizationTracker;
  attackerEvolution: AttackerEvolution;
  lineageTracker: LineageTracker;
  hallOfFame: HallOfFame;

  // Global sim state
  worldAge: number = 0;
  civScore: number = 0;
  maxGenerationReached: number = 1;
  totalDeaths: number = 0;
  totalDuplications: number = 0;
  totalFoodEaten: number = 0;
  bestSurvivalTime: number = 0;
  seed: number | null;

  // Era 7 — world expansion
  effectiveWorldSize: number = CONFIG.WORLD_SIZE;
  totalBeaconsBuilt: number = 0;

  // Faction war — bases
  heroBase: Base | null = null;
  enemyBase: Base | null = null;
  factionWarActive: boolean = false;
  warResult: 'hero' | 'enemy' | null = null;

  // Private
  private rng: () => number;
  private scene: THREE.Scene;
  private attackerSpawnTimers: Record<string, number> = {};
  private newEraCallback: ((era: number) => void) | null = null;

  // Stats history for graphs
  statsHistory: {
    population: number[];
    avgFitness: number[];
    foodSupply: number[];
    killDeathRatio: number[];
  } = { population: [], avgFitness: [], foodSupply: [], killDeathRatio: [] };

  private statsHistoryTick: number = 0;
  private totalKills: number = 0;

  // Intelligence tracking — fitness-per-tick recorded at each cube's death
  // Split into two windows (each 20 deaths) to compute trend direction
  private intelligenceWindow: number[] = [];        // last 20 fitness-per-tick values
  private intelligencePrevWindow: number[] = [];    // previous 20 (for trend comparison)
  private readonly INTELLIGENCE_WINDOW_SIZE = 20;
  intelligenceIndex: number = 0;
  intelligenceTrend: 'rising' | 'falling' | 'stable' = 'stable';

  // Previous distances for reward shaping (per cube)
  private prevFoodDist: Map<number, number> = new Map();
  private prevAttackerDist: Map<number, number> = new Map();
  private prevAttackerAngle: Map<number, number> = new Map(); // cubeId → last tick's inputs[3]

  // Previous distance to nearest cube (per attacker, for approach reward shaping)
  private attackerPrevCubeDist: Map<number, number> = new Map();

  // Settlements cache (updated periodically)
  private settlements: Settlement[] = [];
  private settlementUpdateTick: number = 0;

  constructor(scene: THREE.Scene, seed: number | null = null) {
    this.scene = scene;
    this.seed = seed;
    this.rng = seed !== null ? createPRNG(seed) : Math.random;

    this.entityManager = new EntityManager(scene);
    this.foodSpawner = new FoodSpawner();
    this.civTracker = new CivilizationTracker();
    this.attackerEvolution = new AttackerEvolution();
    this.lineageTracker = new LineageTracker();
    this.hallOfFame = globalHallOfFame;

    this.eraManager = new EraManager((newEra: number) => {
      // Era 7 (index 6) — double world, ensure war is running, flood food + spawn elites
      if (newEra === 6) {
        const jumpSize = Math.min(CONFIG.WORLD_MAX_SIZE, CONFIG.WORLD_SIZE * 2);
        if (jumpSize > this.effectiveWorldSize) {
          this.effectiveWorldSize = jumpSize;
          this.newEraCallback?.(-1); // fire expansion signal first so grid updates
        }
        if (!this.factionWarActive) this.activateFactionWar();
        this._initEra7();
      }
      this.newEraCallback?.(newEra);
    });

    // Init attacker spawn timers
    for (const type of Object.keys(CONFIG.ATTACKER_WAVES)) {
      this.attackerSpawnTimers[type] = 0;
    }
  }

  setEraTransitionCallback(cb: (era: number) => void): void {
    this.newEraCallback = cb;
  }

  // ──────────────────────────────────────────────
  // INITIALIZE
  // ──────────────────────────────────────────────

  initialize(): void {
    // ── Single genesis cube at world center ──
    const startPos = new THREE.Vector3(0, 0, 0);
    const cube = this.entityManager.spawnCube(startPos, undefined, this.hallOfFame, this.rng);
    this.lineageTracker.addCube(cube.id, 0);

    const bestGenome = this.hallOfFame.getBestGenome();
    if (bestGenome) cube.brain.setWeights(new Float32Array(bestGenome.weights));

    // ── Initial food scattered across the world ──
    for (let i = 0; i < 20; i++) {
      const p = randomPositionInWorld(CONFIG.WORLD_SIZE, this.rng);
      const value = Math.floor(15 + this.rng() * 15);
      this.entityManager.spawnFood(new THREE.Vector3(p.x, 0, p.z), value);
    }

    // Faction war starts at Era 6 — see _activateFactionWar()
  }

  // ──────────────────────────────────────────────
  // ERA 6 — ACTIVATE FACTION WAR
  // Called once when Era 6 (Civilization) is reached.
  // ──────────────────────────────────────────────

  activateFactionWar(): void {
    if (this.factionWarActive) return;

    const half = this.effectiveWorldSize / 2;
    const offset = CONFIG.BASE_CORNER_OFFSET;

    // Hero base — top-left corner
    const heroPos = new THREE.Vector3(-half + offset, 0, -half + offset);
    this.heroBase = new Base(9000001, CONFIG.FACTION_HERO, heroPos, this.scene);

    // Enemy base — bottom-right corner
    const enemyPos = new THREE.Vector3(half - offset, 0, half - offset);
    this.enemyBase = new Base(9000002, CONFIG.FACTION_ENEMY, enemyPos, this.scene);

    this.factionWarActive = true;

    // Spawn a ring of defensive walls around the enemy base (pre-built fortification)
    const wallRingRadius = 7;
    const wallCount = 6;
    for (let i = 0; i < wallCount; i++) {
      const angle = (i / wallCount) * Math.PI * 2;
      const wx = enemyPos.x + Math.cos(angle) * wallRingRadius;
      const wz = enemyPos.z + Math.sin(angle) * wallRingRadius;
      this.entityManager.addStructure('wall', new THREE.Vector3(wx, 0, wz), 9000002);
    }
  }

  // ──────────────────────────────────────────────
  // MAIN SIMULATION LOOP
  // ──────────────────────────────────────────────

  update(deltaTime: number): void {
    this.worldAge++;

    // 1. Update spatial hashes
    this.entityManager.updateSpatialHashes();

    // 2. Food bobbing handled by FoodRenderer (InstancedMesh) — no per-entity update needed

    // 3. For each alive cube: sense → think → act → reward → RL
    const cubes = this.entityManager.getAliveCubes();
    const deadCubeIds: number[] = [];
    const newCubes: Cube[] = [];

    const visionRange = this.eraManager.getVisionRange();

    for (const cube of cubes) {
      // Gather sensory inputs
      const inputs = this.gatherSensorInputs(cube);
      const prevFD = this.prevFoodDist.get(cube.id) ?? 1;
      const prevAD = this.prevAttackerDist.get(cube.id) ?? 1;
      const prevAA = this.prevAttackerAngle.get(cube.id) ?? 0;

      // Store absolute nearest distances for reward shaping (inputs[13]=food, inputs[14]=attacker)
      this.prevFoodDist.set(cube.id, inputs[13]);
      this.prevAttackerDist.set(cube.id, inputs[14]);
      // Compute nearest attacker angle for danger-turn reward (separate from sector inputs)
      const nearestAtkForAngle = this.entityManager.getNearestAttacker(cube.position, visionRange);
      const newAtkAngle = nearestAtkForAngle
        ? relativeAngle(cube.direction, directionTo(cube.position.x, cube.position.z, nearestAtkForAngle.position.x, nearestAtkForAngle.position.z))
        : 0;
      this.prevAttackerAngle.set(cube.id, newAtkAngle);

      // Run brain + apply movement
      cube.update(deltaTime, inputs, this.eraManager.currentEra, this.effectiveWorldSize);

      // Check eat — automatic on proximity, no output gate required.
      // The cube only needs to learn to MOVE toward food; eating happens when close enough.
      {
        const food = this.entityManager.getNearestFood(cube.position, CONFIG.CUBE_EAT_RANGE);
        if (food && !food.isEaten && PhysicsSystem.checkCubeFood(cube, food)) {
          cube.eatFood(food.value);
          food.eat();
          this.totalFoodEaten++;
          this.entityManager.spatialHashFood.remove(food.id);
          // Remove food after brief delay (handled by removing from map)
          this.entityManager.removeFood(food.id);
        }
      }

      // Check build
      if (cube.wantsToBuild(this.eraManager.currentEra)) {
        const buildPos = cube.position.clone();
        buildPos.x += Math.sin(cube.direction) * 2;
        buildPos.z += Math.cos(cube.direction) * 2;

        // Pick structure type based on output magnitude
        const out = cube.brain.lastOutput;
        let type: 'wall' | 'shelter' | 'beacon' = 'wall';
        const mag = Math.abs(out[4]);
        if (mag > 0.8) type = 'beacon';
        else if (mag > 0.6) type = 'shelter';

        const built = this.entityManager.addStructure(type, buildPos, cube.id);
        if (built) {
          cube.energy -= CONFIG.STRUCTURE_BUILD_COST;
          cube.lastBuildTick = cube.age;
          cube.structuresBuilt++;
          cube.addReward(RewardSystem.calcBuildReward(this.eraManager.currentEra));

          // Era 7+: beacons push the world boundary outward
          if (type === 'beacon' && this.eraManager.currentEra >= 6) {
            this.totalBeaconsBuilt++;
            const newSize = Math.min(
              CONFIG.WORLD_MAX_SIZE,
              CONFIG.WORLD_SIZE + this.totalBeaconsBuilt * CONFIG.WORLD_EXPANSION_PER_BEACON
            );
            if (newSize > this.effectiveWorldSize) {
              this.effectiveWorldSize = newSize;
              this.newEraCallback?.(-1); // signal expansion (negative = not era change, just expansion)
            }
          }
        }
      }

      // Tick reward
      const nearbyAllies = this.entityManager.getCubesInRadius(cube.position, CONFIG.ALLY_NEAR_RADIUS).length - 1;

      // Check if inside shelter for in-shelter reward
      const structures = this.entityManager.getStructures();
      const isInShelter = PhysicsSystem.isInsideShelter(cube.position, structures);

      // Distances in world units for reward shaping — use absolute nearest (inputs[13/14])
      const prevFoodDistWorld = prevFD * visionRange;
      const newFoodDistWorld  = inputs[13] * visionRange;
      const prevAttackerDistWorld = prevAD * visionRange;
      const newAttackerDistWorld  = inputs[14] * visionRange;

      // Track near-attacker state on cube for near-miss detection
      const wasNear = cube.wasNearAttacker;
      cube.wasNearAttacker = newAttackerDistWorld < 3;

      // Near-miss: was within 3 units, now outside — bonus reward
      if (wasNear && !cube.wasNearAttacker) {
        cube.addReward(RewardSystem.calcNearMissDodgeReward(prevAttackerDistWorld, newAttackerDistWorld));
      }

      const tickReward = RewardSystem.calcTickReward({
        prevFoodDist: prevFoodDistWorld,
        newFoodDist:  newFoodDistWorld,
        visionRange,
        prevAttackerDist: prevAttackerDistWorld,
        newAttackerDist:  newAttackerDistWorld,
        dangerRadius: visionRange * 0.4,
        nearbyAllyCount: Math.max(0, nearbyAllies),
        era: this.eraManager.currentEra,
        energy: cube.energy,
        maxEnergy: cube.maxEnergy,
        isDefending: cube.isDefending,
        isInShelter,
        prevAttackerAngle: prevAA,
        newAttackerAngle:  newAtkAngle,
        attackerDist: newAttackerDistWorld,
      });
      cube.addReward(tickReward);

      // Wall bounce penalty — cube hit a boundary this tick (teach pre-emptive turning)
      if (cube.wallBouncedThisTick) {
        cube.addReward(CONFIG.REWARD_WALL_BOUNCE);
      }

      // All rewards for this tick applied — now commit to RL and update weights
      cube.finalizeTickRewards();

      // Death check
      if (cube.isDead()) {
        deadCubeIds.push(cube.id);
        continue;
      }

      // Duplication check
      if (cube.canDuplicate(this.entityManager.cubes.size)) {
        const spawnOffset = new THREE.Vector3(
          Math.sin(cube.direction + Math.PI / 2) * cube.size * 2,
          0,
          Math.cos(cube.direction + Math.PI / 2) * cube.size * 2
        );
        const spawnPos = cube.position.clone().add(spawnOffset);
        // Clamp spawn position to world
        const half = CONFIG.WORLD_SIZE / 2 - 2;
        spawnPos.x = clamp(spawnPos.x, -half, half);
        spawnPos.z = clamp(spawnPos.z, -half, half);

        const offspring = cube.duplicate(
          -1, // temp id — EntityManager assigns real id
          spawnPos,
          this.scene,
          this.hallOfFame,
          this.rng
        );
        // Re-assign with proper ID
        const newId = (this.entityManager as unknown as { nextId: number }).nextId || 0;
        newCubes.push(offspring);
        this.totalDuplications++;
      }
    }

    // Add new cubes via EntityManager (proper ID)
    for (const offspring of newCubes) {
      // offspring was constructed with temp id -1; spawn properly
      const parent = this.entityManager.cubes.get(offspring.lineage[0] ?? -1);
      if (parent) {
        // offspring was already created in cube.duplicate() — add to manager
        const id = offspring.id;
        if (id === -1) {
          // Respawn correctly
          const c = this.entityManager.spawnCube(offspring.position, parent, this.hallOfFame, this.rng);
          this.lineageTracker.addCube(c.id, parent.id);
          if (c.generation > this.maxGenerationReached) this.maxGenerationReached = c.generation;
        } else {
          this.entityManager.cubes.set(id, offspring);
          this.entityManager.spatialHashCubes.insert(id, offspring.position.x, offspring.position.z);
          this.lineageTracker.addCube(id, parent.id);
          if (offspring.generation > this.maxGenerationReached) this.maxGenerationReached = offspring.generation;
        }
        // Dispose the temp offspring mesh (it was added in constructor)
        if (offspring.id === -1) offspring.dispose();
      }
    }

    // Handle dead cubes
    for (const id of deadCubeIds) {
      const cube = this.entityManager.cubes.get(id);
      if (!cube) continue;
      cube.applyDeathPenalty();
      // Add to Hall of Fame
      const genome = cube.extractCurrentGenome();
      this.hallOfFame.add(genome);
      if (cube.age > this.bestSurvivalTime) this.bestSurvivalTime = cube.age;
      this.totalDeaths++;

      // Intelligence tracking — fitness-per-tick measures quality of survival, not just duration
      if (cube.age > 0) {
        // Use food-per-tick as the intelligence signal — this is 0 for a cube that never
        // eats and climbs as the brain learns to find food. fitness/age is dominated by
        // the survival component (0.4/tick always), making it useless as an indicator.
        const foodPerTick = cube.foodEaten / cube.age;
        // Shift windows when current fills up
        if (this.intelligenceWindow.length >= this.INTELLIGENCE_WINDOW_SIZE) {
          this.intelligencePrevWindow = this.intelligenceWindow.slice();
          this.intelligenceWindow = [];
        }
        this.intelligenceWindow.push(foodPerTick);
        // Recompute index and trend
        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const current = avg(this.intelligenceWindow);
        // Scale to 0-100: 0.1 food/tick = 100 (e.g. eating once every 10 ticks = excellent)
        this.intelligenceIndex = Math.min(100, current * 1000);
        if (this.intelligencePrevWindow.length >= this.INTELLIGENCE_WINDOW_SIZE) {
          const prev = avg(this.intelligencePrevWindow);
          const delta = current - prev;
          this.intelligenceTrend = delta > prev * 0.05 ? 'rising'
            : delta < -prev * 0.05 ? 'falling'
            : 'stable';
        }
      }
      this.prevFoodDist.delete(id);
      this.prevAttackerDist.delete(id);
      this.prevAttackerAngle.delete(id);
      this.entityManager.removeCube(id);
    }

    // 4. Update attackers
    const attackers = this.entityManager.getAliveAttackers();
    const deadAttackerIds: number[] = [];
    const attackerKills: Map<number, number> = new Map();

    for (const attacker of attackers) {
      const nearestCube = this.entityManager.getNearestCube(attacker.position, CONFIG.CUBE_VISION_RANGE * 2, -1);
      const nearestStructurePos = attacker.type === 'siege'
        ? this.entityManager.getNearestStructureForAttacker(attacker.position)?.position
        : undefined;

      let packMates: Attacker[] = [];
      if (attacker.packId !== null) {
        packMates = this.entityManager.getPackMembers(attacker.packId);
      } else if (attacker.type === 'swarm') {
        packMates = this.entityManager.getAttackersOfType('swarm');
      }

      // Approach-to-cube reward shaping (before move so we compare old vs new position)
      const prevCubeDist = this.attackerPrevCubeDist.get(attacker.id) ?? Infinity;

      attacker.update(
        deltaTime,
        nearestCube ? { pos: nearestCube.position, vel: nearestCube.velocity } : undefined,
        packMates,
        nearestStructurePos,
        this.effectiveWorldSize
      );

      // Track new distance for next tick and reward closing the gap
      if (nearestCube && attacker.brain) {
        const newCubeDist = distance2D(attacker.position.x, attacker.position.z, nearestCube.position.x, nearestCube.position.z);
        this.attackerPrevCubeDist.set(attacker.id, newCubeDist);
        if (newCubeDist < prevCubeDist) {
          attacker.addReward(CONFIG.ATTACKER_REWARD_APPROACH_CUBE);
        }
      }

      // Collision with cubes
      const nearbyCubes = this.entityManager.getCubesInRadius(attacker.position, 3);
      for (const cube of nearbyCubes) {
        if (PhysicsSystem.checkCubeAttackerCollision(cube, attacker)) {
          // Shelter protection
          const structures = this.entityManager.getStructures();
          const inShelter = PhysicsSystem.isInsideShelter(cube.position, structures);
          const dmgMult = inShelter ? CONFIG.STRUCTURE_SHELTER_DAMAGE_REDUCTION : 1.0;
          cube.takeDamage(attacker.damage * dmgMult);

          // Attacker reward for landing a hit
          attacker.addReward(CONFIG.ATTACKER_REWARD_HIT);
          if (cube.isDead()) {
            // Bonus for securing the kill
            attacker.addReward(CONFIG.ATTACKER_REWARD_KILL);
            attacker.killCount++;
            attackerKills.set(attacker.id, (attackerKills.get(attacker.id) ?? 0) + 1);
          }

          // Shared damage in Era 4+
          if (this.eraManager.currentEra >= 3) {
            const clusterMates = this.entityManager.getCubesInRadius(cube.position, CONFIG.DAMAGE_SHARE_RADIUS);
            if (clusterMates.length >= CONFIG.DAMAGE_SHARE_MIN_CUBES) {
              const sharedDmg = (attacker.damage * 0.5 * dmgMult) / clusterMates.length;
              for (const mate of clusterMates) {
                if (mate.id !== cube.id) mate.takeDamage(sharedDmg);
              }
            }
          }
        }
      }

      // Collision with structures (siege)
      if (attacker.type === 'siege') {
        const nearestStructure = this.entityManager.getNearestStructureForAttacker(attacker.position);
        if (nearestStructure) {
          const dist = distance2D(attacker.position.x, attacker.position.z, nearestStructure.position.x, nearestStructure.position.z);
          if (dist < 2.5) {
            const waveConfig = CONFIG.ATTACKER_WAVES.siege as { structureDamage: number };
            const destroyed = nearestStructure.takeDamage(waveConfig.structureDamage * deltaTime * 60);
            if (destroyed) {
              this.entityManager.removeStructure(nearestStructure.id);
            }
          }
        }
      }

      // Phase 2 — evolved attackers eat food to survive
      if (attacker.hasEnergySystem) {
        const nearFood = this.entityManager.getNearestFood(attacker.position, CONFIG.ATTACKER_FOOD_EAT_RANGE);
        if (nearFood && !nearFood.isEaten) {
          attacker.eatFood(nearFood.value);
          nearFood.eat();
          this.entityManager.removeFood(nearFood.id);
        }
      }

      // Commit RL tick for predators (swarm is handled in updateSharedSwarmBrain below)
      if (attacker.type === 'predator') {
        attacker.finalizeTickRewards();
      }

      if (attacker.isDead()) {
        deadAttackerIds.push(attacker.id);
        this.totalKills++;
      }
    }

    // Handle dead attackers
    for (const id of deadAttackerIds) {
      const attacker = this.entityManager.attackers.get(id);
      if (attacker) {
        const kills = attackerKills.get(id) ?? 0;
        this.attackerEvolution.onAttackerDeath(attacker, kills);
        this.entityManager.removeAttacker(id);
        this.attackerPrevCubeDist.delete(id);
      }
    }

    // 4b. Hero attack — cubes can kill attackers at ANY era using output[3]
    // (was previously locked to faction war; now always active so cubes can fight back)
    for (const cube of this.entityManager.getAliveCubes()) {
      if (!cube.wantsAttackThisTick) continue;
      const range = cube.isAirborne
        ? CONFIG.HERO_ATTACK_RANGE * CONFIG.CUBE_JUMP_ATTACK_RANGE_BONUS
        : CONFIG.HERO_ATTACK_RANGE;
      for (const atk of this.entityManager.getAttackersInRadius(cube.position, range)) {
        atk.hp = Math.max(0, atk.hp - CONFIG.HERO_ATTACK_DAMAGE);
        cube.damageDealt += CONFIG.HERO_ATTACK_DAMAGE;
        cube.addReward(CONFIG.REWARD_KILL_ENEMY_UNIT * (atk.isDead() ? 1 : 0.1));
        // Register as kill for attacker evolution tracking
        if (atk.isDead()) {
          attackerKills.set(atk.id, (attackerKills.get(atk.id) ?? 0) + 1);
          this.totalKills++;
          this.entityManager.removeAttacker(atk.id);
          this.attackerPrevCubeDist.delete(atk.id);
        }
      }
    }

    // Update swarm brain — RL aggregation + periodic evolution
    // Run any time swarm units exist, not just Era 6, so the brain warms up before deployment
    const swarm = this.entityManager.getAttackersOfType('swarm');
    if (swarm.length > 0) {
      const swarmKills = swarm.reduce((sum, u) => sum + (attackerKills.get(u.id) ?? 0), 0);
      this.attackerEvolution.updateSharedSwarmBrain(swarm, swarmKills);
    }

    // 5. Food spawning
    this.foodSpawner.update(deltaTime, this.entityManager, this.rng, this.eraManager.currentEra, this.effectiveWorldSize);

    // 5b. Faction war — hero attack, base damage, win condition
    if (this.factionWarActive) {
      this._updateFactionWar();
    }

    // 5c. Update bases (ring rotation, pulses)
    this.heroBase?.update(this.worldAge);
    this.enemyBase?.update(this.worldAge);

    // 6. Attacker spawning
    this.spawnAttackers(deltaTime);

    // 7. Era transition check
    this.civScore = this._calculateCivScore();
    this.eraManager.checkEraTransition(this.civScore, this.worldAge);

    // 8. Settlements update (every 120 ticks)
    this.settlementUpdateTick++;
    if (this.settlementUpdateTick >= 120) {
      this.settlementUpdateTick = 0;
      this.settlements = this.civTracker.detectSettlements(this.entityManager.getStructures());
    }

    // 9. Stats history (every 60 ticks)
    this.statsHistoryTick++;
    if (this.statsHistoryTick >= 60) {
      this.statsHistoryTick = 0;
      this._recordStats();
    }

    // 10. Respawn if all cubes dead
    if (this.entityManager.cubes.size === 0) {
      this._respawnFromHallOfFame();
    }
  }

  // ──────────────────────────────────────────────
  // SENSOR INPUT GATHERING
  // ──────────────────────────────────────────────

  gatherSensorInputs(cube: Cube): Float32Array {
    // ── 16-input sector-based "eyes" ──────────────────────────────
    // Index  Signal
    //  0     frontFoodDist   nearest food within ±60° front cone
    //  1     leftFoodDist    nearest food in left 60°–180° arc
    //  2     rightFoodDist   nearest food in right 60°–180° arc
    //  3     frontAtkDist    nearest attacker within ±60° front
    //  4     leftAtkDist
    //  5     rightAtkDist
    //  6     energy          0–1
    //  7     age             0–1
    //  8     allyDensity     0–1 allies within ALLY_NEAR_RADIUS
    //  9     frontAllyDist   nearest ally in front cone (Era 3+)
    // 10     wallFront       0=wall ahead, 1=clear (forward raycast)
    // 11     wallLeft        0=wall left, 1=clear (90° left raycast)
    // 12     wallRight       0=wall right, 1=clear (90° right raycast)
    // 13     nearestFoodAbs  absolute nearest food regardless of facing
    // 14     nearestAtkAbs   absolute nearest attacker regardless of facing
    // 15     bias            1.0
    const inputs = new Float32Array(16);
    const visionRange = this.eraManager.getVisionRange();
    const half = CONFIG.WORLD_SIZE / 2;

    // ±60° front cone in relativeAngle units (relativeAngle returns [-1,1] = [-π,π])
    const FRONT = 1 / 3;

    // Wall raycast helper
    const wallRay = (dir: number): number => {
      const fx = Math.sin(dir), fz = Math.cos(dir);
      let t = visionRange;
      if (Math.abs(fx) > 0.0001) {
        const tx = fx > 0 ? (half - cube.position.x) / fx : (-half - cube.position.x) / fx;
        if (tx > 0) t = Math.min(t, tx);
      }
      if (Math.abs(fz) > 0.0001) {
        const tz = fz > 0 ? (half - cube.position.z) / fz : (-half - cube.position.z) / fz;
        if (tz > 0) t = Math.min(t, tz);
      }
      return clamp(t / visionRange, 0, 1);
    };

    // ── Food sectors ──
    let fFront = 1.0, fLeft = 1.0, fRight = 1.0, fAbs = 1.0;
    for (const id of this.entityManager.spatialHashFood.getNearby(cube.position.x, cube.position.z, visionRange)) {
      const food = this.entityManager.foods.get(id);
      if (!food || food.isEaten) continue;
      const d = distance2D(cube.position.x, cube.position.z, food.position.x, food.position.z);
      if (d > visionRange) continue;
      const nd = normalizeDistance(d, visionRange);
      fAbs = Math.min(fAbs, nd);
      const ang = relativeAngle(cube.direction, directionTo(cube.position.x, cube.position.z, food.position.x, food.position.z));
      if (Math.abs(ang) <= FRONT) fFront = Math.min(fFront, nd);
      else if (ang > 0) fRight = Math.min(fRight, nd);
      else fLeft = Math.min(fLeft, nd);
    }
    inputs[0] = fFront;
    inputs[1] = fLeft;
    inputs[2] = fRight;

    // ── Attacker sectors ──
    let aFront = 1.0, aLeft = 1.0, aRight = 1.0, aAbs = 1.0;
    for (const id of this.entityManager.spatialHashAttackers.getNearby(cube.position.x, cube.position.z, visionRange)) {
      const atk = this.entityManager.attackers.get(id);
      if (!atk || atk.isDead()) continue;
      const d = distance2D(cube.position.x, cube.position.z, atk.position.x, atk.position.z);
      if (d > visionRange) continue;
      const nd = normalizeDistance(d, visionRange);
      aAbs = Math.min(aAbs, nd);
      const ang = relativeAngle(cube.direction, directionTo(cube.position.x, cube.position.z, atk.position.x, atk.position.z));
      if (Math.abs(ang) <= FRONT) aFront = Math.min(aFront, nd);
      else if (ang > 0) aRight = Math.min(aRight, nd);
      else aLeft = Math.min(aLeft, nd);
    }
    inputs[3] = aFront;
    inputs[4] = aLeft;
    inputs[5] = aRight;

    // ── Energy & age ──
    inputs[6] = clamp(cube.energy / cube.maxEnergy, 0, 1);
    inputs[7] = clamp(cube.age / cube.maxAge, 0, 1);

    // ── Ally density ──
    const localAllies = this.entityManager.getCubesInRadius(cube.position, CONFIG.ALLY_NEAR_RADIUS);
    inputs[8] = clamp((localAllies.length - 1) / 10, 0, 1);

    // ── Nearest ally in front cone (Era 3+) ──
    let allyFront = 1.0;
    if (this.eraManager.currentEra >= 3) {
      for (const id of this.entityManager.spatialHashCubes.getNearbyExcluding(cube.position.x, cube.position.z, visionRange, cube.id)) {
        const ally = this.entityManager.cubes.get(id);
        if (!ally) continue;
        const d = distance2D(cube.position.x, cube.position.z, ally.position.x, ally.position.z);
        if (d > visionRange) continue;
        const nd = normalizeDistance(d, visionRange);
        const ang = relativeAngle(cube.direction, directionTo(cube.position.x, cube.position.z, ally.position.x, ally.position.z));
        if (Math.abs(ang) <= FRONT) allyFront = Math.min(allyFront, nd);
      }
    }
    inputs[9] = allyFront;

    // ── Wall raycasts: front, 90° left, 90° right ──
    inputs[10] = wallRay(cube.direction);
    inputs[11] = wallRay(cube.direction - Math.PI / 2);
    inputs[12] = wallRay(cube.direction + Math.PI / 2);

    // ── Absolute nearest (urgency, any direction) ──
    inputs[13] = fAbs;
    inputs[14] = aAbs;

    // ── Bias ──
    inputs[15] = 1.0;

    return inputs;
  }

  // ──────────────────────────────────────────────
  // CIV SCORE
  // ──────────────────────────────────────────────

  private _calculateCivScore(): number {
    const cubes = this.entityManager.getAliveCubes();
    const avgSurvivalTime = cubes.length > 0
      ? cubes.reduce((s, c) => s + c.age, 0) / cubes.length
      : 0;

    return this.civTracker.calculateCivScore(
      cubes.length,
      this.totalFoodEaten,
      this.maxGenerationReached,
      this.entityManager.structures.size,
      avgSurvivalTime,
      this.totalDuplications
    );
  }

  // ──────────────────────────────────────────────
  // ATTACKER SPAWNING
  // ──────────────────────────────────────────────

  // ──────────────────────────────────────────────
  // FACTION WAR
  // ──────────────────────────────────────────────

  private _updateFactionWar(): void {
    if (this.warResult) return;

    const cubes     = this.entityManager.getAliveCubes();
    const attackers = this.entityManager.getAliveAttackers();

    // ── Hero base: protection zone + ranged damage from attackers ──
    if (this.heroBase && !this.heroBase.isDestroyed) {
      for (const atk of attackers) {
        const d = distance2D(atk.position.x, atk.position.z, this.heroBase.position.x, this.heroBase.position.z);
        // Outer damage ring — attackers deal damage while staying outside protection zone
        if (d < CONFIG.BASE_DAMAGE_RADIUS) {
          this.heroBase.takeDamage(atk.damage * 0.015);
        }
        // Protection zone — wrong faction takes damage per tick (lethal in ~1s)
        if (d < CONFIG.BASE_PROTECTION_RADIUS) {
          atk.hp = Math.max(0, atk.hp - CONFIG.BASE_ZONE_DAMAGE_PER_TICK);
        }
      }
    }

    // ── Enemy base: protection zone + ranged attack from hero cubes ──
    if (this.enemyBase && !this.enemyBase.isDestroyed) {
      for (const cube of cubes) {
        const d = distance2D(cube.position.x, cube.position.z, this.enemyBase.position.x, this.enemyBase.position.z);
        // Outer damage ring — attack output deals damage to base from safe range
        if (cube.wantsAttackThisTick && d < CONFIG.BASE_DAMAGE_RADIUS) {
          this.enemyBase.takeDamage(CONFIG.HERO_ATTACK_DAMAGE * 0.6);
          cube.addReward(CONFIG.REWARD_DAMAGE_ENEMY_BASE);
        }
        // Protection zone — wrong faction takes damage per tick (lethal in ~1s)
        if (d < CONFIG.BASE_PROTECTION_RADIUS) {
          cube.takeDamage(CONFIG.BASE_ZONE_DAMAGE_PER_TICK);
        }
      }
    }

    // (hero attack vs units now handled in step 4b above — runs at all eras)

    // ── Near own base reward ──
    if (this.heroBase) {
      for (const cube of cubes) {
        const d = distance2D(cube.position.x, cube.position.z, this.heroBase.position.x, this.heroBase.position.z);
        if (d < CONFIG.BASE_DAMAGE_RADIUS + 8) cube.addReward(CONFIG.REWARD_NEAR_OWN_BASE);
      }
    }

    // ── Midfield reward: cubes in contested zone ──
    const midRadius = this.effectiveWorldSize * 0.25;
    for (const cube of cubes) {
      if (distance2D(cube.position.x, cube.position.z, 0, 0) < midRadius) {
        cube.addReward(CONFIG.REWARD_HOLD_MIDFIELD);
      }
    }

    // ── Win condition check ──
    if (this.enemyBase?.isDestroyed && !this.warResult) {
      this.warResult = 'hero';
      this.newEraCallback?.(-2);
    }
    if (this.heroBase?.isDestroyed && !this.warResult) {
      this.warResult = 'enemy';
      this.newEraCallback?.(-3);
    }
  }

  // ──────────────────────────────────────────────
  // ERA 7 INITIALIZATION
  // Flood food + spawn evolved cubes near hero base.
  // ──────────────────────────────────────────────

  private _initEra7(): void {
    // Flood the expanded world with food
    for (let i = 0; i < CONFIG.ERA7_FOOD_FLOOD; i++) {
      const p = randomPositionInWorld(this.effectiveWorldSize, this.rng);
      const value = Math.floor(CONFIG.FOOD_VALUE_MIN + this.rng() * (CONFIG.FOOD_VALUE_MAX - CONFIG.FOOD_VALUE_MIN));
      this.entityManager.spawnFood(new THREE.Vector3(p.x, 0, p.z), value);
    }

    // Spawn evolved cubes near the hero base using Hall of Fame genomes
    if (this.heroBase) {
      const hPos = this.heroBase.position;
      const maxNew = Math.min(
        CONFIG.ERA7_CUBE_SPAWN_COUNT,
        CONFIG.MAX_CUBES - this.entityManager.cubes.size
      );
      for (let i = 0; i < maxNew; i++) {
        const angle = (i / maxNew) * Math.PI * 2;
        const r = 18 + this.rng() * 8; // ring 18–26 units from base
        const pos = new THREE.Vector3(
          hPos.x + Math.cos(angle) * r,
          0,
          hPos.z + Math.sin(angle) * r
        );
        const cube = this.entityManager.spawnCube(pos, undefined, this.hallOfFame, this.rng);
        cube.energy = cube.maxEnergy; // start with full energy
        this.lineageTracker.addCube(cube.id, 0);
        // Load best known genome so they start with evolved behaviour
        const best = this.hallOfFame.getBestGenome();
        if (best) cube.brain.setWeights(new Float32Array(best.weights));
        if (cube.generation > this.maxGenerationReached) this.maxGenerationReached = cube.generation;
      }
    }
  }

  private spawnAttackers(deltaTime: number): void {
    const activeWaves = this.eraManager.getActiveAttackerWaves();

    for (const waveName of activeWaves) {
      const type = waveName as AttackerWaveType;
      const waveCfg = CONFIG.ATTACKER_WAVES[type] as {
        spawnInterval: number;
        maxAlive: number;
        packSize: number;
        packSizeMax?: number;
      };

      this.attackerSpawnTimers[type] = (this.attackerSpawnTimers[type] ?? 0) + deltaTime * 60;

      if (this.attackerSpawnTimers[type] < waveCfg.spawnInterval) continue;
      this.attackerSpawnTimers[type] -= waveCfg.spawnInterval;

      const currentCount = this.entityManager.getAttackersOfType(type).length;
      if (currentCount >= waveCfg.maxAlive) continue;

      const spawnCount = waveCfg.packSizeMax
        ? Math.floor(waveCfg.packSize + this.rng() * ((waveCfg.packSizeMax ?? waveCfg.packSize) - waveCfg.packSize + 1))
        : waveCfg.packSize;

      const packId = type === 'pack' || type === 'swarm' ? this.worldAge : null;

      for (let i = 0; i < spawnCount; i++) {
        if (this.entityManager.attackers.size >= waveCfg.maxAlive + currentCount) break;

        // During faction war: reserves emerge from the enemy base
        // Before faction war: spawn from world edges as before
        let spawnPos: THREE.Vector3;
        if (this.factionWarActive && this.enemyBase && !this.enemyBase.isDestroyed) {
          const angle = this.rng() * Math.PI * 2;
          const r = CONFIG.BASE_RESERVE_SPAWN_RADIUS * (0.7 + this.rng() * 0.5);
          spawnPos = new THREE.Vector3(
            this.enemyBase.position.x + Math.cos(angle) * r,
            0,
            this.enemyBase.position.z + Math.sin(angle) * r
          );
        } else {
          spawnPos = this.entityManager.randomEdgePosition(this.rng);
        }

        let brain = undefined;
        if (type === 'predator') {
          brain = this.attackerEvolution.createPredatorBrain(this.rng);
        }

        this.entityManager.spawnAttacker(type, spawnPos, packId, brain);
      }
    }
  }

  // ──────────────────────────────────────────────
  // RESPAWN FROM HALL OF FAME
  // ──────────────────────────────────────────────

  private _respawnFromHallOfFame(): void {
    const p = randomPositionInWorld(CONFIG.WORLD_SIZE, this.rng);
    const pos = new THREE.Vector3(p.x, 0, p.z);
    const cube = this.entityManager.spawnCube(pos, undefined, this.hallOfFame, this.rng);
    this.lineageTracker.addCube(cube.id, 0);

    // Load best genome into cube if available
    const bestGenome = this.hallOfFame.getBestGenome();
    if (bestGenome) {
      cube.brain.setWeights(new Float32Array(bestGenome.weights));
    }
  }

  // ──────────────────────────────────────────────
  // STATS HISTORY
  // ──────────────────────────────────────────────

  private _recordStats(): void {
    const maxLen = CONFIG.STATS_HISTORY_LENGTH;
    const push = <T>(arr: T[], val: T) => {
      arr.push(val);
      if (arr.length > maxLen) arr.shift();
    };

    const cubes = this.entityManager.getAliveCubes();
    const avgFitness = cubes.length > 0
      ? cubes.reduce((s, c) => s + c.fitness, 0) / cubes.length
      : 0;

    push(this.statsHistory.population, cubes.length);
    push(this.statsHistory.avgFitness, avgFitness);
    push(this.statsHistory.foodSupply, this.entityManager.foods.size);
    push(this.statsHistory.killDeathRatio,
      this.totalDeaths > 0 ? this.totalKills / this.totalDeaths : 0
    );
  }

  // ──────────────────────────────────────────────
  // HUD STATS EXPORT
  // ──────────────────────────────────────────────

  getWorldStats(): WorldStats {
    const cubes = this.entityManager.getAliveCubes();
    const maxGen = cubes.length > 0
      ? Math.max(...cubes.map(c => c.generation))
      : this.maxGenerationReached;

    const activeWaves = this.eraManager.getActiveAttackerWaves();
    const activeWave = activeWaves[activeWaves.length - 1] ?? 'none';

    return {
      worldAge: this.worldAge,
      population: cubes.length,
      maxPopulation: CONFIG.MAX_CUBES,
      generation: Math.max(maxGen, this.maxGenerationReached),
      foodCount: this.entityManager.foods.size,
      maxFood: CONFIG.FOOD_MAX,
      structureCount: this.entityManager.structures.size,
      attackerCount: this.entityManager.attackers.size,
      currentEra: this.eraManager.currentEra,
      eraName: this.eraManager.getEraName(),
      civScore: Math.floor(this.civScore),
      bestSurvivalTime: this.bestSurvivalTime,
      activeWave,
      totalDeaths: this.totalDeaths,
      totalDuplications: this.totalDuplications,
      totalFoodEaten: this.totalFoodEaten,
      // Intelligence metrics
      intelligenceIndex: this.intelligenceIndex,
      intelligenceTrend: this.intelligenceTrend,
      avgDecisionConfidence: cubes.length > 0
        ? cubes.reduce((s, c) => s + c.decisionConfidence, 0) / cubes.length
        : 0,
    };
  }

  getSettlements(): Settlement[] {
    return this.settlements;
  }

  getEraManager(): EraManager {
    return this.eraManager;
  }
}
