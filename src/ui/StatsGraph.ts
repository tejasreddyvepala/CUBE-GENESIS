// ============================================================
// CUBE GENESIS — Stats Graphs
// Mini sparkline graphs (toggled with G key).
// ============================================================

export class StatsGraph {
  visible: boolean = false;
  private graphPanel: HTMLElement | null;
  private canvases: Record<string, HTMLCanvasElement | null> = {};

  constructor() {
    this.graphPanel = document.getElementById('hud-graphs');
    this.canvases = {
      population: document.getElementById('graph-population') as HTMLCanvasElement | null,
      fitness:    document.getElementById('graph-fitness')    as HTMLCanvasElement | null,
      food:       document.getElementById('graph-food')       as HTMLCanvasElement | null,
      kdr:        document.getElementById('graph-kd')         as HTMLCanvasElement | null,
    };

    // Set canvas resolutions
    for (const [, canvas] of Object.entries(this.canvases)) {
      if (canvas) {
        canvas.width = 180;
        canvas.height = 36;
      }
    }
  }

  // ──────────────────────────────────────────────
  // DRAW
  // ──────────────────────────────────────────────

  draw(statsHistory: {
    population: number[];
    avgFitness: number[];
    foodSupply: number[];
    killDeathRatio: number[];
  }): void {
    if (!this.visible) return;

    this._drawSparkline(this.canvases.population, statsHistory.population, '#00ffc8');
    this._drawSparkline(this.canvases.fitness,    statsHistory.avgFitness,  '#ffd700');
    this._drawSparkline(this.canvases.food,       statsHistory.foodSupply,  '#00ff88');
    this._drawSparkline(this.canvases.kdr,        statsHistory.killDeathRatio, '#ff2244');
  }

  private _drawSparkline(canvas: HTMLCanvasElement | null, data: number[], color: string): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (data.length < 2) return;

    const max = Math.max(...data, 1);
    const min = 0;
    const range = max - min || 1;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;

    const step = W / (data.length - 1);
    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = H - ((data[i] - min) / range) * (H - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under line
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = color.replace('#', 'rgba(').replace(/(..)(..)(..)/, (_, r, g, b) =>
      `${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)}`) + ',0.1)';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ──────────────────────────────────────────────
  // TOGGLE
  // ──────────────────────────────────────────────

  toggle(): void {
    this.visible = !this.visible;
    if (this.graphPanel) {
      this.graphPanel.classList.toggle('visible', this.visible);
    }
  }

  show(): void {
    this.visible = true;
    this.graphPanel?.classList.add('visible');
  }

  hide(): void {
    this.visible = false;
    this.graphPanel?.classList.remove('visible');
  }
}
