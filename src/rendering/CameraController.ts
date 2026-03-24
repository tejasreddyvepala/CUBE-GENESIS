// ============================================================
// CUBE GENESIS — Camera Controller
// Auto-orbit, manual drag, follow mode, zoom.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { Cube } from '../entities/Cube.ts';
import { clamp } from '../utils/math.ts';

export class CameraController {
  camera: THREE.PerspectiveCamera;
  autoOrbit: boolean = true;
  orbitAngle: number = 0;
  orbitElevation: number = CONFIG.CAMERA_DEFAULT_ELEVATION;
  orbitRadius: number = CONFIG.CAMERA_DEFAULT_DISTANCE;
  orbitTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  followTarget: Cube | null = null;
  private followPos: THREE.Vector3 = new THREE.Vector3();
  private followLookAt: THREE.Vector3 = new THREE.Vector3();

  // Best-cam mode — auto-follows the top-performing cube
  followBestMode: boolean = false;
  private _bestRefreshTimer: number = 0;
  private readonly BEST_REFRESH_INTERVAL = 90; // frames between best-cube re-evaluations

  // Cycle mode — index into sorted-by-id alive cube list
  private _cycleIndex: number = -1;

  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  private canvas: HTMLCanvasElement | null = null;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  // ──────────────────────────────────────────────
  // MOUSE / TOUCH CONTROLS
  // ──────────────────────────────────────────────

  setupMouseControls(canvas: HTMLCanvasElement, onClickCube?: (x: number, y: number) => void): void {
    this.canvas = canvas;

    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isDragging) return;
      const moved = Math.abs(e.clientX - this.lastMouseX) + Math.abs(e.clientY - this.lastMouseY);
      if (moved < 4) {
        // Treat as click
        onClickCube?.(e.clientX, e.clientY);
      }
      this.isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.orbitAngle += dx * 0.005;
      this.orbitElevation = clamp(
        this.orbitElevation + dy * 0.005,
        0.05,
        Math.PI / 2 - 0.05
      );
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.autoOrbit = false;
    });

    canvas.addEventListener('wheel', (e) => {
      this.orbitRadius = clamp(
        this.orbitRadius + e.deltaY * 0.1,
        CONFIG.CAMERA_MIN_DISTANCE,
        CONFIG.CAMERA_MAX_DISTANCE
      );
    }, { passive: true });

    canvas.addEventListener('dblclick', () => {
      this.returnToAutoOrbit();
    });
  }

  // ──────────────────────────────────────────────
  // KEYBOARD CONTROLS
  // ──────────────────────────────────────────────

  setupKeyboardControls(getCubes: () => Cube[]): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.followTarget) {
          this.returnToAutoOrbit();
        } else {
          this.followNearest(getCubes());
        }
      }
    });
  }

  // ──────────────────────────────────────────────
  // UPDATE — called every frame
  // ──────────────────────────────────────────────

  update(deltaTime: number, cubes: Cube[]): void {
    // Best-cam mode: periodically re-evaluate which cube to follow
    if (this.followBestMode) {
      this._bestRefreshTimer++;
      if (this._bestRefreshTimer >= this.BEST_REFRESH_INTERVAL || !this.followTarget) {
        this._bestRefreshTimer = 0;
        this._pickBestCube(cubes);
      }
    }

    if (this.followTarget) {
      const isAlive = cubes.some(c => c.id === this.followTarget!.id);
      if (!isAlive) {
        if (this.followBestMode) {
          // Best cube died — immediately switch to next best
          this._pickBestCube(cubes);
        } else {
          // Cycle mode: advance to next alive cube
          this._advanceCycle(cubes);
        }
      }
      if (this.followTarget) {
        this._updateFollowMode(deltaTime);
        return;
      }
    }

    if (this.autoOrbit) {
      this.orbitAngle += CONFIG.CAMERA_AUTO_ORBIT_SPEED * deltaTime * 1000;
    }

    this._updateOrbitCamera();
  }

  private _updateOrbitCamera(): void {
    const x = this.orbitRadius * Math.sin(this.orbitElevation) * Math.sin(this.orbitAngle);
    const y = this.orbitRadius * Math.cos(this.orbitElevation);
    const z = this.orbitRadius * Math.sin(this.orbitElevation) * Math.cos(this.orbitAngle);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.orbitTarget);
  }

  private _updateFollowMode(deltaTime: number): void {
    const target = this.followTarget!;
    const offsetBack = CONFIG.CAMERA_FOLLOW_OFFSET_BACK;
    const offsetY = CONFIG.CAMERA_FOLLOW_OFFSET_Y;

    // Position: behind and above the cube
    const targetCamX = target.position.x - Math.sin(target.direction) * offsetBack;
    const targetCamY = target.position.y + offsetY;
    const targetCamZ = target.position.z - Math.cos(target.direction) * offsetBack;

    this.followPos.set(targetCamX, targetCamY, targetCamZ);
    this.followLookAt.set(target.position.x, target.position.y + 1, target.position.z);

    // Smooth interpolation
    const lf = 1 - Math.pow(1 - CONFIG.CAMERA_LERP_FACTOR, deltaTime * 60);
    this.camera.position.lerp(this.followPos, lf);
    this.camera.lookAt(this.followLookAt);
  }

  // ──────────────────────────────────────────────
  // FOLLOW CONTROL
  // ──────────────────────────────────────────────

  followNearest(cubes: Cube[]): void {
    if (cubes.length === 0) return;
    const best = cubes.reduce((a, b) => a.fitness > b.fitness ? a : b);
    this.followTarget = best;
    this.autoOrbit = false;
  }

  followCube(cube: Cube): void {
    this.followBestMode = false;
    this._cycleIndex = -1;
    this.followTarget = cube;
    this.autoOrbit = false;
  }

  // ── BEST CAM ──────────────────────────────────

  toggleFollowBest(cubes: Cube[]): void {
    this.followBestMode = !this.followBestMode;
    if (this.followBestMode) {
      this.autoOrbit = false;
      this._cycleIndex = -1;
      this._bestRefreshTimer = this.BEST_REFRESH_INTERVAL; // trigger immediately
    } else {
      this.returnToAutoOrbit();
    }
  }

  private _pickBestCube(cubes: Cube[]): void {
    if (cubes.length === 0) { this.followTarget = null; return; }
    let best = cubes[0]!;
    for (const c of cubes) {
      if (c.recentRewardRate > best.recentRewardRate) best = c;
    }
    this.followTarget = best;
  }

  // ── CYCLE THROUGH CUBES ───────────────────────

  cycleNext(cubes: Cube[]): void {
    if (cubes.length === 0) return;
    this.followBestMode = false;
    this.autoOrbit = false;

    // Sort by ID for a stable order the user can mentally track
    const sorted = [...cubes].sort((a, b) => a.id - b.id);

    if (this._cycleIndex < 0 || !this.followTarget) {
      // First press: find the current follow target in the sorted list, or start at 0
      const currentIdx = this.followTarget
        ? sorted.findIndex(c => c.id === this.followTarget!.id)
        : -1;
      this._cycleIndex = (currentIdx + 1) % sorted.length;
    } else {
      this._cycleIndex = (this._cycleIndex + 1) % sorted.length;
    }

    this.followTarget = sorted[this._cycleIndex]!;
  }

  private _advanceCycle(cubes: Cube[]): void {
    if (cubes.length === 0) { this.followTarget = null; return; }
    const sorted = [...cubes].sort((a, b) => a.id - b.id);
    this._cycleIndex = this._cycleIndex % sorted.length;
    this.followTarget = sorted[this._cycleIndex]!;
  }

  // Returns a display label for the current follow state
  getFollowLabel(): string {
    if (this.followBestMode && this.followTarget) {
      return `BEST CAM · #${this.followTarget.id}`;
    }
    if (this.followTarget) {
      return `CAM · #${this.followTarget.id}`;
    }
    return '';
  }

  returnToAutoOrbit(): void {
    this.followTarget = null;
    this.followBestMode = false;
    this._cycleIndex = -1;
    this.autoOrbit = true;

    // Snap orbit back to current camera position
    const pos = this.camera.position;
    this.orbitRadius = pos.length();
    this.orbitElevation = Math.acos(clamp(pos.y / this.orbitRadius, -1, 1));
    this.orbitAngle = Math.atan2(pos.x, pos.z);
  }

  // ──────────────────────────────────────────────
  // RESIZE
  // ──────────────────────────────────────────────

  handleResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
