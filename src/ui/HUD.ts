// ============================================================
// CUBE GENESIS — HUD
// DOM-based heads-up display. Updates every HUD_UPDATE_INTERVAL frames.
// ============================================================

import { CONFIG } from '../config.ts';
import { World, WorldStats } from '../world/World.ts';
import { formatTicks } from '../utils/math.ts';
import { Cube } from '../entities/Cube.ts';
import { CameraController } from '../rendering/CameraController.ts';

export class HUD {
  private frameCount: number = 0;
  private lastSaveTick: number = 0;
  private eraFlashTimeout: ReturnType<typeof setTimeout> | null = null;
  private simSpeedRef: { value: number } | null = null;

  // Cached element refs (avoid querySelector in hot path)
  private els: Record<string, HTMLElement | null> = {};
  private threatPips: HTMLElement[] = [];
  private isSlowMo: boolean = false;
  private slowMoTarget: { simSpeed: number } | null = null;

  // Camera controller for best/worst cube click-to-follow
  private cameraController: CameraController | null = null;
  private worldRef: World | null = null;

  constructor() {
    const ids = [
      'stat-population', 'stat-generation', 'stat-food', 'stat-structures',
      'stat-attackers', 'threat-bar', 'stat-best-survival', 'stat-civ-score',
      'stat-last-saved', 'hud-era', 'era-flash', 'era-flash-text', 'era-flash-sub',
      'avg-reward-val', 'best-cube-val', 'worst-cube-val',
      'stat-intelligence', 'stat-confidence',
      'most-fed-val', 'oldest-cube-val',
    ];
    for (const id of ids) {
      this.els[id] = document.getElementById(id);
    }

    // Initialize threat pips
    const threatBar = this.els['threat-bar'];
    if (threatBar) {
      for (let i = 0; i < 8; i++) {
        const pip = document.createElement('div');
        pip.className = 'threat-pip';
        threatBar.appendChild(pip);
        this.threatPips.push(pip);
      }
    }

    // Wire clickable cube-follow elements
    const clickableIds: [string, string][] = [
      ['best-cube-val', 'best'],
      ['worst-cube-val', 'worst'],
      ['most-fed-val', 'most-fed'],
      ['oldest-cube-val', 'oldest'],
    ];
    for (const [elId, type] of clickableIds) {
      const el = document.getElementById(elId);
      if (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => this._followCubeByType(type as 'best' | 'worst' | 'most-fed' | 'oldest'));
      }
    }
  }

  setCameraController(controller: CameraController): void {
    this.cameraController = controller;
  }

  // ──────────────────────────────────────────────
  // UPDATE — throttled
  // ──────────────────────────────────────────────

  update(world: World, frameCount: number): void {
    if (frameCount % CONFIG.HUD_UPDATE_INTERVAL !== 0) return;
    this.frameCount = frameCount;
    this.worldRef = world;

    const stats = world.getWorldStats();

    this._setText('stat-population', `${stats.population} / ${stats.maxPopulation}`);
    this._setText('stat-generation', String(stats.generation));
    this._setText('stat-food', `${stats.foodCount} / ${stats.maxFood}`);
    this._setText('stat-structures', String(stats.structureCount));
    this._setText('stat-attackers', String(stats.attackerCount));
    this._setText('stat-best-survival', formatTicks(stats.bestSurvivalTime));
    this._setText('stat-civ-score', String(stats.civScore));

    // Intelligence index — fitness-per-tick across last 20 deaths, scaled 0-100
    const trendArrow = stats.intelligenceTrend === 'rising' ? ' ↑'
      : stats.intelligenceTrend === 'falling' ? ' ↓' : '';
    const intelligenceEl = this.els['stat-intelligence'];
    if (intelligenceEl) {
      intelligenceEl.textContent = `${stats.intelligenceIndex.toFixed(1)}${trendArrow}`;
      intelligenceEl.style.color = stats.intelligenceTrend === 'rising' ? 'var(--green)'
        : stats.intelligenceTrend === 'falling' ? 'var(--danger)' : '';
    }
    // Decision confidence — population avg output RMS (0=noise, 1=decisive)
    const confEl = this.els['stat-confidence'];
    if (confEl) {
      confEl.textContent = `${(stats.avgDecisionConfidence * 100).toFixed(1)}%`;
    }

    // Era display
    const eraEl = this.els['hud-era'];
    if (eraEl) {
      eraEl.textContent = `ERA ${stats.currentEra + 1}: ${stats.eraName.toUpperCase()}`;
    }

    // Threat bar
    this.updateThreatMeter(stats.activeWave, stats.currentEra);

    // Last saved counter
    const savedEl = this.els['stat-last-saved'];
    if (savedEl) {
      const secondsAgo = Math.floor((frameCount - this.lastSaveTick) / 60);
      savedEl.textContent = secondsAgo < 60
        ? `${secondsAgo}s ago`
        : `${Math.floor(secondsAgo / 60)}m ago`;
      savedEl.classList.toggle('warning', secondsAgo > 120);
    }

    // AVG REWARD, BEST CUBE, WORST CUBE, MOST FED, OLDEST
    // Sort by recentRewardRate — age-independent rolling avg over last 100 ticks.
    const aliveCubes = Array.from(world.entityManager.cubes.values());
    if (aliveCubes.length > 0) {
      const avgReward = aliveCubes.reduce((s, c) => s + c.recentRewardRate, 0) / aliveCubes.length;

      // Sort descending by recentRewardRate; ties broken by foodEaten
      const sorted = [...aliveCubes].sort((a, b) => {
        const dr = b.recentRewardRate - a.recentRewardRate;
        return dr !== 0 ? dr : b.foodEaten - a.foodEaten;
      });
      const bestCube = sorted[0]!;
      const worstCube = sorted[sorted.length - 1]!;

      // Most food eaten (alive) — primary metric: foodEaten, tiebreak: recentRewardRate
      const mostFed = [...aliveCubes].sort((a, b) =>
        b.foodEaten !== a.foodEaten ? b.foodEaten - a.foodEaten : b.recentRewardRate - a.recentRewardRate
      )[0]!;

      // Longest alive (alive) — primary metric: age, tiebreak: foodEaten
      const oldest = [...aliveCubes].sort((a, b) =>
        b.age !== a.age ? b.age - a.age : b.foodEaten - a.foodEaten
      )[0]!;

      const avgEl = this.els['avg-reward-val'];
      if (avgEl) {
        const sign = avgReward >= 0 ? '+' : '';
        avgEl.textContent = `${sign}${avgReward.toFixed(3)} /t`;
        avgEl.style.color = avgReward >= 0 ? 'var(--green)' : 'var(--danger)';
      }

      // Best cube — show ID and reward rate (that's what makes it "best")
      const bestEl = this.els['best-cube-val'];
      if (bestEl) {
        const sign = bestCube.recentRewardRate >= 0 ? '+' : '';
        bestEl.textContent = `#${bestCube.id}  ${sign}${bestCube.recentRewardRate.toFixed(3)}/t`;
        bestEl.title = `Cube #${bestCube.id} · Food: ${bestCube.foodEaten} · Age: ${bestCube.age}t`;
        bestEl.setAttribute('data-cube-id', String(bestCube.id));
      }

      // Worst cube — only shown when 2+ cubes exist
      const worstEl = this.els['worst-cube-val'];
      if (worstEl) {
        if (aliveCubes.length >= 2 && worstCube.id !== bestCube.id) {
          const sign = worstCube.recentRewardRate >= 0 ? '+' : '';
          worstEl.textContent = `#${worstCube.id}  ${sign}${worstCube.recentRewardRate.toFixed(3)}/t`;
          worstEl.title = `Cube #${worstCube.id} · Food: ${worstCube.foodEaten} · Age: ${worstCube.age}t`;
          worstEl.setAttribute('data-cube-id', String(worstCube.id));
        } else {
          worstEl.textContent = '—';
          worstEl.removeAttribute('data-cube-id');
        }
      }

      // Most fed — food count is the headline metric
      const mostFedEl = this.els['most-fed-val'];
      if (mostFedEl) {
        mostFedEl.textContent = `#${mostFed.id}  ${mostFed.foodEaten}f  ${mostFed.age}t`;
        mostFedEl.title = `Cube #${mostFed.id} · Most food eaten`;
        mostFedEl.setAttribute('data-cube-id', String(mostFed.id));
      }

      // Oldest alive — survival time is the headline metric
      const oldestEl = this.els['oldest-cube-val'];
      if (oldestEl) {
        oldestEl.textContent = `#${oldest.id}  ${oldest.age}t  ${oldest.foodEaten}f`;
        oldestEl.title = `Cube #${oldest.id} · Longest surviving`;
        oldestEl.setAttribute('data-cube-id', String(oldest.id));
      }
    } else {
      this._setText('avg-reward-val', '— /t');
      this._setText('best-cube-val', '—');
      this._setText('worst-cube-val', '—');
      this._setText('most-fed-val', '—');
      this._setText('oldest-cube-val', '—');
    }
  }

  // ──────────────────────────────────────────────
  // CLICK-TO-FOLLOW BEST / WORST CUBE
  // ──────────────────────────────────────────────

  private _followCubeByType(type: 'best' | 'worst' | 'most-fed' | 'oldest'): void {
    if (!this.cameraController || !this.worldRef) return;
    const elIdMap: Record<string, string> = {
      'best': 'best-cube-val',
      'worst': 'worst-cube-val',
      'most-fed': 'most-fed-val',
      'oldest': 'oldest-cube-val',
    };
    const el = document.getElementById(elIdMap[type] ?? '');
    if (!el) return;
    const idStr = el.getAttribute('data-cube-id');
    if (!idStr) return;
    const cubeId = parseInt(idStr, 10);
    const cube = this.worldRef.entityManager.cubes.get(cubeId);
    if (cube) {
      this.cameraController.followCube(cube);
    }
  }

  // ──────────────────────────────────────────────
  // ERA TRANSITION FLASH
  // ──────────────────────────────────────────────

  showEraTransition(era: number, eraName: string): void {
    const colors = CONFIG.ERA_COLORS;
    const color = colors[Math.min(era, colors.length - 1)];

    const flashEl = this.els['era-flash'];
    const textEl = this.els['era-flash-text'];
    const subEl = this.els['era-flash-sub'];

    if (flashEl) {
      flashEl.style.background = `radial-gradient(ellipse at center, ${color}22 0%, transparent 70%)`;
      flashEl.style.color = color;
    }
    if (textEl) {
      textEl.textContent = `ERA ${era + 1}: ${eraName.toUpperCase()}`;
      textEl.style.color = color;
    }
    if (subEl) {
      subEl.style.color = color;
      subEl.textContent = this._getEraSubtext(era);
    }

    flashEl?.classList.add('active');

    if (this.eraFlashTimeout) clearTimeout(this.eraFlashTimeout);
    this.eraFlashTimeout = setTimeout(() => {
      flashEl?.classList.remove('active');
    }, CONFIG.ERA_FLASH_DURATION);
  }

  private _getEraSubtext(era: number): string {
    const subs = [
      'THE FIRST SPARK OF LIFE',
      'EYES OPEN TO THE VOID',
      'DIVISION — LIFE MULTIPLIES',
      'STRENGTH IN NUMBERS',
      'BUILDING THE FUTURE',
      'A CIVILIZATION IS BORN',
    ];
    return subs[Math.min(era, subs.length - 1)] ?? '';
  }

  // ──────────────────────────────────────────────
  // THREAT METER
  // ──────────────────────────────────────────────

  updateThreatMeter(wave: string, era: number): void {
    const waveNames = ['drifter', 'seeker', 'pack', 'predator', 'siege', 'swarm'];
    const waveIdx = waveNames.indexOf(wave);
    const activePips = waveIdx >= 0 ? Math.floor(((waveIdx + 1) / 6) * 8) : 1;

    this.threatPips.forEach((pip, i) => {
      pip.classList.toggle('active', i < activePips);
    });
  }

  // ──────────────────────────────────────────────
  // SAVE INDICATOR
  // ──────────────────────────────────────────────

  markSaved(frameCount: number): void {
    this.lastSaveTick = frameCount;
  }

  // ──────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────

  private _setText(id: string, text: string): void {
    const el = this.els[id];
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }
}
