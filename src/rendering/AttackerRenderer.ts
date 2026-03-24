// ============================================================
// CUBE GENESIS — Attacker Renderer
// Per-frame mesh updates for attacker entities.
// Swarm units use a single InstancedMesh for performance.
// ============================================================

import * as THREE from 'three';
import { Attacker } from '../entities/Attacker.ts';
import { CONFIG, AttackerWaveType } from '../config.ts';
import { attackerColor } from '../utils/color.ts';

const WAVE_INDEX: Record<AttackerWaveType, number> = {
  drifter: 0,
  seeker: 1,
  pack: 2,
  predator: 3,
  siege: 4,
  swarm: 5,
};

const MAX_SWARM = 60; // slightly above config max for headroom
const _matrix  = new THREE.Matrix4();
const _pos     = new THREE.Vector3();
const _quat    = new THREE.Quaternion();
const _scale   = new THREE.Vector3();
const _color   = new THREE.Color();

export class AttackerRenderer {
  private swarmInstancedMesh: THREE.InstancedMesh;
  private scene: THREE.Scene;

  constructor(scene?: THREE.Scene) {
    this.scene = scene!;

    // Swarm InstancedMesh — tiny octahedra, 1 draw call for all units
    const geo = new THREE.OctahedronGeometry(0.18, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff2244, emissive: new THREE.Color(0x660011) });
    this.swarmInstancedMesh = new THREE.InstancedMesh(geo, mat, MAX_SWARM);
    this.swarmInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.swarmInstancedMesh.count = 0;
    if (scene) scene.add(this.swarmInstancedMesh);
  }

  // ──────────────────────────────────────────────
  // UPDATE INDIVIDUAL ATTACKER MESH (non-swarm)
  // ──────────────────────────────────────────────

  updateAttackerMesh(attacker: Attacker): void {
    if (attacker.type === 'swarm') return; // handled by updateSwarm()

    const mat = attacker.mesh.material as THREE.MeshLambertMaterial;
    const waveConfig = CONFIG.ATTACKER_WAVES[attacker.type] as { hp: number };
    const healthFraction = attacker.hp / waveConfig.hp;
    const emissiveIntensity = 0.1 + (1 - healthFraction) * 0.4;
    const waveIdx = WAVE_INDEX[attacker.type];
    const baseColor = attackerColor(waveIdx);
    mat.emissive.copy(baseColor).multiplyScalar(emissiveIntensity);

    if (attacker.type === 'predator') {
      const pulse = 0.9 + Math.sin(Date.now() * 0.006) * 0.1;
      attacker.mesh.scale.setScalar(0.5 * pulse);
    }

    if (attacker.type === 'siege') {
      const siegeScale = CONFIG.ATTACKER_WAVES.siege.sizeMultiplier;
      const pulse = siegeScale * (0.95 + Math.sin(Date.now() * 0.001) * 0.05);
      attacker.mesh.scale.setScalar(pulse);
    }
  }

  // ──────────────────────────────────────────────
  // UPDATE SWARM INSTANCED MESH
  // ──────────────────────────────────────────────

  updateSwarm(swarmUnits: Attacker[], worldAge: number): void {
    let i = 0;
    for (const unit of swarmUnits) {
      if (i >= MAX_SWARM) break;

      // Spin + orbit offset for visual variety
      const spin = worldAge * 0.05 + unit.id * 0.7;
      _quat.setFromEuler(new THREE.Euler(spin, spin * 0.7, 0));

      // Pulse size based on reward rate — bright and big when hunting
      const vigor = 1.0 + Math.max(0, unit.recentRewardRate) * 0.5;
      _scale.setScalar(vigor);

      _pos.set(unit.position.x, 0.5, unit.position.z);
      _matrix.compose(_pos, _quat, _scale);
      this.swarmInstancedMesh.setMatrixAt(i, _matrix);

      // Color: dim red when idle, bright red when rewarded
      const brightness = 0.3 + Math.min(0.7, Math.max(0, unit.recentRewardRate) * 2);
      _color.setHSL(0.97, 1.0, brightness);
      this.swarmInstancedMesh.setColorAt(i, _color);
      i++;
    }
    this.swarmInstancedMesh.count = i;
    this.swarmInstancedMesh.instanceMatrix.needsUpdate = true;
    if (this.swarmInstancedMesh.instanceColor) {
      this.swarmInstancedMesh.instanceColor.needsUpdate = true;
    }
  }

  // ──────────────────────────────────────────────
  // GEOMETRY & MATERIAL FACTORIES
  // ──────────────────────────────────────────────

  getAttackerGeometry(type: AttackerWaveType): THREE.BufferGeometry {
    switch (type) {
      case 'drifter':  return new THREE.BoxGeometry(0.6, 0.6, 0.6);
      case 'seeker':   return new THREE.OctahedronGeometry(0.5);
      case 'pack':     return new THREE.TetrahedronGeometry(0.5);
      case 'predator': return new THREE.IcosahedronGeometry(0.5, 0);
      case 'siege':    return new THREE.BoxGeometry(3, 3, 3);
      case 'swarm':    return new THREE.OctahedronGeometry(0.18);
    }
  }

  getAttackerMaterial(type: AttackerWaveType): THREE.MeshLambertMaterial {
    const waveIdx = WAVE_INDEX[type];
    const color = attackerColor(waveIdx);
    const emissive = color.clone().multiplyScalar(0.3);
    return new THREE.MeshLambertMaterial({ color, emissive });
  }

  dispose(): void {
    this.scene?.remove(this.swarmInstancedMesh);
    this.swarmInstancedMesh.geometry.dispose();
    (this.swarmInstancedMesh.material as THREE.Material).dispose();
  }
}
