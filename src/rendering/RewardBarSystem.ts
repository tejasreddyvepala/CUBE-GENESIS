// ============================================================
// CUBE GENESIS — Reward Bar System
// Renders floating reward bars above cubes (and wave 4+ attackers)
// as 3D sprites showing recent reward rate and energy level.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { Cube } from '../entities/Cube.ts';
import { Attacker } from '../entities/Attacker.ts';

// Bar canvas dimensions
const BAR_CANVAS_WIDTH = 64;
const BAR_CANVAS_HEIGHT = 8;

// Height above entity center to place the bar sprite
const BAR_Y_OFFSET_BASE = 1.5;

export class RewardBarSystem {
  private scene: THREE.Scene;
  private barSprites: Map<number, THREE.Sprite> = new Map();

  // Shared canvas + context for redrawing textures
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Key format: "c{id}" for cubes, "a{id}" for attackers
  private spriteKeys: Map<string, THREE.Sprite> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.canvas = document.createElement('canvas');
    this.canvas.width = BAR_CANVAS_WIDTH;
    this.canvas.height = BAR_CANVAS_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
  }

  // ──────────────────────────────────────────────
  // ADD / REMOVE
  // ──────────────────────────────────────────────

  addBar(key: string): THREE.Sprite {
    const existing = this.spriteKeys.get(key);
    if (existing) return existing;

    // Create a unique canvas texture per sprite
    const canvas = document.createElement('canvas');
    canvas.width = BAR_CANVAS_WIDTH;
    canvas.height = BAR_CANVAS_HEIGHT;

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      sizeAttenuation: true,
    });

    const sprite = new THREE.Sprite(material);
    // Scale in world units — a thin wide bar
    sprite.scale.set(1.5, 0.2, 1);
    sprite.renderOrder = 999;

    // Store canvas on userData for per-sprite updates
    sprite.userData['canvas'] = canvas;
    sprite.userData['ctx'] = canvas.getContext('2d')!;

    this.scene.add(sprite);
    this.spriteKeys.set(key, sprite);
    return sprite;
  }

  removeBar(key: string): void {
    const sprite = this.spriteKeys.get(key);
    if (!sprite) return;
    this.scene.remove(sprite);
    const mat = sprite.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.spriteKeys.delete(key);
  }

  // ──────────────────────────────────────────────
  // UPDATE — called each frame
  // ──────────────────────────────────────────────

  update(cubes: Cube[], attackers: Attacker[], cameraPos: THREE.Vector3): void {
    // Track which keys we saw this frame
    const seenKeys = new Set<string>();

    // ── CUBES ──
    for (const cube of cubes) {
      const key = `c${cube.id}`;
      seenKeys.add(key);

      const distToCamera = cameraPos.distanceTo(cube.position);
      if (distToCamera > CONFIG.REWARD_BAR_VISIBLE_DISTANCE) {
        // Hide if too far
        const sprite = this.spriteKeys.get(key);
        if (sprite) sprite.visible = false;
        continue;
      }

      // Ensure sprite exists
      const sprite = this.addBar(key);
      sprite.visible = true;

      // Position: above the cube mesh
      const barY = (cube.size / 2) + BAR_Y_OFFSET_BASE;
      sprite.position.set(cube.position.x, barY, cube.position.z);

      // Update texture
      const energyFraction = cube.energy / cube.maxEnergy;
      this._updateBarTexture(sprite, cube.recentRewardRate, energyFraction, false);
    }

    // ── ATTACKERS (Wave 4+ with brains) ──
    for (const attacker of attackers) {
      if (attacker.type !== 'predator' && attacker.type !== 'swarm') continue;

      const key = `a${attacker.id}`;
      seenKeys.add(key);

      const distToCamera = cameraPos.distanceTo(attacker.position);
      if (distToCamera > CONFIG.REWARD_BAR_VISIBLE_DISTANCE) {
        const sprite = this.spriteKeys.get(key);
        if (sprite) sprite.visible = false;
        continue;
      }

      const sprite = this.addBar(key);
      sprite.visible = true;

      const barY = BAR_Y_OFFSET_BASE;
      sprite.position.set(attacker.position.x, barY, attacker.position.z);

      // Attacker HP fraction as "energy fraction", always red-tinted
      const waveConfig = CONFIG.ATTACKER_WAVES[attacker.type] as { hp: number };
      const hpFraction = attacker.hp / waveConfig.hp;
      this._updateBarTexture(sprite, 0, hpFraction, true);
    }

    // ── CLEANUP dead entities ──
    for (const key of this.spriteKeys.keys()) {
      if (!seenKeys.has(key)) {
        this.removeBar(key);
      }
    }
  }

  // ──────────────────────────────────────────────
  // BAR COLOR
  // ──────────────────────────────────────────────

  private getBarColor(recentRewardRate: number): string {
    if (recentRewardRate > 0.3)  return '#00ff44';
    if (recentRewardRate > 0.1)  return '#00aa22';
    if (recentRewardRate > -0.1) return '#ffcc00';
    if (recentRewardRate > -0.3) return '#ff6600';
    return '#ff0000';
  }

  // ──────────────────────────────────────────────
  // TEXTURE UPDATE
  // ──────────────────────────────────────────────

  private _updateBarTexture(
    sprite: THREE.Sprite,
    recentRewardRate: number,
    energyFraction: number,
    isAttacker: boolean
  ): void {
    const canvas = sprite.userData['canvas'] as HTMLCanvasElement;
    const ctx = sprite.userData['ctx'] as CanvasRenderingContext2D;
    if (!canvas || !ctx) return;

    const W = BAR_CANVAS_WIDTH;
    const H = BAR_CANVAS_HEIGHT;

    ctx.clearRect(0, 0, W, H);

    // Background track
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    // Energy / HP fill
    const fillW = Math.round(W * Math.max(0, Math.min(1, energyFraction)));
    if (isAttacker) {
      // Red-tinted for attackers: interpolate red to dark red
      const r = Math.floor(150 + 105 * energyFraction);
      ctx.fillStyle = `rgb(${r},0,0)`;
    } else {
      ctx.fillStyle = this.getBarColor(recentRewardRate);
    }
    ctx.fillRect(0, 0, fillW, H);

    // Thin border
    ctx.strokeStyle = isAttacker ? 'rgba(255,50,50,0.5)' : 'rgba(0,255,200,0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // Mark the energy midpoint with a faint tick at 50%
    if (!isAttacker) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
    }

    // Update texture
    const mat = sprite.material as THREE.SpriteMaterial;
    if (mat.map) {
      mat.map.needsUpdate = true;
    }
  }

  // ──────────────────────────────────────────────
  // DISPOSE
  // ──────────────────────────────────────────────

  dispose(): void {
    for (const key of [...this.spriteKeys.keys()]) {
      this.removeBar(key);
    }
  }
}
