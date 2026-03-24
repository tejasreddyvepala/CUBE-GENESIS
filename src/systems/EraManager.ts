// ============================================================
// CUBE GENESIS — Era Manager
// Tracks era progression and ability unlocks.
// ============================================================

import { CONFIG } from '../config.ts';

export class EraManager {
  currentEra: number = 0; // 0-based index (Era 1 = index 0)
  lastTransitionTick: number = 0;
  private transitionCallback: ((newEra: number) => void) | null = null;

  constructor(onTransition?: (newEra: number) => void) {
    this.transitionCallback = onTransition ?? null;
  }

  // ──────────────────────────────────────────────
  // CHECK ERA TRANSITION
  // Returns new era index if transitioned, null otherwise.
  // ──────────────────────────────────────────────

  checkEraTransition(civScore: number, worldAge: number): number | null {
    const thresholds = CONFIG.ERA_THRESHOLDS;
    const maxEra = thresholds.length - 1;

    if (this.currentEra >= maxEra) return null;

    const nextEra = this.currentEra + 1;
    if (civScore >= thresholds[nextEra]) {
      this.currentEra = nextEra;
      this.lastTransitionTick = worldAge;
      this.transitionCallback?.(nextEra);
      return nextEra;
    }
    return null;
  }

  // ──────────────────────────────────────────────
  // ERA INFO
  // ──────────────────────────────────────────────

  getEraName(era: number = this.currentEra): string {
    return CONFIG.ERA_NAMES[Math.min(era, CONFIG.ERA_NAMES.length - 1)] ?? 'Unknown';
  }

  getEraColor(era: number = this.currentEra): string {
    return CONFIG.ERA_COLORS[Math.min(era, CONFIG.ERA_COLORS.length - 1)] ?? '#00ffc8';
  }

  getEraDisplayNumber(era: number = this.currentEra): number {
    return era + 1; // 1-based for display
  }

  // ──────────────────────────────────────────────
  // ABILITY UNLOCK CHECKS
  // ──────────────────────────────────────────────

  isAbilityUnlocked(ability: string, era: number = this.currentEra): boolean {
    switch (ability) {
      case 'sprint':   return era >= 1; // Era 2+
      case 'signal':   return era >= 3; // Era 4+
      case 'build':    return era >= 4; // Era 5+
      case 'defend':   return era >= 3; // Era 4+
      case 'ally':     return era >= 3; // Era 4+: ally sensing inputs
      case 'vision':   return era >= 1; // Era 2+: extended vision
      default: return true;
    }
  }

  getVisionRange(era: number = this.currentEra): number {
    return era >= 1 ? CONFIG.CUBE_VISION_RANGE_ERA2 : CONFIG.CUBE_VISION_RANGE;
  }

  // ──────────────────────────────────────────────
  // ATTACKER WAVE FOR CURRENT ERA
  // ──────────────────────────────────────────────

  getActiveAttackerWaves(): string[] {
    const waves: string[] = ['drifter'];
    if (this.currentEra >= 1) waves.push('seeker');
    if (this.currentEra >= 2) waves.push('pack');
    if (this.currentEra >= 3) waves.push('predator');
    if (this.currentEra >= 4) waves.push('siege');
    if (this.currentEra >= 5) waves.push('swarm');
    if (this.currentEra >= 7) waves.push('titan');
    if (this.currentEra >= 8) waves.push('voidswarm');
    return waves;
  }

  // ──────────────────────────────────────────────
  // PROGRESS WITHIN CURRENT ERA
  // ──────────────────────────────────────────────

  getProgressInCurrentEra(civScore: number): number {
    const thresholds = CONFIG.ERA_THRESHOLDS;
    const currentThreshold = thresholds[this.currentEra] ?? 0;
    const nextThreshold = thresholds[this.currentEra + 1];
    if (!nextThreshold) return 1.0; // max era
    const span = nextThreshold - currentThreshold;
    if (span <= 0) return 1.0;
    return Math.min((civScore - currentThreshold) / span, 1.0);
  }

  serialize(): { currentEra: number; lastTransitionTick: number } {
    return { currentEra: this.currentEra, lastTransitionTick: this.lastTransitionTick };
  }

  deserialize(data: { currentEra: number; lastTransitionTick: number }): void {
    this.currentEra = data.currentEra;
    this.lastTransitionTick = data.lastTransitionTick;
  }
}
