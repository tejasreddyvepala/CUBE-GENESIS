// ============================================================
// CUBE GENESIS — Timeline
// Era progress bar at the bottom of the screen.
// ============================================================

import { CONFIG } from '../config.ts';

export class Timeline {
  private segments: (HTMLElement | null)[] = [];
  private fills: (HTMLElement | null)[] = [];
  private labels: (HTMLElement | null)[] = [];
  private lastEra: number = -1;
  private lastProgress: number = -1;

  constructor() {
    for (let i = 0; i < CONFIG.ERA_COUNT; i++) {
      this.segments.push(document.getElementById(`tl-seg-${i}`));
      this.fills.push(document.getElementById(`tl-fill-${i}`));
      this.labels.push(document.getElementById(`tl-label-${i}`));
    }
  }

  // ──────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────

  update(currentEra: number, civScore: number): void {
    const thresholds = CONFIG.ERA_THRESHOLDS;

    // Progress within current era
    const currentThreshold = thresholds[currentEra] ?? 0;
    const nextThreshold = thresholds[currentEra + 1];
    let progress = 1.0;
    if (nextThreshold !== undefined) {
      const span = nextThreshold - currentThreshold;
      progress = span > 0 ? Math.min((civScore - currentThreshold) / span, 1) : 1;
    }

    // Early exit if nothing changed
    if (currentEra === this.lastEra && Math.abs(progress - this.lastProgress) < 0.005) return;
    this.lastEra = currentEra;
    this.lastProgress = progress;

    for (let i = 0; i < CONFIG.ERA_COUNT; i++) {
      const seg = this.segments[i];
      const fill = this.fills[i];
      const label = this.labels[i];

      if (!seg || !fill) continue;

      if (i < currentEra) {
        // Completed era
        seg.className = 'timeline-segment completed';
        fill.style.width = '100%';
        fill.style.background = CONFIG.ERA_COLORS[i] ?? 'var(--teal)';
        fill.style.boxShadow = '';
      } else if (i === currentEra) {
        // Active era
        seg.className = 'timeline-segment active-seg';
        fill.style.width = `${Math.round(progress * 100)}%`;
        fill.style.background = CONFIG.ERA_COLORS[i] ?? 'var(--teal)';
        fill.style.boxShadow = `0 0 8px ${CONFIG.ERA_COLORS[i] ?? 'var(--teal)'}`;
      } else {
        // Future era
        seg.className = 'timeline-segment';
        fill.style.width = '0%';
        fill.style.background = '';
        fill.style.boxShadow = '';
      }

      if (label) {
        label.classList.toggle('active', i === currentEra);
      }
    }
  }
}
