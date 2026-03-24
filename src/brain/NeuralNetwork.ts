// ============================================================
// CUBE GENESIS — Feedforward Neural Network
//
// Architecture: [14, 20, 16, 8]
//   - Input:   14 neurons (sensory inputs)
//   - Hidden1: 20 neurons (tanh activation)
//   - Hidden2: 16 neurons (tanh activation)
//   - Output:  8 neurons  (tanh activation)
//
// Weight layout (flat Float32Array):
//   [W_IH1 (14×20), B_H1 (20), W_H1H2 (20×16), B_H2 (16), W_H2O (16×8), B_O (8)]
//
// Total weights: 280 + 20 + 320 + 16 + 128 + 8 = 772
// ============================================================

import { CONFIG } from '../config.ts';

// Tanh activation (used on all layers for [-1, 1] outputs)
function tanh(x: number): number {
  // Use native Math.tanh for speed
  return Math.tanh(x);
}

export class NeuralNetwork {
  // Architecture
  readonly inputSize: number;
  readonly hidden1Size: number;
  readonly hidden2Size: number;
  readonly outputSize: number;

  // Weight matrices stored as flat arrays for cache efficiency
  // W_IH1:  inputSize × hidden1Size
  // B_H1:   hidden1Size
  // W_H1H2: hidden1Size × hidden2Size
  // B_H2:   hidden2Size
  // W_H2O:  hidden2Size × outputSize
  // B_O:    outputSize
  private W_IH1: Float32Array;
  private B_H1: Float32Array;
  private W_H1H2: Float32Array;
  private B_H2: Float32Array;
  private W_H2O: Float32Array;
  private B_O: Float32Array;

  // Activation buffers (reused each forward pass to avoid allocation)
  private A_H1: Float32Array;
  private A_H2: Float32Array;
  private A_OUT: Float32Array;

  // Exposed for reinforcement learning: activations from last forward pass
  readonly lastH1: Float32Array;
  readonly lastH2: Float32Array;
  readonly lastOutput: Float32Array;

  constructor(layers?: readonly number[]) {
    const [inSize, h1Size, h2Size, outSize] = layers ?? CONFIG.BRAIN_LAYERS;
    this.inputSize  = inSize;
    this.hidden1Size = h1Size;
    this.hidden2Size = h2Size;
    this.outputSize = outSize;

    this.W_IH1  = new Float32Array(this.inputSize  * this.hidden1Size);
    this.B_H1   = new Float32Array(this.hidden1Size);
    this.W_H1H2 = new Float32Array(this.hidden1Size * this.hidden2Size);
    this.B_H2   = new Float32Array(this.hidden2Size);
    this.W_H2O  = new Float32Array(this.hidden2Size * this.outputSize);
    this.B_O    = new Float32Array(this.outputSize);

    this.A_H1   = new Float32Array(this.hidden1Size);
    this.A_H2   = new Float32Array(this.hidden2Size);
    this.A_OUT  = new Float32Array(this.outputSize);

    // lastXxx are the SAME buffers — RL learner reads from these
    this.lastH1     = this.A_H1;
    this.lastH2     = this.A_H2;
    this.lastOutput = this.A_OUT;
  }

  // ──────────────────────────────────────────────
  // FORWARD PASS
  // ──────────────────────────────────────────────

  /**
   * Run a forward pass through the network.
   * @param inputs Float32Array of length inputSize
   * @returns Float32Array of length outputSize (same reference each call)
   */
  forward(inputs: Float32Array): Float32Array {
    // ── Layer 1: Input → Hidden1 ──
    for (let j = 0; j < this.hidden1Size; j++) {
      let sum = this.B_H1[j];
      const wOffset = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        sum += this.W_IH1[wOffset + i] * inputs[i];
      }
      this.A_H1[j] = tanh(sum);
    }

    // ── Layer 2: Hidden1 → Hidden2 ──
    for (let k = 0; k < this.hidden2Size; k++) {
      let sum = this.B_H2[k];
      const wOffset = k * this.hidden1Size;
      for (let j = 0; j < this.hidden1Size; j++) {
        sum += this.W_H1H2[wOffset + j] * this.A_H1[j];
      }
      this.A_H2[k] = tanh(sum);
    }

    // ── Layer 3: Hidden2 → Output ──
    for (let o = 0; o < this.outputSize; o++) {
      let sum = this.B_O[o];
      const wOffset = o * this.hidden2Size;
      for (let k = 0; k < this.hidden2Size; k++) {
        sum += this.W_H2O[wOffset + k] * this.A_H2[k];
      }
      this.A_OUT[o] = tanh(sum);
    }

    return this.A_OUT;
  }

  // ──────────────────────────────────────────────
  // WEIGHT SERIALIZATION
  // ──────────────────────────────────────────────

  /**
   * Get all weights as a single flat Float32Array in canonical order:
   * [W_IH1, B_H1, W_H1H2, B_H2, W_H2O, B_O]
   */
  getWeights(): Float32Array {
    const totalSize = this.totalWeightCount();
    const flat = new Float32Array(totalSize);
    let offset = 0;

    flat.set(this.W_IH1,  offset); offset += this.W_IH1.length;
    flat.set(this.B_H1,   offset); offset += this.B_H1.length;
    flat.set(this.W_H1H2, offset); offset += this.W_H1H2.length;
    flat.set(this.B_H2,   offset); offset += this.B_H2.length;
    flat.set(this.W_H2O,  offset); offset += this.W_H2O.length;
    flat.set(this.B_O,    offset);

    return flat;
  }

  /**
   * Load all weights from a flat Float32Array (same layout as getWeights).
   */
  setWeights(weights: Float32Array): void {
    let offset = 0;

    this.W_IH1.set(weights.subarray(offset, offset + this.W_IH1.length));
    offset += this.W_IH1.length;

    this.B_H1.set(weights.subarray(offset, offset + this.B_H1.length));
    offset += this.B_H1.length;

    this.W_H1H2.set(weights.subarray(offset, offset + this.W_H1H2.length));
    offset += this.W_H1H2.length;

    this.B_H2.set(weights.subarray(offset, offset + this.B_H2.length));
    offset += this.B_H2.length;

    this.W_H2O.set(weights.subarray(offset, offset + this.W_H2O.length));
    offset += this.W_H2O.length;

    this.B_O.set(weights.subarray(offset, offset + this.B_O.length));
  }

  /**
   * Total number of weights (including biases).
   */
  totalWeightCount(): number {
    return (
      this.W_IH1.length +
      this.B_H1.length +
      this.W_H1H2.length +
      this.B_H2.length +
      this.W_H2O.length +
      this.B_O.length
    );
  }

  // ──────────────────────────────────────────────
  // WEIGHT MUTATION (applied by Evolution system)
  // ──────────────────────────────────────────────

  /**
   * Apply Gaussian noise to a specific weight buffer.
   * Called by the Evolution system — mutateWeights().
   */
  mutateBuffer(
    buffer: Float32Array,
    mutationRate: number,
    magnitude: number,
    rng: () => number
  ): void {
    for (let i = 0; i < buffer.length; i++) {
      if (rng() < mutationRate) {
        // Box-Muller approximation (fast path)
        const u1 = rng();
        const u2 = rng();
        const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
        buffer[i] += magnitude * z;
        // Clamp to prevent extreme weight explosion
        buffer[i] = Math.max(-10, Math.min(10, buffer[i]));
      }
    }
  }

  /**
   * Mutate all weights in place.
   */
  mutateAll(mutationRate: number, magnitude: number, rng: () => number): void {
    this.mutateBuffer(this.W_IH1,  mutationRate, magnitude, rng);
    this.mutateBuffer(this.B_H1,   mutationRate, magnitude, rng);
    this.mutateBuffer(this.W_H1H2, mutationRate, magnitude, rng);
    this.mutateBuffer(this.B_H2,   mutationRate, magnitude, rng);
    this.mutateBuffer(this.W_H2O,  mutationRate, magnitude, rng);
    this.mutateBuffer(this.B_O,    mutationRate, magnitude, rng);
  }

  /**
   * Structural mutation: randomly zero out or randomize individual weights.
   */
  structuralMutate(rate: number, rng: () => number): void {
    const buffers = [this.W_IH1, this.B_H1, this.W_H1H2, this.B_H2, this.W_H2O, this.B_O];
    for (const buf of buffers) {
      for (let i = 0; i < buf.length; i++) {
        if (rng() < rate) {
          if (buf[i] === 0) {
            // Activate a dead connection
            buf[i] = (rng() * 2 - 1) * 0.5;
          } else {
            // Kill an active connection
            buf[i] = 0;
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // CLONE & INITIALIZE
  // ──────────────────────────────────────────────

  /**
   * Deep-clone this neural network (same weights, independent buffers).
   */
  clone(): NeuralNetwork {
    const copy = new NeuralNetwork([
      this.inputSize,
      this.hidden1Size,
      this.hidden2Size,
      this.outputSize,
    ]);
    copy.setWeights(this.getWeights());
    return copy;
  }

  /**
   * Randomize all weights using Xavier/Glorot initialization.
   * Appropriate for tanh activations.
   * @param rng seeded random number generator
   */
  randomize(rng: () => number): void {
    const initLayer = (buf: Float32Array, fanIn: number, fanOut: number) => {
      // Xavier uniform: range = sqrt(6 / (fanIn + fanOut))
      const limit = Math.sqrt(6 / (fanIn + fanOut));
      for (let i = 0; i < buf.length; i++) {
        buf[i] = (rng() * 2 - 1) * limit;
      }
    };

    const zeroBias = (buf: Float32Array) => buf.fill(0);

    initLayer(this.W_IH1,  this.inputSize,   this.hidden1Size);
    zeroBias(this.B_H1);
    initLayer(this.W_H1H2, this.hidden1Size, this.hidden2Size);
    zeroBias(this.B_H2);
    initLayer(this.W_H2O,  this.hidden2Size, this.outputSize);
    zeroBias(this.B_O);
  }

  /**
   * Zero out all weights (produces a "dead" network that outputs all zeros).
   */
  zero(): void {
    this.W_IH1.fill(0);
    this.B_H1.fill(0);
    this.W_H1H2.fill(0);
    this.B_H2.fill(0);
    this.W_H2O.fill(0);
    this.B_O.fill(0);
  }

  // ──────────────────────────────────────────────
  // REINFORCEMENT LEARNING WEIGHT UPDATE
  // (called by ReinforcementLearner)
  // ──────────────────────────────────────────────

  /**
   * Update output-layer weights using policy gradient approximation.
   * Only adjusts W_H2O and B_O.
   *
   * Rule: weight += learningRate * reward * h2_activation
   *
   * @param reward   Scalar reward signal (positive = good, negative = bad)
   * @param lr       Learning rate
   */
  updateOutputWeights(reward: number, lr: number): void {
    const scale = lr * reward;
    if (Math.abs(scale) < 1e-9) return; // Skip if negligible update

    // REINFORCE rule: weight += lr * reward * h2_activation * output_activation
    // Multiplying by A_OUT[o] makes the update selective — only neurons that were
    // actually active (output ≠ 0) get reinforced. Without this, a food reward
    // would equally reinforce the turn, sprint, and defend outputs even if they
    // weren't firing, which pushes weights in wrong directions.
    for (let o = 0; o < this.outputSize; o++) {
      const actionScale = scale * this.A_OUT[o]; // zero for inactive outputs
      if (Math.abs(actionScale) < 1e-9) continue;
      const wOffset = o * this.hidden2Size;
      for (let k = 0; k < this.hidden2Size; k++) {
        // L2 decay pulls weights toward 0, preventing saturation
        this.W_H2O[wOffset + k] *= 0.9999;
        this.W_H2O[wOffset + k] += actionScale * this.A_H2[k];
        this.W_H2O[wOffset + k] = Math.max(-10, Math.min(10, this.W_H2O[wOffset + k]));
      }
      this.B_O[o] *= 0.9999;
      this.B_O[o] += actionScale;
      this.B_O[o] = Math.max(-5, Math.min(5, this.B_O[o]));
    }
  }

  /**
   * Optionally update hidden layer weights too (deeper RL signal).
   * Less stable but allows the network to adapt hidden representations.
   */
  updateHiddenWeights(reward: number, lr: number): void {
    const scale = lr * reward * 0.1; // Reduced scale for hidden layers
    if (Math.abs(scale) < 1e-9) return;

    for (let j = 0; j < this.hidden1Size; j++) {
      const wOffset = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        this.W_IH1[wOffset + i] += scale * this.A_H1[j];
        this.W_IH1[wOffset + i] = Math.max(-10, Math.min(10, this.W_IH1[wOffset + i]));
      }
    }
  }

  // ──────────────────────────────────────────────
  // CROSSOVER
  // ──────────────────────────────────────────────

  /**
   * Perform uniform crossover with another network's weights.
   * Each weight is taken from either this network or the other
   * with equal probability (50/50).
   */
  crossoverWith(other: NeuralNetwork, rng: () => number): void {
    const myWeights = this.getWeights();
    const otherWeights = other.getWeights();

    for (let i = 0; i < myWeights.length; i++) {
      if (rng() < 0.5) {
        myWeights[i] = otherWeights[i];
      }
    }

    this.setWeights(myWeights);
  }

  // ──────────────────────────────────────────────
  // DEBUGGING / VISUALIZATION
  // ──────────────────────────────────────────────

  /**
   * Return activation values for all neurons (for the brain visualizer).
   * Returns: { h1: Float32Array, h2: Float32Array, out: Float32Array }
   * Values are from the most recent forward pass.
   */
  getActivations(): { h1: Float32Array; h2: Float32Array; out: Float32Array } {
    return {
      h1:  this.A_H1,
      h2:  this.A_H2,
      out: this.A_OUT,
    };
  }

  /**
   * Return a summary string for debugging.
   */
  toString(): string {
    const weights = this.getWeights();
    const mean = weights.reduce((s, w) => s + w, 0) / weights.length;
    const variance = weights.reduce((s, w) => s + (w - mean) ** 2, 0) / weights.length;
    return `NeuralNetwork [${this.inputSize}→${this.hidden1Size}→${this.hidden2Size}→${this.outputSize}] `
      + `weights=${weights.length}, mean=${mean.toFixed(3)}, std=${Math.sqrt(variance).toFixed(3)}`;
  }
}
