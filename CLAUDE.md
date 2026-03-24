# CLAUDE.md — CUBE GENESIS: From Particle to Civilization

## Project Overview

**Cube Genesis** is a browser-based 3D artificial life simulator rendered in Three.js. A single white cube is spawned into an infinite dark void with a neural network brain and zero knowledge. Through reinforcement learning, evolutionary selection, and environmental pressure from co-evolving attackers, the cube learns to survive, duplicate, cooperate, build structures, and eventually form civilizations. The user watches this unfold passively — an idle simulation where intelligence emerges from nothing.

This is NOT a game. There are no player controls beyond camera movement, simulation speed, and observation tools. The AI drives everything. The user is a spectator watching digital evolution compress billions of years into hours.

---

## Tech Stack

- **Runtime**: Browser (single HTML file, or Vite dev server for development)
- **3D Rendering**: Three.js (r128+ from CDN, or npm for dev)
- **Language**: TypeScript (strict mode)
- **Build**: Vite (for dev), single-file HTML export for distribution
- **No backend. No database. Everything runs client-side.**

---

## Project Structure

```
cube-genesis/
├── CLAUDE.md                    # This file — the project bible
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.ts                  # Entry point, scene init, game loop
│   ├── config.ts                # All tunable constants (centralized)
│   ├── world/
│   │   ├── World.ts             # World manager: grid, boundaries, spatial hash
│   │   ├── SpatialHash.ts       # Spatial partitioning for O(1) neighbor lookups
│   │   └── FoodSpawner.ts       # Food generation logic, cluster spawning
│   ├── entities/
│   │   ├── Cube.ts              # The protagonist cube entity
│   │   ├── Attacker.ts          # Enemy entities (all wave types)
│   │   ├── Food.ts              # Food orb entity
│   │   ├── Structure.ts         # Player-built structures (walls, shelters, towers)
│   │   └── EntityManager.ts     # Lifecycle manager for all entities
│   ├── brain/
│   │   ├── NeuralNetwork.ts     # Feedforward neural net with backprop
│   │   ├── Genome.ts            # Serializable genome (weights + metadata)
│   │   ├── Evolution.ts         # Selection, crossover, mutation operators
│   │   ├── ReinforcementLearner.ts  # Online reward-based weight adjustment
│   │   └── BrainVisualizer.ts   # Real-time neural activity display
│   ├── systems/
│   │   ├── EraManager.ts        # Era progression logic and unlock system
│   │   ├── CivilizationTracker.ts   # Civ detection, role assignment
│   │   ├── AttackerEvolution.ts # Co-evolving attacker intelligence
│   │   ├── PhysicsSystem.ts     # Simple collision, movement, boundaries
│   │   ├── RewardSystem.ts      # Centralized reward calculation
│   │   └── LineageTracker.ts    # Tracks parent-child tree, identifies leaf nodes
│   ├── rendering/
│   │   ├── SceneSetup.ts        # Lights, fog, post-processing
│   │   ├── CubeRenderer.ts      # Cube mesh, glow, trail rendering
│   │   ├── AttackerRenderer.ts  # Attacker mesh variations per wave
│   │   ├── StructureRenderer.ts # Structure meshes, settlement glow
│   │   ├── ParticleSystem.ts    # Death, birth, eat, build particles
│   │   ├── TrailRenderer.ts     # Fading movement trails
│   │   └── CameraController.ts  # Orbit, zoom, follow-mode, auto-orbit
│   ├── ui/
│   │   ├── HUD.ts               # All HUD elements (HTML overlay)
│   │   ├── Timeline.ts          # Era progression timeline bar
│   │   ├── EventLog.ts          # Scrolling event messages
│   │   ├── InspectorPanel.ts    # Click-to-inspect creature detail
│   │   └── StatsGraph.ts        # Mini live graphs (population, fitness)
│   ├── persistence/
│   │   ├── SaveManager.ts       # Auto-save, manual save/load, localStorage + file export
│   │   ├── Serializer.ts        # Converts full world state to/from JSON
│   │   └── SaveSchema.ts        # Versioned save format types + migration
│   └── utils/
│       ├── math.ts              # Vector math, random, lerp, clamp
│       ├── color.ts             # HSL generation, generation-based palettes
│       └── debug.ts             # Optional debug overlays
```

---

## Architecture Principles

1. **Entity-Component pattern**: Each entity (Cube, Attacker, Food, Structure) owns its own mesh, brain (if applicable), and state. No global god-object.
2. **Spatial hashing**: The world is divided into grid cells. Neighbor queries (nearest food, nearest attacker, nearby cubes) use spatial hash lookups, NOT brute-force O(n²) scans. This is critical for performance at 150+ entities.
3. **Config-driven tuning**: Every magic number lives in `config.ts`. Energy drain rates, mutation rates, era thresholds, attacker speeds — all centralized. Never hardcode constants in logic files.
4. **Deterministic-optional**: Expose a seed parameter in config for reproducible runs. Use a seeded PRNG for all randomness. Default to `Date.now()` seed.
5. **Frame-rate independent**: All movement and energy calculations multiply by `deltaTime`. Never assume 60fps.

---

## The Neural Network — Detailed Specification

### Architecture

Each cube's brain is a feedforward neural network:

```
Input Layer (14 neurons)
    ↓
Hidden Layer 1 (20 neurons, tanh activation)
    ↓
Hidden Layer 2 (16 neurons, tanh activation)
    ↓
Output Layer (8 neurons, tanh activation)
```

This is deeper and wider than a toy net. Two hidden layers allow the network to learn non-linear spatial reasoning — critical for predicting attacker trajectories and planning multi-step food routes.

### Input Neurons (14)

| Index | Input | Range | Description |
|-------|-------|-------|-------------|
| 0 | `nearestFoodDist` | 0–1 | Distance to closest food, normalized to vision range |
| 1 | `nearestFoodAngle` | -1–1 | Angle to closest food relative to facing direction |
| 2 | `nearestAttackerDist` | 0–1 | Distance to closest attacker |
| 3 | `nearestAttackerAngle` | -1–1 | Angle to closest attacker |
| 4 | `nearestAttackerVelX` | -1–1 | X velocity of nearest attacker (for prediction) |
| 5 | `nearestAttackerVelZ` | -1–1 | Z velocity of nearest attacker |
| 6 | `energy` | 0–1 | Current energy / max energy |
| 7 | `age` | 0–1 | Current age / max lifespan |
| 8 | `nearestAllyDist` | 0–1 | Distance to nearest friendly cube |
| 9 | `nearestAllyAngle` | -1–1 | Angle to nearest ally |
| 10 | `localDensity` | 0–1 | Number of allies within radius / max |
| 11 | `nearestStructDist` | 0–1 | Distance to nearest structure |
| 12 | `wallDist` | 0–1 | Distance to nearest world boundary |
| 13 | `bias` | 1.0 | Constant bias input |

### Output Neurons (8)

| Index | Output | Usage |
|-------|--------|-------|
| 0 | `turnLeft` | Positive = rotate left. Magnitude = turn speed |
| 1 | `turnRight` | Positive = rotate right |
| 2 | `moveForward` | Positive = move in facing direction. Magnitude = speed |
| 3 | `eat` | > 0.5 triggers food consumption attempt |
| 4 | `build` | > 0.5 attempts to place a structure block |
| 5 | `signal` | > 0.5 emits a visible "ping" that nearby allies can sense |
| 6 | `sprint` | > 0.5 doubles speed but triples energy drain |
| 7 | `defend` | > 0.5 reduces damage taken but halves speed |

### Learning System (Hybrid)

The brain uses TWO learning mechanisms simultaneously:

#### 1. Reinforcement Learning (Online, Within Lifetime)

Every tick, the cube receives a reward signal. The weights are adjusted in real-time using a simplified policy gradient:

```
For each output weight:
  weight += learningRate * reward * hiddenActivation * noise
```

**Reward signals:**

MOVEMENT REWARDS — the cube must keep moving to survive:
- Moving (velocity > 0.01): 0.0 reward (neutral — moving is the DEFAULT expected state)
- Standing still (velocity < 0.01): -0.15 per tick (HARSH — idling is punished aggressively)
- Standing still for 50+ consecutive ticks: -0.3 per tick (escalating punishment)
- Standing still for 100+ consecutive ticks: -0.5 per tick (near death sentence)
- The stillness counter resets the moment the cube moves again

FOOD REWARDS:
- Eating food: +1.0
- Moving toward food (closing distance): +0.1 per tick
- Moving away from food when hungry (energy < 30): -0.05 per tick

DANGER REWARDS:
- Getting hit by attacker: -2.0
- Moving away from attacker when within threat range: +0.2
- Moving TOWARD attacker (unless defending): -0.1 per tick
- Dodging an attacker that was within 3 units: +0.5 (near-miss bonus)

SOCIAL REWARDS (Era 3+):
- Being near allies (within 10 units): +0.05 per tick
- Building a structure (Era 5+): +0.5
- Being inside a shelter: +0.03 per tick

LIFE REWARDS:
- Surviving each tick: +0.001
- Duplicating: +2.0
- Death: -5.0 (applied to final brain state before inheritance)

**Reward Accumulation:**
Rewards are accumulated over a short window (last 30 ticks) and the average is used for weight updates. This prevents single-event spikes from destabilizing the network.

### Reward Score Tracking — Visible Per-Entity Reward Bar

**Every entity in the world displays a small floating reward score bar above it.** This lets the user instantly see which cubes are thriving and which are struggling.

```
Implementation:
- Each cube tracks a `lifetimeRewardScore` (cumulative sum of all rewards received)
- Each cube tracks a `recentRewardRate` (average reward per tick over last 100 ticks)
- A small horizontal bar floats above each cube's mesh (HTML overlay or 3D sprite)
- Bar is color-coded:
    Green (bright):  recentRewardRate > +0.3  (thriving — eating, dodging, building)
    Green (dim):     recentRewardRate > +0.1  (doing okay)
    Yellow:          recentRewardRate > -0.1  (struggling — not finding food)
    Orange:          recentRewardRate > -0.3  (in danger — taking hits or starving)
    Red:             recentRewardRate < -0.3  (about to die)
- Bar width represents energy (so you see both reward rate AND energy at a glance)
- Bar is only visible when camera is within 40 units (LOD optimization)
```

**Attackers also get reward bars** (Wave 4+ with brains):
- Red-tinted bar
- Bright when successfully hunting cubes
- Dim when failing to catch anything

**The Inspector Panel (right side, when clicking a cube) shows detailed reward breakdown:**
```
CUBE #47
|- REWARD SCORE
|  Lifetime total:    +1,247.3
|  Recent rate:       +0.18 /tick
|  ├ Movement:        +0.00  (moving = neutral)
|  ├ Food seeking:    +0.10
|  ├ Danger evasion:  +0.04
|  ├ Social:          +0.03
|  ├ Survival:        +0.001
|  └ Penalties:       0.00
|
|  [████████████░░░░░░] reward rate history (sparkline)
```

**HUD addition — top-right stats panel, add these lines:**
```
AVG REWARD     +0.12 /tick     (population average — green if positive, red if negative)
BEST CUBE      #47 (+1,247)    (highest lifetime reward score, clickable to select)
WORST CUBE     #12 (-34)       (lowest — might die soon)
```

This gives you an at-a-glance dashboard: you can see which cubes are winning the reward game, which are failing, and what behaviors are being rewarded. When a cube's bar turns green, you know its brain has figured something out.

#### 2. Evolutionary Selection (Generational, Across Lifetimes)

When a cube dies, its genome (serialized weights) is scored:

```
fitness = survivalTime * 0.4 + foodEaten * 0.3 + offspringCount * 0.2 + structuresBuilt * 0.1
```

The top 20% of genomes by fitness are preserved in a **Hall of Fame** (max 50 genomes). When a cube duplicates, the offspring brain is created by:

1. Clone the parent's brain
2. With 30% probability, crossover with a random Hall of Fame genome
3. Apply mutation (see below)

**Mutation operator:**
- Per-weight mutation probability: 12% (decreases slightly over generations)
- Mutation magnitude: Gaussian noise, σ = 0.3 (also decreases over generations)
- Structural mutation (rare, 2%): Add/remove a connection (set weight to 0 or randomize a zero weight)
- Full brain reset (very rare, 0.5%): Completely randomize all weights. Prevents population stagnation.

### Genome Serialization

The genome is a flat `Float32Array` containing all weights and biases in order: `[weightsIH1..., biasH1..., weightsH1H2..., biasH2..., weightsH2O..., biasO...]` plus metadata:

```typescript
interface Genome {
  weights: Float32Array;
  fitness: number;
  generation: number;
  parentId: number;
  era: number;
  mutations: number;       // cumulative mutation count
}
```

---

## Entity Specifications

### Cube (Protagonist)

```typescript
interface CubeState {
  id: number;
  position: Vector3;
  direction: number;           // facing angle in radians
  energy: number;              // 0–maxEnergy, dies at 0
  maxEnergy: number;           // starts 100, increases with era
  age: number;                 // ticks alive
  maxAge: number;              // dies of old age
  generation: number;
  era: number;                 // highest era this cube has reached
  brain: NeuralNetwork;
  genome: Genome;
  
  // Stats
  foodEaten: number;
  distanceTraveled: number;
  damageDealt: number;
  damageTaken: number;
  offspringCount: number;
  structuresBuilt: number;
  
  // State machine
  state: 'exploring' | 'hunting' | 'fleeing' | 'building' | 'socializing' | 'defending';
  
  // Visual
  size: number;                // grows slightly with generation
  glowIntensity: number;      // energy-based
  trailLength: number;         // longer trails for faster cubes
  color: Color;                // hue shifts per generation lineage
}
```

**Cube Visual Design:**
- A literal cube. `THREE.BoxGeometry(size, size, size)`.
- White base color, slightly tinted by generation hue.
- Emissive glow proportional to energy level.
- A fading trail behind it (last 30 positions rendered as fading transparent cubes or a line).
- When sprinting: trail brightens, slight stretch effect (scale Z slightly).
- When defending: semi-transparent shield sphere around the cube.
- On death: cube shatters into 8 smaller cubes that fly outward and fade (particle effect).
- On duplication: bright flash, parent cube briefly pulses, new cube materializes adjacent.

**Cube Movement — STRICT SPEED RESTRICTIONS:**

The cube must NEVER be inherently faster than mid-tier attackers. Speed is a scarce resource, not a default advantage. The cube survives through intelligence, not raw speed.

```
Base speed: 0.05 units/tick  (SLOW — intentionally slower than Seekers)
Max speed:  0.10 units/tick  (hard cap — can never exceed this even with all bonuses)
Sprint:     1.5x current speed for 3 seconds, then 5-second cooldown
            Sprint costs 0.08 energy/tick (very expensive — can't sprint forever)
Turning:    0.06 radians/tick (sluggish — the cube can't spin on a dime)
Momentum:   0.92 damping (heavy — takes time to stop and change direction)
```

**Speed is earned, not given:**
- Base: 0.05 (Gen 1 cube is SLOWER than Seekers and Pack Hunters)
- Food chain bonus: eating 3 food within 500 ticks gives +0.005 speed (temporary, decays)
- Era bonus: +0.005 per era reached (permanent, but tiny)
- Maximum possible speed: 0.05 base + 0.005 food chain + 0.03 era bonus = 0.085 at Era 6
- This means even a fully evolved Era 6 cube is STILL slower than Swarm units (0.12)
- Sprint is the only way to briefly exceed attacker speeds, but it drains energy fast

**Why this matters for learning:**
If the cube can outrun everything, the optimal strategy is "run in circles and eat." Boring. No intelligence needed. By making the cube SLOWER than most attackers, it MUST learn:
- Prediction: "where will the attacker BE, not where it IS"
- Positioning: "stay near structures/allies for protection"
- Timing: "use sprint only when cornered, not as default movement"
- Evasion angles: "I can't outrun it, but I can turn sharper if I time it right"
- Group defense: "alone I'm slow, together we're safe"

The cube's advantage is its BRAIN, not its legs.

**Turning restrictions:**
- Turning rate: 0.06 radians/tick base
- This means a full 180° turn takes ~52 ticks — the cube can't instantly reverse
- Attackers have different turn rates per type (see below)
- This creates situations where the cube must PLAN turns ahead of time
- The brain must learn: "if threat is behind me, start turning NOW, not when it's on top of me"

**Movement costs energy:**
- Standing still: 0.01 energy/tick (minimal drain)
- Moving at base speed: 0.02 energy/tick
- Moving at max speed: 0.03 energy/tick
- Sprinting: 0.08 energy/tick (unsustainable — ~600 ticks to drain full energy)
- This creates a real tradeoff: move fast and starve, or conserve and risk getting caught

**Cube Energy:**
- Starts at 50, max 100
- Passive drain: 0.01/tick (just existing costs energy)
- Movement drain: scales with speed (see above)
- Food restores 15–30 energy
- Duplication costs: energy / 2 (splits current energy with offspring)
- Building costs: 8 energy per structure block
- Sprint drain: 0.08/tick (on top of movement drain)
- Damage from attackers: 15–40 per hit depending on attacker type

**Duplication Threshold:**
- Energy must be >= 80
- Age must be >= 500 ticks
- Population must be < MAX_CUBES (config, default 100)

### Attacker Types — SPEED COMPARISON TABLE

**CRITICAL: Attackers must be credible threats. Most should match or exceed cube speed.**

```
Entity              Base Speed    Turn Rate    Notes
─────────────────────────────────────────────────────────────
Cube (Gen 1)        0.05          0.06         Slowest thing in the world
Cube (maxed Era 6)  0.085         0.06         Still slower than swarm
Cube (sprinting)    0.075–0.127   0.06         Temporary burst, expensive

Drifter             0.04          0.02         Only thing slower than Gen 1 cube
Seeker              0.07          0.04         FASTER than base cube
Pack Hunter         0.09          0.05         FASTER, and there's 3-5 of them
Adaptive Predator   0.10          0.07         FASTER and SMARTER — has a brain
Siege Entity        0.03          0.01         Slow but tanky, targets structures
Swarm Unit          0.12          0.08         FASTEST thing in the world
```

**The speed hierarchy creates escalating pressure:**
- Era 1: Drifters are slower. Cube can avoid them easily once it learns basic movement.
- Era 2: Seekers are FASTER. Cube can't outrun them. Must learn to sidestep, predict, use corners.
- Era 3: Pack Hunters are FASTER and coordinate. Cube can't outrun a group. Must learn clustering.
- Era 4: Predators MATCH cube speed and have brains. Pure evasion fails. Must out-think them.
- Era 5: Siege is slow but unstoppable. Cube must build and defend, not just run.
- Era 6: Swarm is the FASTEST thing. Only structures and group defense work.

Each era forces a NEW survival strategy because running stops working.

All attackers are red-tinted geometric shapes. They get more complex and dangerous through waves.

#### Wave 1 — Drifters (Era 1)
```
Shape: Small red cube, slightly smaller than protagonist
Movement: Random walk (random direction change every 100–200 ticks)
Speed: 0.04 units/tick (slower than cube — the only easy enemy)
Turn rate: 0.02 radians/tick (very sluggish turning)
Damage: 15 on contact
Spawn rate: 1 every 400 ticks
Max alive: 8
Brain: None
Visual: Dark red cube, dim glow, no trail
```

#### Wave 2 — Seekers (Era 2)
```
Shape: Red octahedron
Movement: Homes toward nearest cube. Recalculates target every 60 ticks.
Speed: 0.07 units/tick (FASTER than base cube — cube cannot outrun)
Turn rate: 0.04 radians/tick
Damage: 20 on contact
Spawn rate: 1 every 350 ticks
Max alive: 12
Brain: Simple heuristic (not neural net)
Visual: Brighter red, faint red trail, pulses when targeting
```

#### Wave 3 — Pack Hunters (Era 3)
```
Shape: Red tetrahedron
Movement: Flocking behavior (separation + alignment + cohesion) toward nearest cube cluster
Speed: 0.09 units/tick (significantly faster than cube)
Turn rate: 0.05 radians/tick
Damage: 18 per individual (but they attack in groups of 3–5)
Spawn rate: Pack of 3 every 500 ticks
Max alive: 20
Brain: Boid rules + basic pack coordination
Visual: Triangle shape, red trails, connected by faint red lines within pack
```

#### Wave 4 — Adaptive Predators (Era 4)
```
Shape: Red icosahedron (sphere-like)
Movement: NEURAL NETWORK controlled — they have their own brains!
Speed: 0.10 units/tick (faster than cube AND smarter)
Turn rate: 0.07 radians/tick (more agile than cube!)
Damage: 25 on contact
Spawn rate: 1 every 500 ticks
Max alive: 10
Brain: Small neural net (6 inputs, 8 hidden, 3 outputs)
  Inputs: nearestCubeDist, nearestCubeAngle, cubeVelX, cubeVelZ, ownEnergy, wallDist
  Outputs: turnLeft, turnRight, moveForward
  Learning: They get rewarded for hitting cubes, punished for dying near structures
  Evolution: Top predator genomes are preserved; new predators inherit from best
Visual: Smoother shape, brighter glow, more aggressive trailing, eyes (two small white dots)
```

#### Wave 5 — Siege Entities (Era 5)
```
Shape: Large red cube (3x normal size)
Movement: Slowly homes toward nearest structure cluster
Speed: 0.03 units/tick (very slow)
Damage: 40 to cubes on contact, DESTROYS structures on contact
HP: 100 (takes multiple cube "attacks" to kill — cubes deal 5 damage when touching while in defend mode)
Spawn rate: 1 every 1000 ticks
Max alive: 3
Brain: Heuristic (target densest structure area)
Visual: Large, dark red, ground-shaking visual effect (screen shake when nearby), slow pulsing glow
```

#### Wave 6 — Swarm Intelligence (Era 6)
```
Shape: Tiny red diamonds (0.3x cube size)
Movement: Neural network with shared weights (hive mind). All swarm units run the same brain.
Speed: 0.12 units/tick (faster than cubes)
Damage: 8 per unit (but 20–40 spawn at once)
Spawn rate: Swarm of 20 every 1500 ticks
Max alive: 40
Brain: Shared neural net. Gets rewarded for total swarm kills. One brain, many bodies.
Visual: Tiny red diamonds, swirling cloud formation, connected by red particle web
```

### Food

```
Shape: Green sphere (THREE.SphereGeometry, radius 0.3–0.5 based on value)
Value: 15–30 energy (random)
Spawn: Periodic (every 100–200 ticks based on config) + cluster spawning
  - 70% chance: random position in world
  - 30% chance: cluster of 3–5 near an existing food (creates "food patches")
Lifetime: Infinite (food doesn't decay)
Max food in world: 80 (config)
Visual: Bright green, soft glow, gentle bobbing animation (sin wave on Y axis)
On eaten: Burst of green particles, brief flash
```

### Structures

Cubes can build structures when in Era 5+. Structures are placed at the cube's current position.

```
Types (chosen by cube's build output magnitude):
  - Wall block: Simple cube, acts as barrier. Attackers must path around.
  - Shelter: Dome shape. Cubes inside take 50% less damage.
  - Beacon: Tall pillar. Attracts cubes, repels Wave 1–3 attackers (fear radius).
  
Cost: 8 energy per block
Cooldown: 200 ticks between builds (per cube)
HP: 50 (Siege Entities deal 30 damage per hit)
Max structures: 150 (config)

Visual:
  - Wall: White/grey cube, slightly transparent, grid-like texture
  - Shelter: Half-sphere wireframe, soft cyan glow
  - Beacon: Tall thin box, bright white glow at top, visible light column
  - Structures near each other form "settlement" glow (additive light)
```

---

## Era System — Detailed Progression

Eras unlock based on **cumulative civilization score**, not just population:

```
civScore = (aliveCubes * 1.0) 
         + (totalFoodEaten * 0.1) 
         + (maxGeneration * 2.0) 
         + (structures * 3.0) 
         + (avgSurvivalTime * 0.01)
         + (totalDuplicationsEver * 1.5)
```

| Era | Name | civScore Threshold | Unlocks | Attacker Wave |
|-----|------|--------------------|---------|---------------|
| 1 | Survival | 0 | Basic movement, eating | Drifters |
| 2 | Awareness | 50 | Extended vision range, sprint ability | Seekers |
| 3 | Duplication | 150 | Cube splitting, social proximity bonus | Pack Hunters |
| 4 | Cooperation | 400 | Ally sensing inputs active, signal ability, damage sharing within cluster | Adaptive Predators |
| 5 | Construction | 800 | Build ability unlocked, structure placement | Siege Entities |
| 6 | Civilization | 1500 | Role specialization, beacon construction, settlement bonuses | Swarm Intelligence |

**Era transitions** should be dramatic visual events:
- Screen flash in era's color
- Brief slow-motion (0.25x speed for 2 seconds)
- Large text announcement: "ERA 3: DUPLICATION" that fades
- New ambient particle effect added to the void
- Event log entry

**IMPORTANT**: Abilities from later eras exist in the neural network outputs from the start, but the corresponding output neurons are **clamped to 0** until the era unlocks. This means the network topology never changes — only which outputs are "active." This avoids breaking learned weights when new abilities unlock.

---

## World Specification

### Geometry
- Flat plane extending to a boundary
- World size: 120 x 120 units (config)
- Hard boundaries: cubes and attackers bounce off edges
- Faint grid on ground (subtle, dark green lines, 5 unit spacing)
- No terrain variation (flat void)

### Fog & Atmosphere
- `THREE.FogExp2` with density 0.006, color #000a06
- Creates the "infinite void" look — entities fade into darkness at distance
- Stars: 200 small white points scattered on a large sphere around the scene (distant starfield)
- Ambient particles: faint floating dust motes (tiny white particles with very slow drift)

### Lighting
- Single directional light (moonlight feel, cool white, intensity 0.3)
- Ambient light (very dim, 0.15 intensity, dark teal tint)
- Each entity emits its own point light (small radius, colored by type)
- Structures emit light additively (settlements glow from combined light)

### Camera
- Default: slow auto-orbit around world center at 45 degree elevation
- Mouse drag: manual orbit (override auto-orbit)
- Scroll: zoom (min 20, max 200 distance)
- Click entity: camera smoothly transitions to follow that entity (slight offset behind and above)
- Double-click void: return to auto-orbit
- Space bar: toggle between overview and follow-nearest-action mode

---

## HUD & UI Specification

The HUD is an HTML/CSS overlay on the canvas. Minimal. Dark. Monospaced font aesthetic.

### Top-Left: Title & Era
```
CUBE GENESIS
Era 3: Duplication
```
Font: Orbitron or similar geometric sans. Color: #00ffc8 (teal glow). Text-shadow glow effect.

### Top-Right: Stats Panel
Semi-transparent dark panel with stats:
```
POPULATION     23 / 100
GENERATION     47
FOOD           34 / 80
STRUCTURES     12
ATTACKERS      15
THREAT LEVEL   ████░░░░ PACK HUNTERS
SURVIVAL BEST  4,231 ticks
CIV SCORE      312
───────────────────────────
AVG REWARD     +0.12 /tick    (green if positive, red if negative)
BEST CUBE      #47 (+1,247)   (highest lifetime reward, click to follow)
WORST CUBE     #12 (-34)      (lowest reward, likely dying soon)
```

### Bottom-Center: Timeline Bar
A horizontal bar showing era progression:
```
[█████|████|███░░░░░░|░░░░░░░░░|░░░░░░░░░|░░░░░░░░░]
 ERA1   ERA2   ERA3      ERA4      ERA5      ERA6
```
Current era highlighted. Future eras dimmed. Score marker shows position within current era.

### Bottom-Left: Event Log
Last 6 events, fading upward:
```
> Cube #47 duplicated -> #48 (Gen 12)
> Cube #31 killed by Seeker
> Era 3 reached: DUPLICATION
> Cube #48 ate food (+22 energy)
> Pack Hunter wave spawned (x4)
```
Color-coded by type: green=birth, red=death, gold=era, teal=event, red=threat.

### Right Side: Inspector Panel (visible when entity selected)
Shows selected cube's details:
```
CUBE #47
|- Energy    ████████░░ 78/100
|- Age       1,247 ticks
|- Gen       12
|- Era       3
|- State     HUNTING
|- Food      23 eaten
|- Offspring 3
|- Speed     0.12 u/t
|
|- BRAIN ACTIVITY
|  [neural net visualization — a small grid of circles
|   that light up based on neuron activation values,
|   arranged in layers matching the network topology]
|
|- LINEAGE
|  #47 <- #31 <- #22 <- #8 <- #1
|  (shows parent chain back to origin)
```

### Bottom-Right: Controls
```
[Pause] [1x] [3x] [8x] [20x]
```
Speed buttons. That's it. Minimal controls — the AI does the rest.

### Mini Graphs (Optional, toggle with 'G' key)
Small sparkline graphs in corner showing:
- Population over time
- Average fitness over time  
- Food supply over time
- Kill/death ratio over time

---

## Visual Design Language

### Color Palette
```
Background:     #000a06 (near-black with green tint)
Grid:           #0a1f14 (barely visible dark green)
Cube (alive):   #ffffff with generation-hue tint (subtle)
Cube (glow):    #00ffc8 (teal, intensity = energy level)
Cube (trail):   #00ffc8 at 30% opacity, fading to 0
Food:           #00ff88 (bright green)
Attacker:       #ff2244 -> #ff0033 (escalating red per wave)
Structure:      #aabbcc (cool grey) with #00ffc8 emissive accents
HUD text:       #00ffc8 (primary), #ff6b9d (danger), #ffd700 (milestone)
Era flash:      Each era has a color — teal, blue, purple, gold, white, prismatic
```

### Post-Processing (if performance allows)
- Bloom pass on all emissive objects (cubes, food, structures glow naturally)
- Very subtle film grain (noise overlay at 3% opacity)
- Vignette (darken edges of screen)

### Sound Design (OPTIONAL — implement last, only if time permits)
- No music. Ambient hum only.
- Quiet dark drone that shifts pitch based on threat level
- Soft "ding" on food pickup
- Low thud on cube death  
- Swelling tone on era transition
- Use Web Audio API with oscillators, not audio files

---

## Performance Requirements

Target: 60fps with 100 cubes, 40 attackers, 80 food, 150 structures on mid-range hardware.

**Mandatory optimizations:**
1. **Spatial hash grid**: Cell size = 10 units. All neighbor queries use grid lookup.
2. **Instanced rendering**: Food spheres use `THREE.InstancedMesh`. Attacker waves of same type use instancing.
3. **Object pooling**: Dead cubes and eaten food return meshes to a pool. Never `new THREE.Mesh` in hot path.
4. **Brain computation batching**: Run all neural net forward passes in a tight loop before any rendering. Avoid interleaving brain computation with Three.js calls.
5. **LOD for trails**: Only render trails for cubes within camera distance < 60. Far cubes have no trail.
6. **Particle budget**: Max 200 active particles. Old particles are recycled, not deleted.
7. **Throttled HUD updates**: HUD DOM updates every 10 frames, not every frame.
8. **Web Worker for brains (stretch goal)**: Move all neural net computation to a Web Worker, communicate via SharedArrayBuffer.

---

## Simulation Loop (Per Frame)

```
1. Calculate deltaTime (capped at 50ms to prevent spiral of death)
2. Scale deltaTime by simSpeed multiplier
3. Update spatial hash with current positions
4. For each alive Cube:
   a. Gather sensory inputs from spatial hash
   b. Run neural net forward pass
   c. Apply outputs (movement, actions)
   d. Calculate reward signal
   e. Apply reinforcement learning weight update
   f. Check energy/age death conditions
   g. Check duplication conditions
5. For each Attacker:
   a. Run AI (heuristic or neural net depending on wave)
   b. Apply movement
   c. Check collision with cubes -> apply damage
   d. Check collision with structures -> apply damage (Siege only)
6. Spawn food (periodic + cluster logic)
7. Spawn attackers (wave-dependent timing)
8. Check era transitions (recalculate civScore)
9. Clean up dead entities, return to pools
10. Update HUD (every 10th frame)
11. Update camera
12. Render
```

---

## Key Behaviors to Emerge (Not Hardcode)

These should NOT be programmed. They should EMERGE from the neural network + reward system:

1. **Food-seeking**: Cubes learn to move toward green orbs
2. **Danger avoidance**: Cubes learn to turn away from red entities
3. **Wall-hugging**: Some cubes may learn to patrol world edges where fewer attackers spawn
4. **Clustering**: Cubes learn that proximity to allies gives survival bonus
5. **Division of labor**: Some cubes become "gatherers" (high eat output), others become "builders" (high build output), others become "defenders" (high defend output) — not because we assigned roles, but because specialization is rewarded
6. **Corridor building**: Cubes may learn to build walls that funnel attackers into kill zones
7. **Beacon placement**: Cubes learn that beacons near food clusters create safe zones

If these behaviors don't emerge, TUNE THE REWARD SYSTEM, don't hardcode the behaviors.

---

## Config.ts — All Constants

Every tunable value must be in this file. Example structure:

```typescript
export const CONFIG = {
  // World
  WORLD_SIZE: 120,
  GRID_CELL_SIZE: 10,
  
  // Cubes — SPEED IS RESTRICTED
  INITIAL_CUBES: 1,          // Start with ONE cube
  MAX_CUBES: 100,
  CUBE_BASE_SPEED: 0.05,     // Intentionally SLOW — slower than Seekers
  CUBE_MAX_SPEED: 0.10,      // Hard cap — can never exceed this
  CUBE_TURN_RATE: 0.06,      // Sluggish — must plan turns ahead
  CUBE_MOMENTUM_DAMPING: 0.92, // Heavy — takes time to change direction
  CUBE_SPRINT_MULTIPLIER: 1.5,
  CUBE_SPRINT_DURATION: 180,  // ticks (~3 seconds)
  CUBE_SPRINT_COOLDOWN: 300,  // ticks (~5 seconds)
  CUBE_SPRINT_DRAIN: 0.08,   // Very expensive
  CUBE_SPEED_PER_ERA: 0.005, // Tiny permanent bonus per era
  CUBE_SPEED_FOOD_CHAIN: 0.005, // Temporary bonus from chaining food
  CUBE_INITIAL_ENERGY: 50,
  CUBE_MAX_ENERGY: 100,
  CUBE_ENERGY_DRAIN_IDLE: 0.01,   // Standing still
  CUBE_ENERGY_DRAIN_MOVING: 0.02, // Base movement
  CUBE_ENERGY_DRAIN_FAST: 0.03,   // At max speed
  CUBE_DUPLICATE_THRESHOLD: 80,
  CUBE_DUPLICATE_MIN_AGE: 500,
  CUBE_MAX_AGE_BASE: 5000,
  CUBE_MAX_AGE_PER_GEN: 100, // older lineages live longer
  CUBE_VISION_RANGE: 25,
  CUBE_VISION_RANGE_ERA2: 40,
  
  // Food
  FOOD_MAX: 80,
  FOOD_SPAWN_INTERVAL: 150,  // ticks
  FOOD_CLUSTER_CHANCE: 0.3,
  FOOD_CLUSTER_SIZE: [3, 5],
  FOOD_VALUE_RANGE: [15, 30],
  
  // Attackers (per wave) — MOST are faster than the cube
  ATTACKER_WAVES: {
    drifter:  { speed: 0.04, turnRate: 0.02, damage: 15, spawnInterval: 400, maxAlive: 8 },
    seeker:   { speed: 0.07, turnRate: 0.04, damage: 20, spawnInterval: 350, maxAlive: 12 },        // FASTER than cube
    pack:     { speed: 0.09, turnRate: 0.05, damage: 18, spawnInterval: 500, maxAlive: 20, packSize: [3,5] },  // MUCH faster
    predator: { speed: 0.10, turnRate: 0.07, damage: 25, spawnInterval: 500, maxAlive: 10 },        // Faster AND smarter
    siege:    { speed: 0.03, turnRate: 0.01, damage: 40, spawnInterval: 1000, maxAlive: 3, hp: 100 }, // Slow but tanky
    swarm:    { speed: 0.12, turnRate: 0.08, damage: 8,  spawnInterval: 1500, maxAlive: 40, swarmSize: [20,40] }, // FASTEST
  },
  
  // Structures
  STRUCTURE_MAX: 150,
  STRUCTURE_BUILD_COST: 8,
  STRUCTURE_BUILD_COOLDOWN: 200,
  STRUCTURE_HP: 50,
  
  // Brain
  BRAIN_LAYERS: [14, 20, 16, 8],
  LEARNING_RATE: 0.02,
  MUTATION_RATE: 0.12,
  MUTATION_MAGNITUDE: 0.3,
  CROSSOVER_CHANCE: 0.3,
  HALL_OF_FAME_SIZE: 50,
  REWARD_WINDOW: 30,
  
  // Eras
  ERA_THRESHOLDS: [0, 50, 150, 400, 800, 1500],
  ERA_NAMES: ['Survival', 'Awareness', 'Duplication', 'Cooperation', 'Construction', 'Civilization'],
  
  // Rewards — MOVEMENT IS MANDATORY
  REWARD_EAT: 1.0,
  REWARD_APPROACH_FOOD: 0.1,
  REWARD_FLEE_HUNGRY: -0.05,         // Moving away from food when hungry
  REWARD_HIT_BY_ATTACKER: -2.0,
  REWARD_FLEE_ATTACKER: 0.2,
  REWARD_APPROACH_ATTACKER: -0.1,    // Walking toward danger
  REWARD_NEAR_MISS_DODGE: 0.5,       // Dodged attacker within 3 units
  REWARD_NEAR_ALLY: 0.05,
  REWARD_BUILD: 0.5,
  REWARD_IN_SHELTER: 0.03,
  REWARD_DEATH: -5.0,
  REWARD_SURVIVE_TICK: 0.001,
  REWARD_DUPLICATE: 2.0,
  REWARD_MOVING: 0.0,               // Moving is neutral — the expected state
  REWARD_IDLE_BASE: -0.15,          // Standing still punishment
  REWARD_IDLE_ESCALATE_1: -0.3,     // Still idle after 50 ticks
  REWARD_IDLE_ESCALATE_2: -0.5,     // Still idle after 100 ticks
  IDLE_THRESHOLD_VELOCITY: 0.01,    // Below this = "standing still"
  IDLE_ESCALATE_TICKS_1: 50,
  IDLE_ESCALATE_TICKS_2: 100,
  REWARD_WINDOW: 30,
  REWARD_BAR_VISIBLE_DISTANCE: 40,  // Camera distance for reward bar LOD
  REWARD_HISTORY_LENGTH: 100,       // Ticks for recent reward rate calculation
  
  // Rendering
  TRAIL_LENGTH: 30,
  TRAIL_CAMERA_DISTANCE: 60,
  PARTICLE_BUDGET: 200,
  HUD_UPDATE_INTERVAL: 10,
  BLOOM_STRENGTH: 0.8,
  FOG_DENSITY: 0.006,
  STAR_COUNT: 200,
  
  // Simulation
  SIM_SPEEDS: [1, 3, 8, 20],
  MAX_DELTA: 50,
  SEED: null,                 // null = random, set number for reproducibility
};
```

---

## Save / Load System — Persistence Across Sessions

Without persistence, closing the tab destroys hundreds of generations of evolution. The save system preserves the entire simulation state so users can resume exactly where they left off — or share their evolved civilizations with others.

### Save File Structure

```typescript
interface SaveFile {
  // Metadata
  version: string;              // Schema version for migration (e.g., "1.0.0")
  savedAt: number;              // Unix timestamp
  checksum: string;             // SHA-256 hash of data payload for integrity check
  
  // Simulation State
  simulation: {
    worldAge: number;
    currentEra: number;
    civScore: number;
    maxGenerationReached: number;
    totalDeaths: number;
    totalDuplications: number;
    totalFoodEaten: number;
    bestSurvivalTime: number;
    seed: number | null;
    tickCount: number;
  };
  
  // Hall of Fame — THE MOST CRITICAL DATA
  // This is the accumulated evolutionary knowledge. 
  // Even if you lose everything else, this lets evolution continue.
  hallOfFame: Array<{
    weights: number[];          // Float32Array serialized to regular array
    fitness: number;
    generation: number;
    parentId: number;
    era: number;
    mutations: number;
  }>;
  
  // ============================================================
  // CUBE SAVE STRATEGY: LEAF-NODE PRIORITY
  // ============================================================
  // NOT all cubes are saved equally. The save system builds a 
  // lineage tree from all living cubes, identifies leaf nodes
  // (youngest descendants of each branch), and saves those FIRST
  // with full detail. Non-leaf ancestors are saved as lightweight
  // references only if budget allows.
  //
  // WHY: A Gen 47 leaf cube's brain contains the compressed 
  // knowledge of all 46 ancestors through inherited + mutated 
  // weights. Saving Gen 3 ancestor alongside it is redundant — 
  // the descendant already carries that information in its weights.
  //
  // PRIORITY ORDER:
  // 1. Leaf nodes sorted by generation DESC (deepest lineage first)
  // 2. Among same-generation leaves, sort by fitness DESC
  // 3. If two leaves share a lineage (siblings), save both — 
  //    they diverged and may have learned different strategies
  // 4. Non-leaf cubes are saved as "ghosts" (position + id only,
  //    no brain weights) just so the world looks right on reload
  // ============================================================
  
  cubes: {
    // Full saves — leaf nodes with complete brain state
    // These are the cubes that matter. On load, these are 
    // reconstructed first with full neural networks.
    leafNodes: Array<{
      id: number;
      position: [number, number, number];
      direction: number;
      energy: number;
      age: number;
      generation: number;
      state: string;
      brain: number[];            // Full serialized weights — this is the gold
      stats: {
        foodEaten: number;
        distanceTraveled: number;
        offspringCount: number;
        structuresBuilt: number;
        damageTaken: number;
      };
      lineage: number[];          // Full parent chain [parentId, grandparentId, ...]
      lineageDepth: number;       // How deep this leaf is in the tree
      isLeaf: true;               // Always true in this array
    }>;
    
    // Ghost saves — non-leaf ancestors, minimal data
    // These exist only so the world looks populated on reload.
    // Their brains are NOT saved — on load, they get a brain 
    // cloned from the nearest leaf descendant (already close 
    // enough since the leaf inherited from them).
    ghosts: Array<{
      id: number;
      position: [number, number, number];
      direction: number;
      energy: number;
      age: number;
      generation: number;
      state: string;
      nearestLeafId: number;      // Which leaf to clone brain from on load
      // NO brain weights — saves massive space
      // NO full stats — just enough to render
    }>;
  };
  
  // Lineage Tree — the full family tree structure
  // Stored separately so we can visualize ancestry on load
  lineageTree: {
    // Map of cubeId -> parentId (all cubes ever, living or dead)
    // This lets us reconstruct the full evolutionary tree
    // Capped at last 500 entries to bound size
    edges: Array<[number, number]>;  // [childId, parentId]
    
    // The root ancestors (cubes with no parent — Gen 1 spawns)
    roots: number[];
  };
  
  // Attackers
  attackers: Array<{
    type: string;               // 'drifter' | 'seeker' | 'pack' | 'predator' | 'siege' | 'swarm'
    position: [number, number, number];
    direction: number;
    hp: number;
    brain: number[] | null;     // Only Wave 4+ have brains
    packId: number | null;      // For pack hunters
  }>;
  
  // Attacker Evolution State (Wave 4+)
  attackerHallOfFame: Array<{
    weights: number[];
    kills: number;
    generation: number;
  }>;
  
  // Food
  foods: Array<{
    position: [number, number, number];
    value: number;
  }>;
  
  // Structures
  structures: Array<{
    type: 'wall' | 'shelter' | 'beacon';
    position: [number, number, number];
    hp: number;
    builderId: number;
  }>;
  
  // Stats History (for mini graphs)
  statsHistory: {
    population: number[];       // Last 500 data points
    avgFitness: number[];
    foodSupply: number[];
    killDeathRatio: number[];
  };
}
```

### Save Triggers

| Trigger | Method | Storage |
|---------|--------|---------|
| Every 60 seconds | Auto-save | `localStorage` key: `cube-genesis-autosave` |
| Era transition | Auto-save | `localStorage` (milestone save) |
| User clicks "Save" button | Manual | `localStorage` + downloads `.json` file |
| User clicks "Export" button | Manual | Downloads `.cubegenesis` file (renamed `.json`) |
| Tab close / `beforeunload` | Emergency save | `localStorage` (quick save, may be partial) |

### Load Triggers

| Trigger | Source |
|---------|--------|
| Page load with existing `localStorage` save | Show modal: "Resume simulation? Gen 247, Era 3, Pop 34 — [Resume] [New World]" |
| User clicks "Load" button | File picker for `.json` / `.cubegenesis` files |
| URL parameter `?save=base64encoded` | Decode and load (for sharing via URL — only for small saves) |

### Implementation Details

**SaveManager.ts responsibilities:**
1. `autoSave()` — Called by game loop every 60 seconds. Serializes world state, writes to `localStorage`. Silent — no UI feedback except a tiny save icon flash in the HUD.
2. `manualSave()` — Serializes world state, writes to `localStorage`, AND triggers a browser download of the JSON file. File named: `cube-genesis-gen{N}-era{E}-{timestamp}.json`
3. `loadFromLocalStorage()` — Called on page load. Returns `SaveFile | null`.
4. `loadFromFile(file: File)` — Called when user imports a file. Parses JSON, validates schema version, migrates if needed, returns `SaveFile`.
5. `exportShareable()` — Compresses save with `CompressionStream` API (gzip), base64 encodes, copies a share URL to clipboard.
6. `clearSave()` — Wipes `localStorage` save. Used by "New World" button.

**Serializer.ts responsibilities:**
1. `serialize(world: World): SaveFile` — Walks all entities, runs the leaf-node selection algorithm (see below), extracts state, converts Float32Arrays to regular arrays, builds the SaveFile object.
2. `deserialize(save: SaveFile, world: World): void` — Reconstructs leaf cubes first with full brains, then reconstructs ghost cubes by cloning brain from their nearest leaf descendant, rebuilds spatial hash, restores era state.
3. `buildLineageTree(cubes: Cube[]): LineageTree` — Constructs parent-child tree from all living cubes and recent dead cubes.
4. `selectLeafNodes(cubes: Cube[]): { leaves: Cube[], ghosts: Cube[] }` — The core save selection algorithm:

```typescript
// LEAF NODE SELECTION ALGORITHM
// 
// Given 10 alive cubes, determine which are leaf nodes (no living children)
// and which are interior nodes (have living descendants).
//
// Example: 10 cubes alive
//
//   #1 (Gen 1) ──→ #4 (Gen 2) ──→ #12 (Gen 3) ← LEAF (no children)
//        │              └──→ #15 (Gen 3) ──→ #28 (Gen 4) ──→ #41 (Gen 5) ← LEAF
//        │                                        └──→ #39 (Gen 5) ← LEAF
//        └──→ #7 (Gen 2) ──→ #19 (Gen 3) ──→ #33 (Gen 4) ← LEAF
//                  └──→ #22 (Gen 3) ← LEAF
//
// Step 1: Build parent→children map from all alive cubes
// Step 2: Find cubes with NO alive children = leaf nodes
// Step 3: Sort leaves by generation DESC, then fitness DESC
// Step 4: Save leaves with FULL brain weights
// Step 5: Save non-leaves as ghosts (no brain, reference nearest leaf)
//
// Result for above example:
//   leafNodes: [#41, #39, #33, #22, #12]  (5 leaves, full brain saved)
//   ghosts:    [#1, #4, #7, #15, #19, #28] (5 ghosts, brain reconstructed on load)
//
// On LOAD:
//   1. Create all leaf cubes with their saved brains
//   2. For each ghost, find its nearestLeafId, clone that brain
//      (the leaf inherited from the ghost anyway, so weights are close)
//   3. Apply a TINY reverse-mutation to ghost brains to simulate
//      the fact that ancestors had slightly different weights
//      (cosmetic — makes the simulation feel more accurate on resume)

function selectLeafNodes(aliveCubes: Cube[]): { leaves: Cube[], ghosts: Cube[] } {
  // Build parent -> children map
  const childrenOf = new Map<number, number[]>();
  const cubeMap = new Map<number, Cube>();
  
  for (const cube of aliveCubes) {
    cubeMap.set(cube.id, cube);
    // parentId is stored in cube.lineage[0]
    const parentId = cube.lineage[0] ?? null;
    if (parentId !== null) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId)!.push(cube.id);
    }
  }
  
  // A leaf is a cube with no ALIVE children
  const leaves: Cube[] = [];
  const ghosts: Cube[] = [];
  
  for (const cube of aliveCubes) {
    const children = childrenOf.get(cube.id) ?? [];
    const aliveChildren = children.filter(id => cubeMap.has(id));
    
    if (aliveChildren.length === 0) {
      leaves.push(cube);   // No living descendants → leaf
    } else {
      ghosts.push(cube);   // Has living descendants → ghost save
    }
  }
  
  // Sort leaves: deepest generation first, then highest fitness
  leaves.sort((a, b) => {
    if (b.generation !== a.generation) return b.generation - a.generation;
    return b.fitness - a.fitness;
  });
  
  // Assign each ghost its nearest leaf descendant for brain cloning on load
  for (const ghost of ghosts) {
    const descendantLeaf = findNearestLeafDescendant(ghost.id, childrenOf, cubeMap, leaves);
    ghost._nearestLeafId = descendantLeaf?.id ?? leaves[0]?.id;
  }
  
  return { leaves, ghosts };
}
```

**Why this matters for save file size:**

Each brain is ~1,200 weights (14×20 + 20 + 20×16 + 16 + 16×8 + 8 = 1,000 weights). As a JSON number array, that's roughly 8KB per brain. With 10 cubes:
- Naive save: 10 brains × 8KB = 80KB of brain data
- Leaf-node save: 5 leaves × 8KB + 5 ghosts × 0KB = 40KB of brain data

At 100 cubes the savings are much bigger — maybe 20 leaves and 80 ghosts, saving 640KB. And the leaves are the ones that MATTER because they carry the most evolved intelligence.

On load, ghost cubes get perfectly usable brains cloned from their descendants. The simulation resumes seamlessly — you'd never notice the difference.

**SaveSchema.ts responsibilities:**
1. Define TypeScript interfaces for each save version.
2. `migrate(save: any): SaveFile` — Detects version, applies sequential migrations. Example: v1.0 → v1.1 adds `attackerHallOfFame` field with empty default.
3. `validate(save: any): boolean` — Checks required fields exist and types are correct. Rejects corrupt saves gracefully.

**Critical: Float32Array serialization**
Neural network weights are `Float32Array` internally but must be converted to `number[]` for JSON serialization. On load, convert back. This is a common gotcha — handle it in Serializer, not scattered across entity code.

```typescript
// Serialize
const weightsArray = Array.from(brain.getWeights()); // Float32Array → number[]

// Deserialize
const weights = new Float32Array(savedWeights);       // number[] → Float32Array
brain.setWeights(weights);
```

**localStorage size limit:**
Browsers typically allow 5–10MB per origin in `localStorage`. A late-game save with 100 cubes, 50 Hall of Fame genomes, and 150 structures should be roughly 500KB–2MB. Well within limits. But implement a size check — if save exceeds 4MB, warn the user and suggest file export instead.

**Emergency save on tab close:**
Register a `beforeunload` handler. Since `beforeunload` has very limited time, do a minimal save: just the Hall of Fame genomes + simulation metadata. Skip individual entity positions. On reload, this "emergency save" would restart the world but with the evolved brains — so evolution isn't lost even if the tab crashes.

```typescript
window.addEventListener('beforeunload', () => {
  const emergencySave = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    simulation: getSimulationState(),
    hallOfFame: serializeHallOfFame(),
    // Skip cubes, attackers, food, structures — not enough time
    _emergency: true
  };
  localStorage.setItem('cube-genesis-emergency', JSON.stringify(emergencySave));
});
```

On load, if both a full autosave and an emergency save exist, use whichever is newer.

### UI Elements for Save/Load

Add to the bottom control bar:
```
[Pause] [1x] [3x] [8x] [20x]  |  [Save] [Load] [Export]
```

Add to HUD top-right stats panel:
```
LAST SAVED     12s ago
```
This shows a live counter since last auto-save. Turns yellow if > 120s (save may have failed).

Add resume modal (shown on page load if save exists):
```
┌─────────────────────────────────────┐
│         CUBE GENESIS                │
│                                     │
│  Previous simulation detected:      │
│                                     │
│  Generation:  247                   │
│  Era:         3 — Duplication       │
│  Population:  34                    │
│  Civ Score:   312                   │
│  World Age:   14,521                │
│  Saved:       2 hours ago           │
│                                     │
│  [▶ Resume]         [✦ New World]   │
└─────────────────────────────────────┘
```
Styled to match HUD aesthetic — dark background, teal glow, Orbitron font.

### Save Config Constants (add to config.ts)

```typescript
// Persistence
AUTOSAVE_INTERVAL: 3600,        // ticks (roughly 60 seconds at 1x)
AUTOSAVE_ON_ERA_CHANGE: true,
EMERGENCY_SAVE_ON_UNLOAD: true,
MAX_LOCALSTORAGE_SIZE: 4_000_000, // 4MB warning threshold
SAVE_VERSION: '1.0.0',
STATS_HISTORY_LENGTH: 500,       // data points kept for graphs
```

---

## Development Order (Build in this sequence)

### Phase 1 — Foundation
1. Vite project setup, Three.js scene with grid, fog, camera controller
2. `config.ts` with all constants
3. Spatial hash implementation
4. Basic cube entity: renders, moves randomly, has energy drain, dies

### Phase 2 — Brain
5. Neural network implementation (forward pass, weight mutation, clone)
6. Reinforcement learning weight update
7. Sensory input gathering
8. Wire brain to cube movement — cube should now move based on neural net output

### Phase 3 — Survival Loop
9. Food entity: spawning, eating, particles
10. Cube learns to seek food (verify RL is working — cube should visibly improve over 20+ generations)
11. Death, respawn with mutated brain
12. Basic HUD: population, generation, energy

### Phase 4 — Danger
13. Wave 1 attackers (Drifters): random walk, damage on contact
14. Wave 2 attackers (Seekers): homing behavior
15. Cube learns to avoid attackers while still seeking food

### Phase 4.5 — Persistence (Build early, saves pain later)
15a. SaveSchema.ts — define versioned save format
15b. Serializer.ts — serialize/deserialize all current entities (cubes, food, attackers)
15c. SaveManager.ts — auto-save to localStorage every 60s, manual save/load buttons
15d. Resume modal on page load
15e. Emergency save on beforeunload
15f. File export/import (.json download and upload)
NOTE: Build this BEFORE adding more entity types. Every new entity added after this phase must implement serialize/deserialize methods. If you wait until Phase 8, retrofitting persistence onto 6 entity types is painful.

### Phase 5 — Duplication & Evolution
16. Duplication mechanic
17. Genome hall of fame + crossover
18. Multiple cubes on screen, natural selection in action
19. Wave 3 attackers (Pack Hunters)

### Phase 6 — Society
20. Era manager + era transition effects
21. Social proximity bonus (Cooperation era)
22. Wave 4 attackers (Adaptive Predators with their own neural nets)
23. Ally sensing inputs, signal output
24. Full HUD: inspector panel, timeline, event log

### Phase 7 — Civilization
25. Structure building system
26. Wall, Shelter, Beacon types
27. Wave 5 attackers (Siege Entities)
28. Settlement detection (cluster of structures = settlement glow)
29. Wave 6 attackers (Swarm Intelligence)
30. Role specialization tracking

### Phase 8 — Polish
31. Particle system (death, birth, eat, build effects)
32. Trails
33. Post-processing (bloom, grain, vignette)
34. Mini graphs
35. Performance optimization pass
36. Shareable save URLs (compress + base64 + clipboard)
37. Save file migration system (for future schema changes)
38. Sound (if time)

---

## Testing Criteria

After each phase, verify:
- **Phase 2**: Cube output changes based on input. Weights update when reward is given. 
- **Phase 3**: After 30+ generations, cubes visibly move toward food more often than away.
- **Phase 4**: After 50+ generations with attackers, cubes show avoidance behavior (turning away, fleeing).
- **Phase 4.5**: Save → reload page → resume produces identical simulation state. File export → import on fresh tab works. Emergency save preserves Hall of Fame.
- **Phase 5**: Population sustains itself above 5 for extended periods. Generation counter climbs.
- **Phase 6**: Cubes form visible clusters. Avg survival time increases.
- **Phase 7**: Structures appear. Settlements form near food-rich areas.

If any test fails, the reward system or mutation rates need tuning — adjust in config.ts.

---

## CRITICAL RULES FOR CLAUDE CODE

1. **NEVER hardcode intelligent behavior.** The cube must learn everything through its neural network. No `if (nearAttacker) { turnAway(); }`. The network outputs control everything.
2. **Start with ONE cube.** Not 10. Not 50. One. It dies, respawns, dies, respawns. The drama is in watching that one lineage evolve.
3. **Keep the void empty.** Resist the urge to add terrain, skyboxes, decorations. The aesthetic is minimalist darkness with glowing geometry. Less is more.
4. **Energy is the only currency.** Everything costs energy. Moving costs energy. Building costs energy. Existing costs energy. Food is the only source. This creates pressure.
5. **Attackers MUST co-evolve.** Wave 4+ attackers learn too. If cubes always dodge left, predators must learn to anticipate that. The arms race is the engine of progress.
6. **Era unlocks are celebrations.** Make them feel momentous. Slow-mo, flash, text. The user should feel the weight of 200 generations of evolution leading to this moment.
7. **Performance is non-negotiable.** If it drops below 30fps, reduce entity counts before adding features. Use spatial hashing. Use instancing. Profile before guessing.
8. **The config file is sacred.** Every number that affects simulation behavior must be in config.ts. No magic numbers in logic files. Ever.
9. **Build incrementally and verify each phase.** Don't build all 8 phases then test. Each phase should produce a working, observable simulation.
10. **When in doubt, serve the emergence.** Every design decision should ask: "Does this make it more likely that intelligent behavior emerges naturally?" If yes, do it. If no, skip it.
11. **Every entity must be serializable.** When adding a new entity type or new state to an existing entity, ALWAYS add the corresponding serialize/deserialize logic in Serializer.ts at the same time. Never leave persistence as a "later" task. If it exists in memory, it must exist in the save file.