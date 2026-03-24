// ============================================================
// CUBE GENESIS — Math Utilities
// Vector helpers, seeded PRNG, interpolation, angle math
// ============================================================

// ──────────────────────────────────────────────
// SEEDED PRNG — Mulberry32
// Fast, high-quality 32-bit generator.
// Returns a function () => number in [0, 1).
// ──────────────────────────────────────────────

export function createPRNG(seed: number): () => number {
  let s = seed >>> 0;
  return function mulberry32(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

// Global PRNG instance (initialized in main.ts with config seed)
let _globalRNG: () => number = Math.random;

export function initGlobalRNG(seed: number | null): void {
  const s = seed ?? Date.now();
  _globalRNG = createPRNG(s);
}

export function rng(): number {
  return _globalRNG();
}

// ──────────────────────────────────────────────
// BASIC MATH
// ──────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return clamp((value - a) / (b - a), 0, 1);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function randomRange(min: number, max: number, prng: () => number = rng): number {
  return min + prng() * (max - min);
}

export function randomInt(min: number, max: number, prng: () => number = rng): number {
  return Math.floor(randomRange(min, max + 1, prng));
}

export function randomSign(prng: () => number = rng): number {
  return prng() < 0.5 ? -1 : 1;
}

// Gaussian noise using Box-Muller transform
export function gaussianNoise(mean: number = 0, sigma: number = 1, prng: () => number = rng): number {
  let u = 0, v = 0;
  while (u === 0) u = prng();
  while (v === 0) v = prng();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + sigma * z;
}

// ──────────────────────────────────────────────
// ANGLE MATH
// ──────────────────────────────────────────────

export const TWO_PI = Math.PI * 2;

// Normalize angle to [-PI, PI]
export function normalizeAngle(angle: number): number {
  let a = angle % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

// Shortest angular difference from 'from' to 'to', result in [-PI, PI]
export function angleDiff(from: number, to: number): number {
  return normalizeAngle(to - from);
}

// Angle from point (x1,z1) to point (x2,z2) in XZ plane (Y is up)
export function angleToPoint(x1: number, z1: number, x2: number, z2: number): number {
  return Math.atan2(x2 - x1, z2 - z1);
}

// Signed angle difference from facing direction to a target angle, normalized to [-1, 1]
// Positive = turn left (CCW), Negative = turn right (CW)
export function relativeAngle(facing: number, targetAngle: number): number {
  return normalizeAngle(targetAngle - facing) / Math.PI;
}

// Angle from one XZ position toward another, returned as the XZ angle in radians
export function directionTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

// ──────────────────────────────────────────────
// 2D / 3D DISTANCE
// ──────────────────────────────────────────────

export function distance2D(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distance2DSq(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return dx * dx + dz * dz;
}

export function distance3D(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ──────────────────────────────────────────────
// VECTOR3-LIKE OPERATIONS (plain objects, no Three.js)
// Used for internal simulation math before rendering.
// ──────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x: number = 0, y: number = 0, z: number = 0): Vec3 {
  return { x, y, z };
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3LengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vec3Length(v: Vec3): number {
  return Math.sqrt(vec3LengthSq(v));
}

export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

export function vec3Clone(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function vec3DistanceSq(a: Vec3, b: Vec3): number {
  return distance2DSq(a.x, a.z, b.x, b.z);
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  return distance2D(a.x, a.z, b.x, b.z);
}

// Forward direction vector from a facing angle (XZ plane)
export function facingVector(angle: number): Vec3 {
  return { x: Math.sin(angle), y: 0, z: Math.cos(angle) };
}

// ──────────────────────────────────────────────
// NORMALIZATION HELPERS (for neural network inputs)
// ──────────────────────────────────────────────

// Normalize distance to [0, 1] given max range (returns 1 if not found/max)
export function normalizeDistance(dist: number, maxRange: number): number {
  return clamp(dist / maxRange, 0, 1);
}

// Normalize a value to [0, 1] given min/max
export function normalizeValue(value: number, min: number, max: number): number {
  return clamp((value - min) / (max - min), 0, 1);
}

// ──────────────────────────────────────────────
// RANDOM POSITION HELPERS
// ──────────────────────────────────────────────

export function randomPositionInWorld(worldSize: number, prng: () => number = rng): { x: number; z: number } {
  const half = worldSize / 2;
  return {
    x: randomRange(-half, half, prng),
    z: randomRange(-half, half, prng),
  };
}

export function randomPositionNear(
  cx: number,
  cz: number,
  radius: number,
  worldSize: number,
  prng: () => number = rng
): { x: number; z: number } {
  const half = worldSize / 2;
  const angle = randomRange(0, TWO_PI, prng);
  const dist = randomRange(0, radius, prng);
  return {
    x: clamp(cx + Math.cos(angle) * dist, -half, half),
    z: clamp(cz + Math.sin(angle) * dist, -half, half),
  };
}

// ──────────────────────────────────────────────
// EASING
// ──────────────────────────────────────────────

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeIn(t: number): number {
  return t * t;
}

// ──────────────────────────────────────────────
// MISC
// ──────────────────────────────────────────────

export function formatTicks(ticks: number): string {
  if (ticks < 1000) return ticks.toString();
  if (ticks < 1_000_000) return (ticks / 1000).toFixed(1) + 'k';
  return (ticks / 1_000_000).toFixed(2) + 'M';
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

// Pick a random element from an array
export function randomChoice<T>(arr: T[], prng: () => number = rng): T {
  return arr[Math.floor(prng() * arr.length)];
}

// Shuffle array in place (Fisher-Yates)
export function shuffle<T>(arr: T[], prng: () => number = rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Rolling average helper
export class RollingAverage {
  private buffer: Float32Array;
  private head: number = 0;
  private count: number = 0;
  private sum: number = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  push(value: number): void {
    if (this.count === this.capacity) {
      // Overwrite oldest
      this.sum -= this.buffer[this.head];
    } else {
      this.count++;
    }
    this.buffer[this.head] = value;
    this.sum += value;
    this.head = (this.head + 1) % this.capacity;
  }

  get average(): number {
    if (this.count === 0) return 0;
    return this.sum / this.count;
  }

  get filled(): number {
    return this.count;
  }

  reset(): void {
    this.buffer.fill(0);
    this.head = 0;
    this.count = 0;
    this.sum = 0;
  }
}
