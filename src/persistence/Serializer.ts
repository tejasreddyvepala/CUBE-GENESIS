// ============================================================
// CUBE GENESIS — Serializer
// Converts full world state ↔ SaveFile.
// Implements the leaf-node save strategy from CLAUDE.md.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { World } from '../world/World.ts';
import {
  SaveFile, CURRENT_SAVE_VERSION,
  LeafNodeSave, GhostSave, AttackerSave, FoodSave, StructureSave,
  GenomeSave, AttackerGenomeSave, CubesSave, StatsHistorySave,
  SimulationState,
} from './SaveSchema.ts';
import { Cube } from '../entities/Cube.ts';
import { LineageTracker } from '../systems/LineageTracker.ts';

// ──────────────────────────────────────────────
// SIMPLE CHECKSUM (djb2-like)
// ──────────────────────────────────────────────

function simpleChecksum(str: string): string {
  let hash = 5381;
  for (let i = 0; i < Math.min(str.length, 5000); i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep 32-bit unsigned
  }
  return hash.toString(16);
}

// ──────────────────────────────────────────────
// SERIALIZER CLASS
// ──────────────────────────────────────────────

export class Serializer {
  // ──────────────────────────────────────────────
  // SERIALIZE WORLD → SaveFile
  // ──────────────────────────────────────────────

  serialize(world: World): SaveFile {
    const em = world.entityManager;
    const aliveCubes = em.getAliveCubes();

    // Leaf node selection
    const { leaves, ghosts } = world.lineageTracker.selectLeafNodes(aliveCubes);

    // Serialize cubes
    const leafNodes: LeafNodeSave[] = leaves.map(cube => ({
      id: cube.id,
      position: [cube.position.x, cube.position.y, cube.position.z],
      direction: cube.direction,
      energy: cube.energy,
      age: cube.age,
      generation: cube.generation,
      era: cube.era,
      state: cube.state,
      brain: Array.from(cube.brain.getWeights()),
      stats: {
        foodEaten:       cube.foodEaten,
        distanceTraveled: cube.distanceTraveled,
        offspringCount:  cube.offspringCount,
        structuresBuilt: cube.structuresBuilt,
        damageTaken:     cube.damageTaken,
      },
      lineage: [...cube.lineage],
      lineageDepth: cube.lineage.length,
      isLeaf: true,
    }));

    const ghostNodes: GhostSave[] = ghosts.map(cube => ({
      id: cube.id,
      position: [cube.position.x, cube.position.y, cube.position.z],
      direction: cube.direction,
      energy: cube.energy,
      age: cube.age,
      generation: cube.generation,
      era: cube.era,
      state: cube.state,
      nearestLeafId: cube._nearestLeafId ?? leaves[0]?.id ?? 0,
    }));

    // Hall of fame
    const hallOfFame: GenomeSave[] = world.hallOfFame.serialize();

    // Attackers
    const attackers: AttackerSave[] = em.getAliveAttackers().map(a => ({
      type: a.type,
      position: [a.position.x, a.position.y, a.position.z],
      direction: a.direction,
      hp: a.hp,
      brain: a.brain ? Array.from(a.brain.getWeights()) : null,
      packId: a.packId,
    }));

    // Attacker HoF
    const attackerHoF = world.attackerEvolution.serialize();
    const attackerHallOfFame: AttackerGenomeSave[] = attackerHoF.hallOfFame.map(g => ({
      weights: Array.from(g.weights),
      kills: 0,
      generation: g.generation,
    }));

    // Food
    const foods: FoodSave[] = em.getFoods()
      .filter(f => !f.isEaten)
      .map(f => ({
        position: [f.position.x, f.position.y, f.position.z],
        value: f.value,
      }));

    // Structures
    const structures: StructureSave[] = em.getStructures().map(s => ({
      type: s.type,
      position: [s.position.x, s.position.y, s.position.z],
      hp: s.hp,
      builderId: s.builderId,
    }));

    // Lineage tree
    const lineageEdges = world.lineageTracker.getAllEdges();
    const lineageRoots = world.lineageTracker.getRoots(aliveCubes);

    // Simulation state
    const simulation: SimulationState = {
      worldAge:             world.worldAge,
      currentEra:           world.eraManager.currentEra,
      civScore:             world.civScore,
      maxGenerationReached: world.maxGenerationReached,
      totalDeaths:          world.totalDeaths,
      totalDuplications:    world.totalDuplications,
      totalFoodEaten:       world.totalFoodEaten,
      bestSurvivalTime:     world.bestSurvivalTime,
      seed:                 world.seed,
      tickCount:            world.worldAge,
    };

    // Stats history
    const statsHistory: StatsHistorySave = {
      population:      [...world.statsHistory.population],
      avgFitness:      [...world.statsHistory.avgFitness],
      foodSupply:      [...world.statsHistory.foodSupply],
      killDeathRatio:  [...world.statsHistory.killDeathRatio],
    };

    // Build the save object for checksum
    const partial = {
      version: CURRENT_SAVE_VERSION,
      savedAt: Date.now(),
      simulation,
      hallOfFame,
      cubes: { leafNodes, ghosts: ghostNodes } as CubesSave,
      lineageTree: { edges: lineageEdges, roots: lineageRoots },
      attackers,
      attackerHallOfFame,
      foods,
      structures,
      statsHistory,
    };

    const checksum = simpleChecksum(JSON.stringify(simulation) + JSON.stringify(hallOfFame));

    return { ...partial, checksum };
  }

  // ──────────────────────────────────────────────
  // DESERIALIZE SaveFile → World
  // ──────────────────────────────────────────────

  deserialize(save: SaveFile, world: World): void {
    const em = world.entityManager;

    // Clear existing world
    em.clear();

    // Restore simulation state
    world.worldAge             = save.simulation.worldAge;
    world.civScore             = save.simulation.civScore;
    world.maxGenerationReached = save.simulation.maxGenerationReached;
    world.totalDeaths          = save.simulation.totalDeaths;
    world.totalDuplications    = save.simulation.totalDuplications;
    world.totalFoodEaten       = save.simulation.totalFoodEaten;
    world.bestSurvivalTime     = save.simulation.bestSurvivalTime;
    world.seed                 = save.simulation.seed;

    // Restore era
    world.eraManager.deserialize({
      currentEra: save.simulation.currentEra,
      lastTransitionTick: 0,
    });

    // Restore Hall of Fame
    world.hallOfFame.deserialize(save.hallOfFame);

    // Restore attacker evolution — convert AttackerGenomeSave to GenomeJSON format
    const attackerGenomes = save.attackerHallOfFame.map(ag => ({
      weights: ag.weights,
      fitness: ag.kills * 2.0,
      generation: ag.generation,
      parentId: 0,
      era: 0,
      mutations: 0,
    }));
    world.attackerEvolution.deserialize({ hallOfFame: attackerGenomes });

    // Restore leaf cubes first (full brains)
    const leafBrainMap = new Map<number, number[]>();
    for (const leafData of save.cubes.leafNodes) {
      const pos = new THREE.Vector3(...leafData.position);
      const cube = em.spawnCube(pos, undefined, world.hallOfFame, Math.random);

      // Override with saved state
      cube.brain.setWeights(new Float32Array(leafData.brain));
      cube.direction       = leafData.direction;
      cube.energy          = leafData.energy;
      cube.age             = leafData.age;
      cube.generation      = leafData.generation;
      cube.era             = leafData.era;
      cube.state           = leafData.state as Cube['state'];
      cube.foodEaten       = leafData.stats.foodEaten;
      cube.distanceTraveled = leafData.stats.distanceTraveled;
      cube.offspringCount  = leafData.stats.offspringCount;
      cube.structuresBuilt = leafData.stats.structuresBuilt;
      cube.damageTaken     = leafData.stats.damageTaken;
      cube.lineage         = [...leafData.lineage];

      // Sync mesh position
      cube.mesh.position.copy(pos);
      cube.mesh.rotation.y = -cube.direction;

      leafBrainMap.set(leafData.id, leafData.brain);
      world.lineageTracker.addCube(cube.id, cube.lineage[0] ?? 0);
    }

    // Restore ghost cubes (clone brain from nearest leaf)
    for (const ghostData of save.cubes.ghosts) {
      const pos = new THREE.Vector3(...ghostData.position);
      const cube = em.spawnCube(pos, undefined, world.hallOfFame, Math.random);

      // Clone brain from nearest leaf
      const leafBrain = leafBrainMap.get(ghostData.nearestLeafId);
      if (leafBrain) {
        cube.brain.setWeights(new Float32Array(leafBrain));
        // Apply slight reverse-mutation (cosmetic)
        cube.brain.mutateAll(0.02, 0.05, Math.random);
      }

      cube.direction  = ghostData.direction;
      cube.energy     = ghostData.energy;
      cube.age        = ghostData.age;
      cube.generation = ghostData.generation;
      cube.era        = ghostData.era;
      cube.state      = ghostData.state as Cube['state'];
      cube.lineage    = [];

      cube.mesh.position.copy(pos);
      cube.mesh.rotation.y = -cube.direction;

      world.lineageTracker.addCube(cube.id, 0);
    }

    // Restore lineage tree
    world.lineageTracker.deserialize(save.lineageTree.edges.map(([childId, parentId]) => ({ childId, parentId })));

    // Restore attackers
    for (const atkData of save.attackers) {
      const pos = new THREE.Vector3(...atkData.position);
      const attacker = em.spawnAttacker(atkData.type as import('../config.ts').AttackerWaveType, pos, atkData.packId);
      attacker.direction = atkData.direction;
      attacker.hp        = atkData.hp;
      if (atkData.brain && attacker.brain) {
        attacker.brain.setWeights(new Float32Array(atkData.brain));
      }
    }

    // Restore food
    for (const foodData of save.foods) {
      const pos = new THREE.Vector3(...foodData.position);
      em.spawnFood(pos, foodData.value);
    }

    // Restore structures
    for (const sData of save.structures) {
      const pos = new THREE.Vector3(...sData.position);
      const s = em.addStructure(sData.type, pos, sData.builderId);
      if (s) s.hp = sData.hp;
    }

    // Restore stats history
    world.statsHistory = {
      population:     [...save.statsHistory.population],
      avgFitness:     [...save.statsHistory.avgFitness],
      foodSupply:     [...save.statsHistory.foodSupply],
      killDeathRatio: [...save.statsHistory.killDeathRatio],
    };

    // Rebuild spatial hashes
    em.rebuildSpatialHashes();
  }

  // ──────────────────────────────────────────────
  // EMERGENCY SAVE (minimal — just Hall of Fame)
  // ──────────────────────────────────────────────

  serializeEmergency(world: World): object {
    return {
      version: CURRENT_SAVE_VERSION,
      savedAt: Date.now(),
      simulation: {
        worldAge:             world.worldAge,
        currentEra:           world.eraManager.currentEra,
        civScore:             world.civScore,
        maxGenerationReached: world.maxGenerationReached,
        totalDeaths:          world.totalDeaths,
        totalDuplications:    world.totalDuplications,
        totalFoodEaten:       world.totalFoodEaten,
        bestSurvivalTime:     world.bestSurvivalTime,
        seed:                 world.seed,
        tickCount:            world.worldAge,
      },
      hallOfFame: world.hallOfFame.serialize(),
      _emergency: true,
    };
  }
}
