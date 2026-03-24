// ============================================================
// CUBE GENESIS — Entry Point & Game Loop
// Wires together all systems. Drives the simulation.
// ============================================================

import * as THREE from 'three';
import { CONFIG } from './config.ts';
import { initGlobalRNG } from './utils/math.ts';
import { fpsCounter } from './utils/debug.ts';

// World & Systems
import { World } from './world/World.ts';
import { Serializer } from './persistence/Serializer.ts';
import { SaveManager } from './persistence/SaveManager.ts';
import { SaveFile } from './persistence/SaveSchema.ts';

// Rendering
import { SceneSetup } from './rendering/SceneSetup.ts';
import { CameraController } from './rendering/CameraController.ts';
import { ParticleSystem } from './rendering/ParticleSystem.ts';
import { TrailRenderer } from './rendering/TrailRenderer.ts';
import { CubeRenderer } from './rendering/CubeRenderer.ts';
import { AttackerRenderer } from './rendering/AttackerRenderer.ts';
import { StructureRenderer } from './rendering/StructureRenderer.ts';
import { RewardBarSystem } from './rendering/RewardBarSystem.ts';

// UI
import { HUD } from './ui/HUD.ts';
import { Timeline } from './ui/Timeline.ts';
import { EventLog } from './ui/EventLog.ts';
import { InspectorPanel } from './ui/InspectorPanel.ts';
import { StatsGraph } from './ui/StatsGraph.ts';

// ──────────────────────────────────────────────
// INITIALIZE PRNG
// ──────────────────────────────────────────────
initGlobalRNG(CONFIG.SEED);

// ──────────────────────────────────────────────
// SCENE SETUP
// ──────────────────────────────────────────────
const container = document.getElementById('canvas-container')!;
const scene = SceneSetup.createScene();
const renderer = SceneSetup.createRenderer(null);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const camera = SceneSetup.createCamera();
SceneSetup.createLights(scene);
SceneSetup.createGrid(scene);
SceneSetup.createGroundPlane(scene);
SceneSetup.createStarfield(scene);
const dustPoints = SceneSetup.createAmbientDust(scene);

// ──────────────────────────────────────────────
// WORLD
// ──────────────────────────────────────────────
const world = new World(scene, CONFIG.SEED);

// ──────────────────────────────────────────────
// RENDERING SYSTEMS
// ──────────────────────────────────────────────
const cameraController = new CameraController(camera);
const particles = new ParticleSystem(scene);
const trailRenderer = new TrailRenderer(scene);
const cubeRenderer = new CubeRenderer();
const attackerRenderer = new AttackerRenderer();
const structureRenderer = new StructureRenderer(scene);
const rewardBarSystem = new RewardBarSystem(scene);

// ──────────────────────────────────────────────
// UI SYSTEMS
// ──────────────────────────────────────────────
const hud = new HUD();
hud.setCameraController(cameraController);
const timeline = new Timeline();
const eventLog = new EventLog();
const inspector = new InspectorPanel();
const statsGraph = new StatsGraph();

// ──────────────────────────────────────────────
// PERSISTENCE
// ──────────────────────────────────────────────
const saveManager = new SaveManager(world);
const serializer = new Serializer();

saveManager.setOnSaved(() => hud.markSaved(frameCount));
saveManager.registerBeforeUnload();

// ──────────────────────────────────────────────
// ERA TRANSITION CALLBACK
// ──────────────────────────────────────────────
world.setEraTransitionCallback((newEra: number) => {
  const eraName = world.eraManager.getEraName(newEra);
  hud.showEraTransition(newEra, eraName);
  eventLog.addEvent(`Era ${newEra + 1} reached: ${eraName.toUpperCase()}`, 'era');
  if (CONFIG.AUTOSAVE_ON_ERA_CHANGE) {
    saveManager.autoSave();
  }
});

// ──────────────────────────────────────────────
// SIMULATION CONTROLS
// ──────────────────────────────────────────────
let simSpeedIndex: number = CONFIG.DEFAULT_SIM_SPEED_INDEX;
let paused = false;

document.getElementById('btn-pause')?.addEventListener('click', () => {
  paused = !paused;
  const btn = document.getElementById('btn-pause');
  if (btn) btn.textContent = paused ? 'RESUME' : 'PAUSE';
});

const speedButtons = [
  document.getElementById('btn-1x'),
  document.getElementById('btn-3x'),
  document.getElementById('btn-8x'),
  document.getElementById('btn-20x'),
];
speedButtons.forEach((btn, i) => {
  btn?.addEventListener('click', () => {
    simSpeedIndex = i;
    speedButtons.forEach((b, j) => b?.classList.toggle('active', j === i));
  });
});

// Camera buttons
const btnFollowBest = document.getElementById('btn-follow-best');
btnFollowBest?.addEventListener('click', () => {
  cameraController.toggleFollowBest(world.entityManager.getAliveCubes());
  btnFollowBest.classList.toggle('active', cameraController.followBestMode);
});

document.getElementById('btn-next-cube')?.addEventListener('click', () => {
  cameraController.cycleNext(world.entityManager.getAliveCubes());
  // Deactivate best-cam button when manually cycling
  btnFollowBest?.classList.remove('active');
});

// ──────────────────────────────────────────────
// KEYBOARD CONTROLS
// ──────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG') {
    statsGraph.toggle();
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (cameraController.followTarget) {
      cameraController.returnToAutoOrbit();
    } else {
      cameraController.followNearest(world.entityManager.getAliveCubes());
    }
  }
});

// ──────────────────────────────────────────────
// RAYCASTING FOR CUBE SELECTION
// ──────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function handleCubeClick(clientX: number, clientY: number): void {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const cubes = world.entityManager.getAliveCubes();
  const meshes = cubes.map(c => c.mesh);
  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    const cube = cubes.find(c => c.mesh === hitMesh);
    if (cube) {
      inspector.select(cube);
      cameraController.followCube(cube);
    }
  } else {
    // Check for double click to return to overview
    inspector.select(null);
  }
}

cameraController.setupMouseControls(renderer.domElement, handleCubeClick);
cameraController.setupKeyboardControls(() => world.entityManager.getAliveCubes());

// ──────────────────────────────────────────────
// SAVE / LOAD BUTTON WIRING
// ──────────────────────────────────────────────
saveManager.setupSaveButtons((save: SaveFile) => {
  loadSaveFile(save);
});

// ──────────────────────────────────────────────
// LOAD SAVE FILE
// ──────────────────────────────────────────────
function loadSaveFile(save: SaveFile): void {
  serializer.deserialize(save, world);
  eventLog.addEvent('Simulation resumed from save', 'event');
  inspector.select(null);
}

// ──────────────────────────────────────────────
// START — check for saved game
// ──────────────────────────────────────────────
function startSimulation(): void {
  world.initialize();
  eventLog.addEvent('Simulation started', 'event');
  eventLog.addEvent('Era 1: Survival', 'era');
}

void saveManager.checkAndShowResumeModal(
  (save: SaveFile) => {
    loadSaveFile(save);
  },
  () => {
    startSimulation();
  }
);

// ──────────────────────────────────────────────
// RESIZE HANDLER
// ──────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cameraController.handleResize();
});

// ──────────────────────────────────────────────
// LOADING SCREEN FADE
// ──────────────────────────────────────────────
setTimeout(() => {
  const loading = document.getElementById('loading-screen');
  if (loading) {
    loading.classList.add('fade-out');
    setTimeout(() => loading.remove(), 800);
  }
}, 600);

// ──────────────────────────────────────────────
// GAME LOOP
// ──────────────────────────────────────────────
let lastTime = performance.now();
let frameCount = 0;
let lastEventCheckTick = 0;
let prevPopulation = 0;

function animate(now: number): void {
  requestAnimationFrame(animate);

  const rawDelta = now - lastTime;
  lastTime = now;

  fpsCounter.tick(now);

  // Cap delta to prevent spiral of death
  const cappedDelta = Math.min(rawDelta, CONFIG.MAX_DELTA);
  const simSpeed = paused ? 0 : CONFIG.SIM_SPEEDS[simSpeedIndex];
  const simDelta = (cappedDelta / 1000) * simSpeed;

  // ── SIMULATION UPDATE ──
  if (simDelta > 0) {
    // Run multiple ticks for high sim speeds
    const subSteps = simSpeed > 3 ? Math.ceil(simSpeed / 3) : 1;
    const subDelta = simDelta / subSteps;

    for (let step = 0; step < subSteps; step++) {
      world.update(subDelta);

      // Check for interesting events (throttled)
      if (world.worldAge - lastEventCheckTick >= 60) {
        lastEventCheckTick = world.worldAge;
        _checkEvents();
      }

      // Auto-save check
      saveManager.checkAutoSave(world.worldAge);
    }
  }

  // ── RENDERING ──
  const cubes = world.entityManager.getAliveCubes();

  // Update cube renderers
  for (const cube of cubes) {
    cubeRenderer.updateCubeMesh(cube);
  }

  // Update attacker renderers
  for (const attacker of world.entityManager.getAliveAttackers()) {
    attackerRenderer.updateAttackerMesh(attacker);
  }

  // Update particles
  particles.update(cappedDelta / 1000);

  // Update trails
  trailRenderer.update(cubes, camera.position);

  // Update settlement glow
  structureRenderer.updateSettlementGlow(
    world.entityManager.getStructures(),
    world.getSettlements()
  );

  // Update dust
  SceneSetup.animateDust(dustPoints, cappedDelta / 1000);

  // Update reward bars (floating bars above cubes and neural attackers)
  rewardBarSystem.update(
    cubes,
    world.entityManager.getAliveAttackers(),
    camera.position
  );

  // ── CAMERA ──
  cameraController.update(cappedDelta / 1000, cubes);

  // Keep best-cam button state in sync (user may have returned to orbit via dblclick/space)
  if (frameCount % 30 === 0) {
    btnFollowBest?.classList.toggle('active', cameraController.followBestMode);
    const label = document.getElementById('cam-follow-label');
    if (label) label.textContent = cameraController.getFollowLabel();
  }

  // ── UI ──
  hud.update(world, frameCount);

  const stats = world.getWorldStats();
  timeline.update(stats.currentEra, stats.civScore);
  statsGraph.draw(world.statsHistory);

  // Inspector update (every frame when visible)
  inspector.update();

  // Sync inspector selection if cube died
  if (inspector.selectedCube && inspector.selectedCube.isDead()) {
    inspector.select(null);
    cameraController.returnToAutoOrbit();
  }

  // ── RENDER ──
  renderer.render(scene, camera);
  frameCount++;
}

// ──────────────────────────────────────────────
// EVENT DETECTION (throttled)
// ──────────────────────────────────────────────
function _checkEvents(): void {
  const stats = world.getWorldStats();

  // Population changes
  if (stats.population > prevPopulation) {
    const diff = stats.population - prevPopulation;
    if (diff >= 1) {
      const cubes = world.entityManager.getAliveCubes();
      const newest = cubes.sort((a, b) => b.age - a.age)[0]; // youngest = last spawned, sort by low age
      const youngest = cubes.reduce((min, c) => c.age < min.age ? c : min, cubes[0] ?? { id: 0, age: Infinity, generation: 1 });
      if (youngest) {
        eventLog.addEvent(`Cube #${youngest.id} duplicated (Gen ${youngest.generation})`, 'birth');
        // Spawn birth effect
        const parent = world.entityManager.cubes.get(youngest.lineage?.[0] ?? -1);
        if (parent) {
          particles.spawnBirthParticles(youngest.position);
        }
      }
    }
  }
  prevPopulation = stats.population;
}

// ──────────────────────────────────────────────
// START
// ──────────────────────────────────────────────
requestAnimationFrame(animate);

console.log('[CG] CUBE GENESIS initialized.');
console.log(`[CG] World: ${CONFIG.WORLD_SIZE}x${CONFIG.WORLD_SIZE}, Max cubes: ${CONFIG.MAX_CUBES}`);
console.log(`[CG] Brain layers: [${CONFIG.BRAIN_LAYERS.join(',')}]`);
