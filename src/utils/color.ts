// ============================================================
// CUBE GENESIS — Color Utilities
// HSL generation, generation-based palettes, color conversion
// ============================================================

import * as THREE from 'three';

// ──────────────────────────────────────────────
// RAW COLOR MATH
// ──────────────────────────────────────────────

export interface HSL {
  h: number; // [0, 360]
  s: number; // [0, 100]
  l: number; // [0, 100]
}

export interface RGB {
  r: number; // [0, 255]
  g: number; // [0, 255]
  b: number; // [0, 255]
}

// HSL to RGB conversion
export function hslToRgb(h: number, s: number, l: number): RGB {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60)        { r = c; g = x; b = 0; }
  else if (h < 120)  { r = x; g = c; b = 0; }
  else if (h < 180)  { r = 0; g = c; b = x; }
  else if (h < 240)  { r = 0; g = x; b = c; }
  else if (h < 300)  { r = x; g = 0; b = c; }
  else               { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// RGB to hex string
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Hex string to THREE.Color
export function hexToThreeColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

// HSL to THREE.Color
export function hslToThreeColor(h: number, s: number, l: number): THREE.Color {
  // THREE.Color.setHSL uses normalized [0,1] values
  return new THREE.Color().setHSL(h / 360, s / 100, l / 100);
}

// ──────────────────────────────────────────────
// GENERATION-BASED COLOR PALETTE
// Each lineage gets a hue offset based on its parent ID.
// Offspring shift hue slightly so related cubes look similar.
// ──────────────────────────────────────────────

// The "root" hue for the first cube
const ROOT_HUE = 180; // teal-cyan (matches the HUD aesthetic)
const HUE_SHIFT_PER_LINEAGE = 37; // golden-ratio-ish offset for distinct lineages
const HUE_VARIATION_PER_GEN = 3;  // subtle drift per generation within lineage

/**
 * Compute a generation-based color for a cube.
 * @param lineageId  Unique identifier for the lineage branch (e.g., root cube's id)
 * @param generation Current generation of this cube
 * @returns THREE.Color for the cube's tint
 */
export function generationColor(lineageId: number, generation: number): THREE.Color {
  // Rotate hue based on lineage to give each family a distinct tint
  const baseHue = (ROOT_HUE + lineageId * HUE_SHIFT_PER_LINEAGE) % 360;
  // Drift within the family as generations progress
  const hue = (baseHue + generation * HUE_VARIATION_PER_GEN) % 360;
  // High saturation, slightly above mid lightness for a vibrant look
  return hslToThreeColor(hue, 60, 70);
}

/**
 * Compute the emissive glow color for a cube based on energy level.
 * @param energyFraction energy / maxEnergy in [0, 1]
 * @returns THREE.Color for emissive glow
 */
export function cubeGlowColor(energyFraction: number): THREE.Color {
  // At full energy: bright teal (#00ffc8)
  // At low energy: dim dark teal
  const intensity = Math.max(0.05, energyFraction);
  return new THREE.Color().setHSL(168 / 360, 1.0, intensity * 0.5);
}

/**
 * Attacker color that escalates with wave number (Wave 1 = dark red, Wave 6 = vivid red).
 * @param waveIndex 0-based index of attacker wave
 */
export function attackerColor(waveIndex: number): THREE.Color {
  // Wave 0 (Drifters): dark red #8b0000
  // Wave 5 (Swarm):    vivid red #ff0033
  const lightness = 25 + waveIndex * 8; // 25% → 65%
  return hslToThreeColor(350, 100, Math.min(lightness, 60));
}

/**
 * Food color — bright green, slight variation by value
 * @param valueFraction food value / max food value [0,1]
 */
export function foodColor(valueFraction: number): THREE.Color {
  const lightness = 45 + valueFraction * 15; // 45–60% lightness
  return hslToThreeColor(150, 100, lightness);
}

/**
 * Era flash color (for era transition overlay)
 * @param eraIndex 0-based era index
 */
export function eraFlashColor(eraIndex: number): string {
  const colors = [
    '#00ffc8', // Era 1 — teal
    '#00aaff', // Era 2 — blue
    '#aa00ff', // Era 3 — purple
    '#ffaa00', // Era 4 — gold
    '#ffffff', // Era 5 — white
    '#ff88ff', // Era 6 — prismatic
  ];
  return colors[Math.min(eraIndex, colors.length - 1)];
}

/**
 * Structure emissive color (cyan accent with slight variation by type)
 */
export function structureEmissiveColor(structureType: 'wall' | 'shelter' | 'beacon'): THREE.Color {
  switch (structureType) {
    case 'wall':    return new THREE.Color(0x004433);
    case 'shelter': return new THREE.Color(0x00bbcc);
    case 'beacon':  return new THREE.Color(0x00ffc8);
  }
}

/**
 * Trail color — fading teal
 * @param ageFraction how old this trail segment is [0 = newest, 1 = oldest]
 */
export function trailColor(ageFraction: number): THREE.Color {
  const alpha = (1 - ageFraction) * 0.3; // 0–30% opacity
  // We encode alpha into lightness since THREE.Color has no alpha
  return new THREE.Color().setHSL(168 / 360, 1.0, alpha * 0.5);
}

/**
 * Settlement glow color based on number of nearby structures
 * @param structureCount how many structures form the settlement
 */
export function settlementGlowColor(structureCount: number): THREE.Color {
  // More structures = brighter and slightly warmer teal
  const intensity = Math.min(structureCount / 20, 1.0);
  const hue = 168 - intensity * 10; // slight shift toward blue-green at high density
  return new THREE.Color().setHSL(hue / 360, 1.0, 0.2 + intensity * 0.3);
}

// ──────────────────────────────────────────────
// COLOR INTERPOLATION
// ──────────────────────────────────────────────

/**
 * Linearly interpolate between two THREE.Colors
 */
export function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );
}

/**
 * Convert a numeric hex value (0xRRGGBB) to CSS hex string
 */
export function numericHexToString(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/**
 * Convert a THREE.Color to CSS hex string
 */
export function threeColorToHex(color: THREE.Color): string {
  return '#' + color.getHexString();
}

// Palette used for event log entries in the UI (CSS color strings)
export const EVENT_COLORS = {
  birth:   '#00ff88',
  death:   '#ff6b9d',
  era:     '#ffd700',
  event:   'rgba(0, 255, 200, 0.7)',
  threat:  '#ff2244',
} as const;

export type EventColorKey = keyof typeof EVENT_COLORS;
