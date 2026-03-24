// ============================================================
// CUBE GENESIS — Inspector Panel
// Click-to-inspect cube detail panel with neural net visualizer.
// ============================================================

import { Cube } from '../entities/Cube.ts';
import { formatTicks } from '../utils/math.ts';

export class InspectorPanel {
  selectedCube: Cube | null = null;

  private panel: HTMLElement | null;
  private brainCanvas: HTMLCanvasElement | null;
  private brainCtx: CanvasRenderingContext2D | null;

  // Cached element refs
  private titleEl: HTMLElement | null;
  private energyFillEl: HTMLElement | null;
  private energyTextEl: HTMLElement | null;
  private ageEl: HTMLElement | null;
  private genEl: HTMLElement | null;
  private eraEl: HTMLElement | null;
  private stateEl: HTMLElement | null;
  private foodEl: HTMLElement | null;
  private offspringEl: HTMLElement | null;
  private speedEl: HTMLElement | null;
  private lineageEl: HTMLElement | null;

  // Reward section elements
  private rewardLifetimeEl: HTMLElement | null;
  private rewardRateEl: HTMLElement | null;
  private rewardSparkCanvas: HTMLCanvasElement | null;
  private rewardSparkCtx: CanvasRenderingContext2D | null;

  constructor() {
    this.panel = document.getElementById('hud-inspector');
    this.brainCanvas = document.getElementById('brain-canvas') as HTMLCanvasElement | null;
    this.brainCtx = this.brainCanvas?.getContext('2d') ?? null;

    // Set canvas resolution
    if (this.brainCanvas) {
      this.brainCanvas.width = 188;
      this.brainCanvas.height = 80;
    }

    this.titleEl        = document.getElementById('inspector-title');
    this.energyFillEl   = document.getElementById('inspector-energy-fill');
    this.energyTextEl   = document.getElementById('inspector-energy-text');
    this.ageEl          = document.getElementById('inspector-age');
    this.genEl          = document.getElementById('inspector-gen');
    this.eraEl          = document.getElementById('inspector-era');
    this.stateEl        = document.getElementById('inspector-state');
    this.foodEl         = document.getElementById('inspector-food');
    this.offspringEl    = document.getElementById('inspector-offspring');
    this.speedEl        = document.getElementById('inspector-speed');
    this.lineageEl      = document.getElementById('inspector-lineage');

    this.rewardLifetimeEl   = document.getElementById('inspector-reward-lifetime');
    this.rewardRateEl       = document.getElementById('inspector-reward-rate');
    this.rewardSparkCanvas  = document.getElementById('inspector-reward-spark') as HTMLCanvasElement | null;
    this.rewardSparkCtx     = this.rewardSparkCanvas?.getContext('2d') ?? null;

    if (this.rewardSparkCanvas) {
      this.rewardSparkCanvas.width = 188;
      this.rewardSparkCanvas.height = 24;
    }
  }

  // ──────────────────────────────────────────────
  // SELECT / DESELECT
  // ──────────────────────────────────────────────

  select(cube: Cube | null): void {
    this.selectedCube = cube;
    if (this.panel) {
      this.panel.classList.toggle('visible', cube !== null);
    }
  }

  // ──────────────────────────────────────────────
  // UPDATE — called every frame when a cube is selected
  // ──────────────────────────────────────────────

  update(): void {
    const cube = this.selectedCube;
    if (!cube || !this.panel?.classList.contains('visible')) return;

    // Title
    if (this.titleEl) this.titleEl.textContent = `CUBE #${cube.id}`;

    // Energy
    const energyPct = Math.round((cube.energy / cube.maxEnergy) * 100);
    if (this.energyFillEl) this.energyFillEl.style.width = `${energyPct}%`;
    if (this.energyTextEl) this.energyTextEl.textContent = `${Math.floor(cube.energy)}/${cube.maxEnergy}`;

    // Stats
    if (this.ageEl)       this.ageEl.textContent       = formatTicks(cube.age);
    if (this.genEl)       this.genEl.textContent        = String(cube.generation);
    if (this.eraEl)       this.eraEl.textContent        = String(cube.era + 1);
    if (this.stateEl)     this.stateEl.textContent      = cube.state.toUpperCase();
    if (this.foodEl)      this.foodEl.textContent       = String(cube.foodEaten);
    if (this.offspringEl) this.offspringEl.textContent  = String(cube.offspringCount);

    // Speed
    const speed = Math.sqrt(cube.velocity.x ** 2 + cube.velocity.z ** 2).toFixed(3);
    if (this.speedEl) this.speedEl.textContent = `${speed} u/t`;

    // Lineage
    if (this.lineageEl) {
      const chain = [cube.id, ...cube.lineage.slice(0, 5)];
      this.lineageEl.textContent = chain.map(id => `#${id}`).join(' <- ');
    }

    // Brain visualization
    this.drawBrainVisualization();

    // Reward section
    this._updateRewardSection(cube);
  }

  // ──────────────────────────────────────────────
  // NEURAL NETWORK VISUALIZATION
  // ──────────────────────────────────────────────

  // ──────────────────────────────────────────────
  // REWARD SCORE SECTION
  // ──────────────────────────────────────────────

  private _updateRewardSection(cube: Cube): void {
    // Lifetime score
    if (this.rewardLifetimeEl) {
      const sign = cube.lifetimeRewardScore >= 0 ? '+' : '';
      this.rewardLifetimeEl.textContent = `${sign}${cube.lifetimeRewardScore.toFixed(1)}`;
      this.rewardLifetimeEl.style.color = cube.lifetimeRewardScore >= 0
        ? 'var(--green, #00ff88)'
        : 'var(--danger, #ff6b9d)';
    }

    // Recent reward rate
    if (this.rewardRateEl) {
      const rate = cube.recentRewardRate;
      const sign = rate >= 0 ? '+' : '';
      this.rewardRateEl.textContent = `${sign}${rate.toFixed(3)}`;
      this.rewardRateEl.style.color = rate >= 0
        ? 'var(--green, #00ff88)'
        : 'var(--danger, #ff6b9d)';
    }

    // Sparkline of reward history
    this._drawRewardSparkline(cube.getRewardHistory());
  }

  private _drawRewardSparkline(history: number[]): void {
    const ctx = this.rewardSparkCtx;
    const canvas = this.rewardSparkCanvas;
    if (!ctx || !canvas || history.length < 2) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);

    // Find range
    let minVal = Math.min(...history);
    let maxVal = Math.max(...history);
    const range = maxVal - minVal;

    // Normalize: ensure at least a small range to avoid flat line
    if (range < 0.001) {
      minVal -= 0.01;
      maxVal += 0.01;
    }
    const safeRange = maxVal - minVal;

    // Draw zero line
    const zeroY = H - ((0 - minVal) / safeRange) * H;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(W, zeroY);
    ctx.stroke();

    // Draw sparkline
    const step = W / (history.length - 1);
    ctx.lineWidth = 1.2;

    // Use gradient: above zero = green, below = red
    for (let i = 0; i < history.length - 1; i++) {
      const x0 = i * step;
      const x1 = (i + 1) * step;
      const y0 = H - ((history[i]! - minVal) / safeRange) * H;
      const y1 = H - ((history[i + 1]! - minVal) / safeRange) * H;

      const avgVal = ((history[i] ?? 0) + (history[i + 1] ?? 0)) / 2;
      ctx.strokeStyle = avgVal >= 0
        ? `rgba(0,255,136,${0.4 + Math.abs(avgVal) * 0.6})`
        : `rgba(255,107,157,${0.4 + Math.abs(avgVal) * 0.6})`;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  // ──────────────────────────────────────────────
  // NEURAL NETWORK VISUALIZATION
  // ──────────────────────────────────────────────

  private drawBrainVisualization(): void {
    const cube = this.selectedCube;
    const ctx = this.brainCtx;
    if (!cube || !ctx || !this.brainCanvas) return;

    const W = this.brainCanvas.width;
    const H = this.brainCanvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);

    const activations = cube.brain.getActivations();
    const layers = [
      { neurons: cube.lastSensorInputs, x: W * 0.1 },
      { neurons: activations.h1,        x: W * 0.37 },
      { neurons: activations.h2,        x: W * 0.63 },
      { neurons: activations.out,       x: W * 0.9  },
    ];

    const maxNeurons = Math.max(...layers.map(l => l.neurons.length));

    // Draw connections (subset for performance)
    ctx.lineWidth = 0.4;
    for (let li = 0; li < layers.length - 1; li++) {
      const layerA = layers[li];
      const layerB = layers[li + 1];
      const stepA = H / (layerA.neurons.length + 1);
      const stepB = H / (layerB.neurons.length + 1);

      // Draw only a sample of connections to avoid clutter
      const sampleA = Math.min(layerA.neurons.length, 6);
      const sampleB = Math.min(layerB.neurons.length, 6);
      for (let a = 0; a < sampleA; a++) {
        const idxA = Math.floor(a * layerA.neurons.length / sampleA);
        const yA = stepA * (idxA + 1);
        for (let b = 0; b < sampleB; b++) {
          const idxB = Math.floor(b * layerB.neurons.length / sampleB);
          const yB = stepB * (idxB + 1);
          const strength = Math.abs((layerA.neurons[idxA] ?? 0) + (layerB.neurons[idxB] ?? 0)) / 2;
          ctx.strokeStyle = `rgba(0,255,200,${strength * 0.15})`;
          ctx.beginPath();
          ctx.moveTo(layerA.x, yA);
          ctx.lineTo(layerB.x, yB);
          ctx.stroke();
        }
      }
    }

    // Draw neurons
    for (const layer of layers) {
      const step = H / (layer.neurons.length + 1);
      const displayCount = Math.min(layer.neurons.length, 16);
      const skip = Math.max(1, Math.floor(layer.neurons.length / displayCount));

      for (let i = 0; i < displayCount; i++) {
        const srcIdx = i * skip;
        const y = step * (i + 1);
        const activation = Math.abs(layer.neurons[srcIdx] ?? 0);
        const radius = 3 + activation * 2;

        // Color: teal for positive, pink for negative
        const raw = layer.neurons[srcIdx] ?? 0;
        const r = raw < 0 ? Math.floor(255 * Math.abs(raw)) : 0;
        const g = raw > 0 ? Math.floor(255 * raw) : 0;
        const b = raw > 0 ? Math.floor(200 * raw) : 0;

        ctx.beginPath();
        ctx.arc(layer.x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.3 + activation * 0.7})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(0,255,200,${activation * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
}
