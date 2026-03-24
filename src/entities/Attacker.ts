// ============================================================
// CUBE GENESIS — Attacker Entity
// Six wave types with escalating intelligence.
// ============================================================

import * as THREE from 'three';
import { CONFIG, AttackerWaveType } from '../config.ts';
import { NeuralNetwork } from '../brain/NeuralNetwork.ts';
import { ReinforcementLearner } from '../brain/ReinforcementLearner.ts';
import { attackerColor } from '../utils/color.ts';
import { normalizeAngle, directionTo, relativeAngle, distance2D } from '../utils/math.ts';

const WAVE_INDEX: Record<AttackerWaveType, number> = {
  drifter: 0,
  seeker: 1,
  pack: 2,
  predator: 3,
  siege: 4,
  swarm: 5,
};

// ──────────────────────────────────────────────
// GEOMETRY / MATERIAL CACHES (shared per type)
// ──────────────────────────────────────────────

const _geoCache: Partial<Record<AttackerWaveType, THREE.BufferGeometry>> = {};
const _matCache: Partial<Record<AttackerWaveType, THREE.MeshLambertMaterial>> = {};

function getGeometry(type: AttackerWaveType): THREE.BufferGeometry {
  if (_geoCache[type]) return _geoCache[type]!;
  const siegeSize = CONFIG.ATTACKER_WAVES.siege.sizeMultiplier;
  switch (type) {
    case 'drifter':
      _geoCache[type] = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      break;
    case 'seeker':
      _geoCache[type] = new THREE.OctahedronGeometry(0.5);
      break;
    case 'pack':
      _geoCache[type] = new THREE.TetrahedronGeometry(0.5);
      break;
    case 'predator':
      _geoCache[type] = new THREE.IcosahedronGeometry(0.5, 0);
      break;
    case 'siege':
      _geoCache[type] = new THREE.BoxGeometry(siegeSize, siegeSize, siegeSize);
      break;
    case 'swarm':
      _geoCache[type] = new THREE.OctahedronGeometry(0.18);
      break;
  }
  return _geoCache[type]!;
}

function getMaterial(type: AttackerWaveType): THREE.MeshLambertMaterial {
  if (_matCache[type]) return _matCache[type]!;
  const waveIdx = WAVE_INDEX[type];
  const color = attackerColor(waveIdx);
  const emissive = color.clone().multiplyScalar(0.3);
  _matCache[type] = new THREE.MeshLambertMaterial({ color, emissive });
  return _matCache[type]!;
}

// Shared swarm brain (hive mind)
let _sharedSwarmBrain: NeuralNetwork | null = null;
export function getSharedSwarmBrain(): NeuralNetwork {
  if (!_sharedSwarmBrain) {
    _sharedSwarmBrain = new NeuralNetwork([6, 8, 3]);
    _sharedSwarmBrain.randomize(Math.random);
  }
  return _sharedSwarmBrain;
}

// ──────────────────────────────────────────────
// ATTACKER CLASS
// ──────────────────────────────────────────────

export class Attacker {
  id: number;
  type: AttackerWaveType;
  position: THREE.Vector3;
  direction: number;   // facing angle in radians (XZ plane)
  hp: number;
  speed: number;
  damage: number;
  packId: number | null;
  brain: NeuralNetwork | null;
  factionId: number = CONFIG.FACTION_ENEMY;  // all attackers are enemy faction
  private _worldSize: number = CONFIG.WORLD_SIZE; // updated each tick by World.ts

  // RL (predators only — swarm RL is aggregated by AttackerEvolution)
  rl: ReinforcementLearner | null;
  killCount: number = 0;
  recentRewardRate: number = 0;
  tickRewardAccumulator: number = 0; // used by swarm aggregation

  // Phase 2 — energy system (pack hunters and above)
  energy: number;
  maxEnergy: number;
  readonly hasEnergySystem: boolean;

  mesh: THREE.Mesh;
  private light: THREE.PointLight | null = null;
  private scene: THREE.Scene;

  // Internal AI state
  private ticksAlive: number = 0;
  private driftChangeTick: number = 0;
  private driftTarget: number = 0;
  private seekerRetargetTick: number = 0;
  private seekerTargetPos: THREE.Vector3 | null = null;

  // Velocity (XZ)
  velocity: { x: number; z: number } = { x: 0, z: 0 };

  constructor(
    id: number,
    type: AttackerWaveType,
    position: THREE.Vector3,
    packId: number | null,
    scene: THREE.Scene,
    brain?: NeuralNetwork
  ) {
    this.id = id;
    this.type = type;
    this.position = position.clone();
    this.direction = Math.random() * Math.PI * 2;
    this.packId = packId;
    this.scene = scene;

    const wave = CONFIG.ATTACKER_WAVES[type] as { speed: number; damage: number; hp: number; hasBrain: boolean };
    this.hp = wave.hp;
    this.speed = wave.speed;
    this.damage = wave.damage;

    // Energy system — pack hunters (wave index 2) and above need to eat food
    this.hasEnergySystem = WAVE_INDEX[type] >= CONFIG.ATTACKER_ENERGY_WAVE_MIN;
    this.maxEnergy = CONFIG.ATTACKER_ENERGY_MAX;
    this.energy = this.hasEnergySystem ? this.maxEnergy : Infinity;

    // Brain assignment
    if (type === 'predator') {
      this.brain = brain ?? (() => {
        const b = new NeuralNetwork([6, 8, 3]);
        b.randomize(Math.random);
        return b;
      })();
      // Individual RL — each predator learns independently within its lifetime
      this.rl = new ReinforcementLearner(CONFIG.ATTACKER_LEARNING_RATE, CONFIG.REWARD_WINDOW);
    } else if (type === 'swarm') {
      this.brain = getSharedSwarmBrain();
      // No per-unit RL — swarm brain is updated once per tick by AttackerEvolution
      this.rl = null;
    } else {
      this.brain = null;
      this.rl = null;
    }

    this.mesh = new THREE.Mesh(getGeometry(type), getMaterial(type));
    this.mesh.position.copy(position);
    this.mesh.position.y = type === 'siege' ? CONFIG.ATTACKER_WAVES.siege.sizeMultiplier / 2 : 0.5;

    // Swarm units: no point light (40 lights = WebGL crash) and hidden mesh
    // (SwarmInstancedMesh in AttackerRenderer handles their display)
    if (type !== 'swarm') {
      const waveIdx = WAVE_INDEX[type];
      const lightColor = attackerColor(waveIdx);
      const lightRadius = type === 'siege' ? 15 : type === 'predator' ? 6 : 4;
      this.light = new THREE.PointLight(lightColor.getHex(), 0.8, lightRadius);
      this.mesh.add(this.light);
      scene.add(this.mesh);
    } else {
      // Swarm mesh added to scene but immediately hidden — InstancedMesh renders them
      this.mesh.visible = false;
      scene.add(this.mesh);
    }
  }

  // ──────────────────────────────────────────────
  // UPDATE — AI per type
  // ──────────────────────────────────────────────

  update(
    deltaTime: number,
    nearestCube?: { pos: THREE.Vector3; vel: { x: number; z: number } },
    packMates?: Attacker[],
    nearestStructurePos?: THREE.Vector3,
    worldSize: number = CONFIG.WORLD_SIZE
  ): void {
    if (this.hp <= 0) return;
    this._worldSize = worldSize;
    this.ticksAlive++;

    // Energy drain — pack hunters and above starve without food
    if (this.hasEnergySystem) {
      this.energy -= CONFIG.ATTACKER_ENERGY_DRAIN * deltaTime * 60;
      if (this.energy <= 0) {
        this.hp = 0; // starvation
        return;
      }
    }

    let dx = 0;
    let dz = 0;

    switch (this.type) {
      case 'drifter':
        [dx, dz] = this._updateDrifter();
        break;
      case 'seeker':
        [dx, dz] = this._updateSeeker(nearestCube);
        break;
      case 'pack':
        [dx, dz] = this._updatePack(nearestCube, packMates ?? []);
        break;
      case 'predator':
        [dx, dz] = this._updatePredator(nearestCube);
        break;
      case 'siege':
        [dx, dz] = this._updateSiege(nearestCube, nearestStructurePos);
        break;
      case 'swarm':
        [dx, dz] = this._updateSwarm(nearestCube, packMates ?? []);
        break;
    }

    // Apply movement
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) {
      dx = (dx / len) * this.speed * deltaTime * 60;
      dz = (dz / len) * this.speed * deltaTime * 60;
      this.direction = Math.atan2(dx, dz);
    }

    this.position.x += dx;
    this.position.z += dz;

    // Bounce off world boundaries
    const half = worldSize / 2 - 1;
    if (Math.abs(this.position.x) > half) {
      this.position.x = Math.sign(this.position.x) * half;
      this.direction = Math.PI - this.direction;
    }
    if (Math.abs(this.position.z) > half) {
      this.position.z = Math.sign(this.position.z) * half;
      this.direction = -this.direction;
    }

    // Update mesh
    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
    this.mesh.rotation.y = -this.direction;

    // Spin siege entities slowly
    if (this.type === 'siege') {
      this.mesh.rotation.x += 0.01;
    } else if (this.type === 'predator' || this.type === 'swarm') {
      this.mesh.rotation.x += 0.03;
      this.mesh.rotation.z += 0.02;
    } else {
      this.mesh.rotation.y += 0.04;
    }
  }

  // ──────────────────────────────────────────────
  // AI IMPLEMENTATIONS
  // ──────────────────────────────────────────────

  private _updateDrifter(): [number, number] {
    if (this.ticksAlive >= this.driftChangeTick) {
      this.driftChangeTick = this.ticksAlive + 100 + Math.floor(Math.random() * 100);
      this.driftTarget = Math.random() * Math.PI * 2;
    }
    // Gradually steer toward drift target
    const diff = normalizeAngle(this.driftTarget - this.direction);
    this.direction += diff * 0.05;
    return [Math.sin(this.direction), Math.cos(this.direction)];
  }

  private _updateSeeker(nearestCube?: { pos: THREE.Vector3 }): [number, number] {
    if (this.ticksAlive >= this.seekerRetargetTick || !this.seekerTargetPos) {
      this.seekerRetargetTick = this.ticksAlive + CONFIG.ATTACKER_WAVES.seeker.retargetInterval;
      this.seekerTargetPos = nearestCube?.pos.clone() ?? null;
    }
    if (!this.seekerTargetPos) return this._updateDrifter();
    const angle = directionTo(this.position.x, this.position.z, this.seekerTargetPos.x, this.seekerTargetPos.z);
    this.direction = normalizeAngle(angle);
    return [Math.sin(this.direction), Math.cos(this.direction)];
  }

  private _updatePack(nearestCube: { pos: THREE.Vector3 } | undefined, packMates: Attacker[]): [number, number] {
    // Boid rules
    let sepX = 0, sepZ = 0;
    let aliX = 0, aliZ = 0;
    let cohX = 0, cohZ = 0;
    let count = 0;

    for (const mate of packMates) {
      if (mate.id === this.id) continue;
      const dist = distance2D(this.position.x, this.position.z, mate.position.x, mate.position.z);
      if (dist < 4 && dist > 0.01) {
        // Separation
        sepX += (this.position.x - mate.position.x) / dist;
        sepZ += (this.position.z - mate.position.z) / dist;
      }
      // Alignment
      aliX += Math.sin(mate.direction);
      aliZ += Math.cos(mate.direction);
      // Cohesion
      cohX += mate.position.x;
      cohZ += mate.position.z;
      count++;
    }

    const cfg = CONFIG.ATTACKER_WAVES.pack as { separationWeight: number; alignmentWeight: number; cohesionWeight: number };
    let finalX = 0, finalZ = 0;
    if (count > 0) {
      cohX = cohX / count - this.position.x;
      cohZ = cohZ / count - this.position.z;
      finalX = sepX * cfg.separationWeight + aliX * cfg.alignmentWeight + cohX * cfg.cohesionWeight;
      finalZ = sepZ * cfg.separationWeight + aliZ * cfg.alignmentWeight + cohZ * cfg.cohesionWeight;
    }

    // Chase nearest cube
    if (nearestCube) {
      const angle = directionTo(this.position.x, this.position.z, nearestCube.pos.x, nearestCube.pos.z);
      finalX += Math.sin(angle) * 2;
      finalZ += Math.cos(angle) * 2;
    }

    if (Math.abs(finalX) < 0.001 && Math.abs(finalZ) < 0.001) return this._updateDrifter();
    return [finalX, finalZ];
  }

  private _updatePredator(nearestCube?: { pos: THREE.Vector3; vel: { x: number; z: number } }): [number, number] {
    if (!this.brain) return this._updateSeeker(nearestCube);

    const inputs = new Float32Array(6);
    if (nearestCube) {
      const dist = distance2D(this.position.x, this.position.z, nearestCube.pos.x, nearestCube.pos.z);
      inputs[0] = Math.min(dist / CONFIG.CUBE_VISION_RANGE, 1);
      inputs[1] = relativeAngle(this.direction, directionTo(this.position.x, this.position.z, nearestCube.pos.x, nearestCube.pos.z));
      inputs[2] = Math.max(-1, Math.min(1, nearestCube.vel.x / CONFIG.CUBE_BASE_SPEED));
      inputs[3] = Math.max(-1, Math.min(1, nearestCube.vel.z / CONFIG.CUBE_BASE_SPEED));
    } else {
      inputs[0] = 1;
    }
    inputs[4] = this.hp / CONFIG.ATTACKER_WAVES.predator.hp;
    const half = this._worldSize / 2;
    const wallDist = Math.min(
      Math.abs(this.position.x + half),
      Math.abs(half - this.position.x),
      Math.abs(this.position.z + half),
      Math.abs(half - this.position.z)
    );
    inputs[5] = Math.min(wallDist / half, 1);

    const out = this.brain.forward(inputs);
    const turnLeft = out[0];
    const turnRight = out[1];
    const moveForward = out[2];

    this.direction += (turnLeft - turnRight) * 0.1;
    this.direction = normalizeAngle(this.direction);

    const forward = Math.max(0, moveForward);
    return [Math.sin(this.direction) * forward, Math.cos(this.direction) * forward];
  }

  private _updateSiege(nearestCube: { pos: THREE.Vector3 } | undefined, nearestStructurePos?: THREE.Vector3): [number, number] {
    const target = nearestStructurePos ?? nearestCube?.pos;
    if (!target) return this._updateDrifter();
    const angle = directionTo(this.position.x, this.position.z, target.x, target.z);
    this.direction = normalizeAngle(angle);
    return [Math.sin(this.direction), Math.cos(this.direction)];
  }

  private _updateSwarm(nearestCube: { pos: THREE.Vector3 } | undefined, packMates: Attacker[]): [number, number] {
    // Use shared neural brain
    const inputs = new Float32Array(6);
    if (nearestCube) {
      const dist = distance2D(this.position.x, this.position.z, nearestCube.pos.x, nearestCube.pos.z);
      inputs[0] = Math.min(dist / CONFIG.CUBE_VISION_RANGE, 1);
      inputs[1] = relativeAngle(this.direction, directionTo(this.position.x, this.position.z, nearestCube.pos.x, nearestCube.pos.z));
    } else {
      inputs[0] = 1;
    }
    // Swarm density
    let nearCount = 0;
    for (const mate of packMates) {
      if (mate.id !== this.id && distance2D(this.position.x, this.position.z, mate.position.x, mate.position.z) < 5) nearCount++;
    }
    inputs[2] = Math.min(nearCount / 10, 1);
    inputs[3] = this.hp / CONFIG.ATTACKER_WAVES.swarm.hp;
    const half = this._worldSize / 2;
    const wallDist = Math.min(
      Math.abs(this.position.x + half),
      Math.abs(half - this.position.x),
      Math.abs(this.position.z + half),
      Math.abs(half - this.position.z)
    );
    inputs[4] = Math.min(wallDist / half, 1);
    inputs[5] = 1.0; // bias

    const out = this.brain!.forward(inputs);
    this.direction += (out[0] - out[1]) * 0.1;
    this.direction = normalizeAngle(this.direction);
    const forward = Math.max(0, out[2]);
    return [Math.sin(this.direction) * forward, Math.cos(this.direction) * forward];
  }

  // ──────────────────────────────────────────────
  // REINFORCEMENT LEARNING
  // ──────────────────────────────────────────────

  addReward(reward: number): void {
    if (this.rl) {
      // Predator: full RL pipeline
      this.rl.addReward(reward);
    } else {
      // Swarm: accumulate for batch update in AttackerEvolution
      this.tickRewardAccumulator += reward;
    }
  }

  /**
   * Commit this tick's rewards and apply RL weight update.
   * Call once per tick in World.update() — predators only.
   * Swarm RL is handled in AttackerEvolution.updateSharedSwarmBrain().
   */
  finalizeTickRewards(): void {
    if (!this.rl || !this.brain) return;
    this.rl.commitTickReward();
    this.rl.updateWeights(this.brain);
    this.recentRewardRate = this.rl.getAverageReward();
  }

  // ──────────────────────────────────────────────
  // DAMAGE & DEATH
  // ──────────────────────────────────────────────

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    return this.hp <= 0;
  }

  isDead(): boolean {
    return this.hp <= 0;
  }

  // ──────────────────────────────────────────────
  // ENERGY — food eating (Phase 2)
  // ──────────────────────────────────────────────

  eatFood(value: number): void {
    this.energy = Math.min(this.maxEnergy, this.energy + value);
  }

  // ──────────────────────────────────────────────
  // DISPOSE
  // ──────────────────────────────────────────────

  dispose(): void {
    if (this.light) this.mesh.remove(this.light);
    this.scene.remove(this.mesh);
  }
}
