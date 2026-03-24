// ============================================================
// CUBE GENESIS — Debug Utilities
// Optional debug overlays, performance counters, logging.
// All debug output is gated behind DEBUG_ENABLED to ensure
// zero overhead in production builds.
// ============================================================

import * as THREE from 'three';

// ──────────────────────────────────────────────
// DEBUG FLAG
// Set to true to enable all debug overlays.
// In production, this should always be false.
// ──────────────────────────────────────────────
export let DEBUG_ENABLED = false;

export function enableDebug(): void {
  DEBUG_ENABLED = true;
  console.log('[DEBUG] Debug mode enabled');
}

export function disableDebug(): void {
  DEBUG_ENABLED = false;
}

export function toggleDebug(): void {
  DEBUG_ENABLED = !DEBUG_ENABLED;
  console.log(`[DEBUG] Debug mode ${DEBUG_ENABLED ? 'enabled' : 'disabled'}`);
}

// ──────────────────────────────────────────────
// FRAME TIMING / FPS COUNTER
// ──────────────────────────────────────────────

export class FPSCounter {
  private frameTimes: number[] = [];
  private lastTime: number = 0;
  private _fps: number = 0;
  private _frameTime: number = 0;
  private sampleWindow: number;

  constructor(sampleWindow: number = 60) {
    this.sampleWindow = sampleWindow;
  }

  tick(now: number): void {
    const delta = now - this.lastTime;
    this.lastTime = now;

    if (delta > 0) {
      this.frameTimes.push(delta);
      if (this.frameTimes.length > this.sampleWindow) {
        this.frameTimes.shift();
      }

      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this._frameTime = avg;
      this._fps = 1000 / avg;
    }
  }

  get fps(): number { return this._fps; }
  get frameTime(): number { return this._frameTime; }

  toString(): string {
    return `${this._fps.toFixed(1)} fps (${this._frameTime.toFixed(2)} ms)`;
  }
}

// ──────────────────────────────────────────────
// PERFORMANCE TIMER
// Measures time spent in named code sections.
// ──────────────────────────────────────────────

export class PerformanceTimer {
  private timings: Map<string, number> = new Map();
  private starts: Map<string, number> = new Map();

  begin(label: string): void {
    this.starts.set(label, performance.now());
  }

  end(label: string): void {
    const start = this.starts.get(label);
    if (start === undefined) return;
    const elapsed = performance.now() - start;

    // Exponential moving average for stability
    const prev = this.timings.get(label) ?? elapsed;
    this.timings.set(label, prev * 0.9 + elapsed * 0.1);
    this.starts.delete(label);
  }

  get(label: string): number {
    return this.timings.get(label) ?? 0;
  }

  getSummary(): string {
    const entries = Array.from(this.timings.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, ms]) => `  ${label}: ${ms.toFixed(2)}ms`);
    return entries.join('\n');
  }

  reset(): void {
    this.timings.clear();
    this.starts.clear();
  }
}

// ──────────────────────────────────────────────
// DEBUG OVERLAY (HTML DOM)
// ──────────────────────────────────────────────

let debugPanel: HTMLDivElement | null = null;

export function initDebugPanel(): void {
  if (!DEBUG_ENABLED) return;

  debugPanel = document.createElement('div');
  debugPanel.id = 'debug-panel';
  debugPanel.style.cssText = `
    position: fixed;
    top: 100px;
    left: 20px;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid rgba(255, 255, 0, 0.3);
    border-radius: 4px;
    padding: 10px 14px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: #ffff00;
    z-index: 999;
    pointer-events: none;
    min-width: 200px;
    line-height: 1.8;
    white-space: pre;
  `;
  document.body.appendChild(debugPanel);
}

export function updateDebugPanel(lines: string[]): void {
  if (!DEBUG_ENABLED || !debugPanel) return;
  debugPanel.textContent = lines.join('\n');
}

export function destroyDebugPanel(): void {
  if (debugPanel) {
    debugPanel.remove();
    debugPanel = null;
  }
}

// ──────────────────────────────────────────────
// THREE.JS DEBUG HELPERS
// ──────────────────────────────────────────────

// Draw an axis-aligned bounding box around a given center + size
export function createDebugBox(
  cx: number, cy: number, cz: number,
  w: number, h: number, d: number,
  color: number = 0xffff00
): THREE.LineSegments {
  const geo = new THREE.BoxGeometry(w, h, d);
  const edges = new THREE.EdgesGeometry(geo);
  const mat = new THREE.LineBasicMaterial({ color });
  const box = new THREE.LineSegments(edges, mat);
  box.position.set(cx, cy, cz);
  return box;
}

// Draw a circle in the XZ plane (for showing vision/attack radius)
export function createDebugCircle(
  cx: number, cz: number,
  radius: number,
  segments: number = 32,
  color: number = 0x00ffff
): THREE.Line {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      cx + Math.cos(angle) * radius,
      0.1,
      cz + Math.sin(angle) * radius
    ));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
  return new THREE.Line(geo, mat);
}

// Draw a vector arrow from a point (for velocity visualization)
export function createDebugArrow(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  length: number = 3,
  color: number = 0xff0000
): THREE.ArrowHelper {
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const origin = new THREE.Vector3(ox, oy, oz);
  return new THREE.ArrowHelper(dir, origin, length, color, 0.5, 0.3);
}

// ──────────────────────────────────────────────
// SPATIAL HASH DEBUG VISUALIZATION
// Shows grid cells that contain entities
// ──────────────────────────────────────────────

export function createSpatialHashOverlay(
  cellSize: number,
  worldSize: number,
  activeCells: Set<string>
): THREE.Group {
  const group = new THREE.Group();
  const half = worldSize / 2;

  activeCells.forEach(key => {
    const [gx, gz] = key.split(',').map(Number);
    const cx = gx * cellSize + cellSize / 2 - half;
    const cz = gz * cellSize + cellSize / 2 - half;

    const geo = new THREE.PlaneGeometry(cellSize - 0.2, cellSize - 0.2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0.05, cz);
    group.add(mesh);
  });

  return group;
}

// ──────────────────────────────────────────────
// CONSOLE LOGGING (gated)
// ──────────────────────────────────────────────

export function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG_ENABLED) {
    console.log(`[CG] ${message}`, ...args);
  }
}

export function debugWarn(message: string, ...args: unknown[]): void {
  if (DEBUG_ENABLED) {
    console.warn(`[CG] ${message}`, ...args);
  }
}

export function debugError(message: string, ...args: unknown[]): void {
  // Errors always log regardless of debug flag
  console.error(`[CG ERROR] ${message}`, ...args);
}

// ──────────────────────────────────────────────
// ASSERTION
// ──────────────────────────────────────────────

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    debugError(`Assertion failed: ${message}`);
    if (DEBUG_ENABLED) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }
}

// ──────────────────────────────────────────────
// GLOBAL TIMER INSTANCE
// ──────────────────────────────────────────────

export const perfTimer = new PerformanceTimer();
export const fpsCounter = new FPSCounter(60);
