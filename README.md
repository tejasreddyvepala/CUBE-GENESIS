# genesis_rl

> *A single cube. Zero knowledge. Watch intelligence emerge.*

<!-- SCREENSHOT: Hub landing page -->

genesis_rl is a browser-based artificial life simulator. One white cube spawns into an infinite dark void with a neural network brain and no instructions. Through reinforcement learning and evolutionary pressure, it learns to survive, duplicate, cooperate, build, and eventually form a civilization — entirely on its own.

You are a spectator. The AI drives everything.

---

## How It Works

<!-- SCREENSHOT: Early simulation — single cube exploring, food orbs visible -->

Each cube's brain is a feedforward neural network. It receives sensory inputs (nearest food, nearest attacker, energy level, nearby allies) and outputs movement and action decisions. There is no hardcoded behavior — the cube must discover everything through trial, death, and inheritance.

**Two learning mechanisms run simultaneously:**

- **Reinforcement Learning** — weights adjust in real time based on reward signals (eating food, dodging attackers, surviving ticks, dying)
- **Evolutionary Selection** — when a cube dies, its genome is scored by fitness. The best genomes are preserved in a Hall of Fame and passed to offspring with mutation and crossover

Behaviors like food-seeking, danger avoidance, wall-hugging, and group clustering are never programmed. They emerge because the reward system makes them worth learning.

---

## The 10 Eras

<!-- SCREENSHOT: Timeline bar showing era progression -->

The simulation progresses through 10 eras gated by a civilization score. Each era introduces new abilities and a new attacker wave that invalidates whatever strategy was working before.

| Era | Name | What Changes |
|-----|------|-------------|
| 1 | Survival | Basic movement and eating. Drifters spawn. |
| 2 | Awareness | Extended vision, sprint ability. Seekers are faster than the cube. |
| 3 | Duplication | Cubes split. Population grows. Pack hunters coordinate. |
| 4 | Cooperation | Ally sensing, social rewards. Adaptive Predators have their own brains. |
| 5 | Construction | Build walls, shelters, beacons. Siege Entities target structures. |
| 6 | Civilization | Role specialization, settlements. Swarm Intelligence is the fastest enemy. |
| 7 | Expansion | Titan-class enemies. Faction dynamics emerge. |
| 8 | Catastrophe | Random disasters: drought, mega-swarms, plague, void mist. |
| 9 | Convergence | The population adapts or collapses. |
| 10 | Singularity | Survive long enough and the simulation transcends its origins. |

---

## Attacker Waves

<!-- SCREENSHOT: Multiple attacker types visible — pack hunters, predator, siege entity -->

Attackers are not static obstacles. They co-evolve.

- **Drifters** — random walk, slower than the cube. The only easy enemy.
- **Seekers** — faster than the cube. Running stops working.
- **Pack Hunters** — faster and coordinated. Groups of 3–5.
- **Adaptive Predators** — neural network controlled, learn to anticipate cube movement.
- **Siege Entities** — slow, tanky, destroy structures on contact.
- **Swarm Intelligence** — the fastest thing in the world. Hive mind.
- **Titans** — massive, unstoppable. Require coordinated defense.
- **Voidswarm** — shared-brain micro-units that flood the map.

The speed hierarchy is intentional: the cube is slower than most attackers. It survives through intelligence, not raw speed.

---

## Features

<!-- SCREENSHOT: HUD with stats panel, inspector panel open on a cube -->

- **Real-time neural activity** — click any cube to inspect its brain, reward rate, lineage, and live stats
- **Reward bars** — floating indicators above every entity show who is thriving and who is about to die
- **10-era timeline** — scrollable progress bar showing civilization advancement
- **Full event log** — press `L` to open a timestamped history of every significant event
- **Simulation configurator** — set world size, starting cubes, food supply, attacker pressure, evolution speed, and seed before starting
- **Save / Load / Export** — auto-saves every 60 seconds, manual export to `.json`, resume modal on page load
- **Multiple speed modes** — 1x, 3x, 8x, 20x simulation speed
- **Mini graphs** — press `G` for live population, fitness, food, and kill/death charts

---

## Controls

| Input | Action |
|-------|--------|
| Drag | Orbit camera |
| Scroll | Zoom |
| Click entity | Inspect + follow |
| Double-click void | Return to overview |
| Space | Follow nearest action |
| G | Toggle mini graphs |
| L | Open full event log |
| 1x / 3x / 8x / 20x | Simulation speed |

---

## Tech Stack

- **Three.js** — 3D rendering, instanced meshes, post-processing
- **TypeScript** — strict mode throughout
- **Vite** — dev server and production build
- **Custom neural network** — feedforward net with backprop, no ML libraries
- **Spatial hashing** — O(1) neighbor queries for 100+ entities at 60fps
- **No backend. No database. Runs entirely in the browser.**

---

## Running Locally

```bash
git clone https://github.com/tejasreddyvepala/CUBE-GENESIS
cd CUBE-GENESIS
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Live Demo

<!-- SCREENSHOT: Game end screen — SINGULARITY ACHIEVED -->

[**Play genesis_rl →**](https://tejasreddyvepala.github.io/CUBE-GENESIS)

---

*Built as an exploration of emergent intelligence — what happens when you give something the capacity to learn, then get out of its way.*
