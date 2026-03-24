// ============================================================
// CUBE GENESIS — EntityManager
// Lifecycle manager for all entities. Owns spawn / remove logic
// and provides fast spatial queries.
// ============================================================

import * as THREE from 'three';
import { CONFIG, AttackerWaveType, StructureType } from '../config.ts';
import { SpatialHash } from '../world/SpatialHash.ts';
import { Cube } from './Cube.ts';
import { Attacker } from './Attacker.ts';
import { Food } from './Food.ts';
import { Structure } from './Structure.ts';
import { HallOfFame } from '../brain/Evolution.ts';
import { NeuralNetwork } from '../brain/NeuralNetwork.ts';
import { distance2D, randomPositionInWorld, randomPositionNear } from '../utils/math.ts';

export class EntityManager {
  cubes: Map<number, Cube> = new Map();
  attackers: Map<number, Attacker> = new Map();
  foods: Map<number, Food> = new Map();
  structures: Map<number, Structure> = new Map();

  private nextId: number = 1;
  private scene: THREE.Scene;

  // Spatial hashes — one per entity type for isolated queries
  spatialHashCubes: SpatialHash;
  spatialHashFood: SpatialHash;
  spatialHashAttackers: SpatialHash;
  spatialHashStructures: SpatialHash;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.spatialHashCubes = new SpatialHash(CONFIG.GRID_CELL_SIZE);
    this.spatialHashFood = new SpatialHash(CONFIG.GRID_CELL_SIZE);
    this.spatialHashAttackers = new SpatialHash(CONFIG.GRID_CELL_SIZE);
    this.spatialHashStructures = new SpatialHash(CONFIG.GRID_CELL_SIZE);
  }

  // ──────────────────────────────────────────────
  // ID FACTORY
  // ──────────────────────────────────────────────

  private newId(): number {
    return this.nextId++;
  }

  // ──────────────────────────────────────────────
  // SPAWN
  // ──────────────────────────────────────────────

  spawnCube(
    position?: THREE.Vector3,
    parentCube?: Cube,
    hallOfFame?: HallOfFame,
    rng: () => number = Math.random
  ): Cube {
    const id = this.newId();
    const pos = position ?? (() => {
      const p = randomPositionInWorld(CONFIG.WORLD_SIZE, rng);
      return new THREE.Vector3(p.x, 0, p.z);
    })();

    const cube = new Cube(id, pos, this.scene, parentCube, hallOfFame, rng);
    this.cubes.set(id, cube);
    this.spatialHashCubes.insert(id, pos.x, pos.z);
    return cube;
  }

  spawnFood(position: THREE.Vector3, value: number): Food {
    const id = this.newId();
    const food = new Food(id, position, value, this.scene);
    this.foods.set(id, food);
    this.spatialHashFood.insert(id, position.x, position.z);
    return food;
  }

  spawnAttacker(
    type: AttackerWaveType,
    position: THREE.Vector3,
    packId: number | null = null,
    brain?: NeuralNetwork
  ): Attacker {
    const id = this.newId();
    const attacker = new Attacker(id, type, position, packId, this.scene, brain);
    this.attackers.set(id, attacker);
    this.spatialHashAttackers.insert(id, position.x, position.z);
    return attacker;
  }

  addStructure(
    type: StructureType,
    position: THREE.Vector3,
    builderId: number
  ): Structure | null {
    if (this.structures.size >= CONFIG.STRUCTURE_MAX) return null;
    const id = this.newId();
    const structure = new Structure(id, type, position, builderId, this.scene);
    this.structures.set(id, structure);
    this.spatialHashStructures.insert(id, position.x, position.z);
    return structure;
  }

  // ──────────────────────────────────────────────
  // REMOVE
  // ──────────────────────────────────────────────

  removeCube(id: number): void {
    const cube = this.cubes.get(id);
    if (!cube) return;
    cube.dispose();
    this.cubes.delete(id);
    this.spatialHashCubes.remove(id);
  }

  removeFood(id: number): void {
    const food = this.foods.get(id);
    if (!food) return;
    food.dispose();
    this.foods.delete(id);
    this.spatialHashFood.remove(id);
  }

  removeAttacker(id: number): void {
    const attacker = this.attackers.get(id);
    if (!attacker) return;
    attacker.dispose();
    this.attackers.delete(id);
    this.spatialHashAttackers.remove(id);
  }

  removeStructure(id: number): void {
    const structure = this.structures.get(id);
    if (!structure) return;
    structure.dispose();
    this.structures.delete(id);
    this.spatialHashStructures.remove(id);
  }

  // ──────────────────────────────────────────────
  // GETTERS
  // ──────────────────────────────────────────────

  getAliveCubes(): Cube[] {
    return Array.from(this.cubes.values());
  }

  getAliveAttackers(): Attacker[] {
    return Array.from(this.attackers.values());
  }

  getFoods(): Food[] {
    return Array.from(this.foods.values());
  }

  getStructures(): Structure[] {
    return Array.from(this.structures.values());
  }

  // ──────────────────────────────────────────────
  // SPATIAL QUERIES
  // ──────────────────────────────────────────────

  getNearestFood(pos: THREE.Vector3, range: number): Food | null {
    const candidates = this.spatialHashFood.getNearby(pos.x, pos.z, range);
    let nearest: Food | null = null;
    let nearestDist = Infinity;
    for (const id of candidates) {
      const food = this.foods.get(id);
      if (!food || food.isEaten) continue;
      const d = distance2D(pos.x, pos.z, food.position.x, food.position.z);
      if (d < nearestDist && d <= range) {
        nearestDist = d;
        nearest = food;
      }
    }
    return nearest;
  }

  getNearestAttacker(pos: THREE.Vector3, range: number): Attacker | null {
    const candidates = this.spatialHashAttackers.getNearby(pos.x, pos.z, range);
    let nearest: Attacker | null = null;
    let nearestDist = Infinity;
    for (const id of candidates) {
      const a = this.attackers.get(id);
      if (!a) continue;
      const d = distance2D(pos.x, pos.z, a.position.x, a.position.z);
      if (d < nearestDist && d <= range) {
        nearestDist = d;
        nearest = a;
      }
    }
    return nearest;
  }

  getNearestCube(pos: THREE.Vector3, range: number, excludeId: number): Cube | null {
    const candidates = this.spatialHashCubes.getNearbyExcluding(pos.x, pos.z, range, excludeId);
    let nearest: Cube | null = null;
    let nearestDist = Infinity;
    for (const id of candidates) {
      const c = this.cubes.get(id);
      if (!c) continue;
      const d = distance2D(pos.x, pos.z, c.position.x, c.position.z);
      if (d < nearestDist && d <= range) {
        nearestDist = d;
        nearest = c;
      }
    }
    return nearest;
  }

  getNearestStructure(pos: THREE.Vector3): Structure | null {
    const candidates = this.spatialHashStructures.getNearby(pos.x, pos.z, CONFIG.CUBE_VISION_RANGE);
    let nearest: Structure | null = null;
    let nearestDist = Infinity;
    for (const id of candidates) {
      const s = this.structures.get(id);
      if (!s) continue;
      const d = distance2D(pos.x, pos.z, s.position.x, s.position.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = s;
      }
    }
    return nearest;
  }

  getNearestStructureForAttacker(pos: THREE.Vector3): Structure | null {
    // Used by siege attackers — return any structure
    let nearest: Structure | null = null;
    let nearestDist = Infinity;
    for (const s of this.structures.values()) {
      const d = distance2D(pos.x, pos.z, s.position.x, s.position.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = s;
      }
    }
    return nearest;
  }

  getStructuresInRadius(pos: THREE.Vector3, radius: number): Structure[] {
    const candidates = this.spatialHashStructures.getNearby(pos.x, pos.z, radius);
    const result: Structure[] = [];
    for (const id of candidates) {
      const s = this.structures.get(id);
      if (s) result.push(s);
    }
    return result;
  }

  getCubesInRadius(pos: THREE.Vector3, radius: number): Cube[] {
    const candidates = this.spatialHashCubes.getNearby(pos.x, pos.z, radius);
    const result: Cube[] = [];
    for (const id of candidates) {
      const c = this.cubes.get(id);
      if (!c) continue;
      if (distance2D(pos.x, pos.z, c.position.x, c.position.z) <= radius) {
        result.push(c);
      }
    }
    return result;
  }

  getAttackersInRadius(pos: THREE.Vector3, radius: number): Attacker[] {
    const candidates = this.spatialHashAttackers.getNearby(pos.x, pos.z, radius);
    const result: Attacker[] = [];
    for (const id of candidates) {
      const a = this.attackers.get(id);
      if (!a) continue;
      if (distance2D(pos.x, pos.z, a.position.x, a.position.z) <= radius) {
        result.push(a);
      }
    }
    return result;
  }

  getAttackersOfType(type: AttackerWaveType): Attacker[] {
    return Array.from(this.attackers.values()).filter(a => a.type === type);
  }

  getPackMembers(packId: number): Attacker[] {
    return Array.from(this.attackers.values()).filter(a => a.packId === packId);
  }

  // ──────────────────────────────────────────────
  // SPATIAL HASH SYNC
  // ──────────────────────────────────────────────

  rebuildSpatialHashes(): void {
    this.spatialHashCubes.clear();
    this.spatialHashFood.clear();
    this.spatialHashAttackers.clear();
    this.spatialHashStructures.clear();

    for (const [id, cube] of this.cubes) {
      this.spatialHashCubes.insert(id, cube.position.x, cube.position.z);
    }
    for (const [id, food] of this.foods) {
      if (!food.isEaten) this.spatialHashFood.insert(id, food.position.x, food.position.z);
    }
    for (const [id, attacker] of this.attackers) {
      this.spatialHashAttackers.insert(id, attacker.position.x, attacker.position.z);
    }
    for (const [id, structure] of this.structures) {
      this.spatialHashStructures.insert(id, structure.position.x, structure.position.z);
    }
  }

  updateSpatialHashes(): void {
    // Move entities in spatial hashes (cheap — only updates on cell change)
    for (const [id, cube] of this.cubes) {
      this.spatialHashCubes.move(id, cube.position.x, cube.position.z);
    }
    for (const [id, attacker] of this.attackers) {
      this.spatialHashAttackers.move(id, attacker.position.x, attacker.position.z);
    }
  }

  // ──────────────────────────────────────────────
  // FIND RANDOM SPAWN POSITION (on world edge)
  // ──────────────────────────────────────────────

  randomEdgePosition(rng: () => number): THREE.Vector3 {
    const half = CONFIG.WORLD_SIZE / 2 - 2;
    const side = Math.floor(rng() * 4);
    let x = 0, z = 0;
    switch (side) {
      case 0: x = -half;                      z = (rng() * 2 - 1) * half; break;
      case 1: x =  half;                      z = (rng() * 2 - 1) * half; break;
      case 2: x = (rng() * 2 - 1) * half;    z = -half;                   break;
      case 3: x = (rng() * 2 - 1) * half;    z =  half;                   break;
    }
    return new THREE.Vector3(x, 0, z);
  }

  // ──────────────────────────────────────────────
  // GET RANDOM EXISTING FOOD POSITION (for cluster spawning)
  // ──────────────────────────────────────────────

  getRandomFoodPosition(rng: () => number): THREE.Vector3 | null {
    const foods = Array.from(this.foods.values()).filter(f => !f.isEaten);
    if (foods.length === 0) return null;
    const food = foods[Math.floor(rng() * foods.length)];
    return food.position.clone();
  }

  // ──────────────────────────────────────────────
  // CLEAR ALL
  // ──────────────────────────────────────────────

  clear(): void {
    for (const cube of this.cubes.values()) cube.dispose();
    for (const food of this.foods.values()) food.dispose();
    for (const attacker of this.attackers.values()) attacker.dispose();
    for (const structure of this.structures.values()) structure.dispose();
    this.cubes.clear();
    this.foods.clear();
    this.attackers.clear();
    this.structures.clear();
    this.spatialHashCubes.clear();
    this.spatialHashFood.clear();
    this.spatialHashAttackers.clear();
    this.spatialHashStructures.clear();
  }
}
