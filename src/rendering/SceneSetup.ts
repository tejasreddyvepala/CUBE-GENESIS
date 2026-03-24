// ============================================================
// CUBE GENESIS — Scene Setup
// Creates the Three.js scene, renderer, camera, lights, and
// environmental elements (grid, starfield, dust).
// ============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.ts';

export class SceneSetup {
  // ──────────────────────────────────────────────
  // SCENE
  // ──────────────────────────────────────────────

  static createScene(): THREE.Scene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.FOG_COLOR);
    scene.fog = new THREE.FogExp2(CONFIG.FOG_COLOR, CONFIG.FOG_DENSITY);
    return scene;
  }

  // ──────────────────────────────────────────────
  // RENDERER
  // ──────────────────────────────────────────────

  static createRenderer(canvas: HTMLCanvasElement | null): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas: canvas ?? undefined,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
  }

  // ──────────────────────────────────────────────
  // CAMERA
  // ──────────────────────────────────────────────

  static createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const dist = CONFIG.CAMERA_DEFAULT_DISTANCE;
    camera.position.set(dist * 0.5, dist * 0.7, dist * 0.5);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  // ──────────────────────────────────────────────
  // LIGHTS
  // ──────────────────────────────────────────────

  static createLights(scene: THREE.Scene): {
    directional: THREE.DirectionalLight;
    ambient: THREE.AmbientLight;
    fill: THREE.DirectionalLight;
  } {
    const ambient = new THREE.AmbientLight(CONFIG.AMBIENT_LIGHT_COLOR, CONFIG.AMBIENT_LIGHT_INTENSITY);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(CONFIG.DIR_LIGHT_COLOR, CONFIG.DIR_LIGHT_INTENSITY);
    directional.position.set(50, 100, 50);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 1024;
    directional.shadow.mapSize.height = 1024;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 300;
    directional.shadow.camera.left = -80;
    directional.shadow.camera.right = 80;
    directional.shadow.camera.top = 80;
    directional.shadow.camera.bottom = -80;
    scene.add(directional);

    // Fill light from opposite side (softer, cooler)
    const fill = new THREE.DirectionalLight(0x8899bb, 0.25);
    fill.position.set(-50, 30, -50);
    scene.add(fill);

    return { directional, ambient, fill };
  }

  // ──────────────────────────────────────────────
  // GRID
  // ──────────────────────────────────────────────

  static createGrid(scene: THREE.Scene): THREE.Group {
    const group = new THREE.Group();

    // Main grid — visible lines every 10 units
    const mainGrid = new THREE.GridHelper(CONFIG.GRID_SIZE, 12, 0x3a3a52, 0x3a3a52);
    (mainGrid.material as THREE.LineBasicMaterial).transparent = true;
    (mainGrid.material as THREE.LineBasicMaterial).opacity = 0.7;
    group.add(mainGrid);

    // Sub grid — faint lines every 2.5 units
    const subGrid = new THREE.GridHelper(CONFIG.GRID_SIZE, 48, 0x252538, 0x252538);
    (subGrid.material as THREE.LineBasicMaterial).transparent = true;
    (subGrid.material as THREE.LineBasicMaterial).opacity = 0.35;
    group.add(subGrid);

    scene.add(group);
    return group;
  }

  static createGroundPlane(scene: THREE.Scene): THREE.Mesh {
    const groundGeo = new THREE.PlaneGeometry(CONFIG.GRID_SIZE, CONFIG.GRID_SIZE);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x13131e, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05; // just below grid
    ground.receiveShadow = true;
    scene.add(ground);
    return ground;
  }

  // ──────────────────────────────────────────────
  // DYNAMIC WORLD RESIZE (Era 7+ expansion)
  // Swaps out GridHelpers and resizes ground plane to match new world size.
  // ──────────────────────────────────────────────

  static updateWorldSize(gridGroup: THREE.Group, groundMesh: THREE.Mesh, newSize: number, scene?: THREE.Scene): void {
    // Dispose and remove all old grid children
    while (gridGroup.children.length > 0) {
      const child = gridGroup.children[0] as THREE.Mesh;
      child.geometry?.dispose();
      gridGroup.remove(child);
    }

    // Rebuild main grid — 10-unit cells
    const mainDivisions = Math.min(Math.round(newSize / 10), 120); // cap to avoid too many lines
    const mainGrid = new THREE.GridHelper(newSize, mainDivisions, 0x3a3a52, 0x3a3a52);
    (mainGrid.material as THREE.LineBasicMaterial).transparent = true;
    (mainGrid.material as THREE.LineBasicMaterial).opacity = 0.7;
    gridGroup.add(mainGrid);

    // Rebuild sub grid — 2.5-unit cells (cap subdivisions for perf)
    const subDivisions = Math.min(Math.round(newSize / 2.5), 240);
    const subGrid = new THREE.GridHelper(newSize, subDivisions, 0x252538, 0x252538);
    (subGrid.material as THREE.LineBasicMaterial).transparent = true;
    (subGrid.material as THREE.LineBasicMaterial).opacity = 0.35;
    gridGroup.add(subGrid);

    // Resize ground plane
    groundMesh.geometry.dispose();
    groundMesh.geometry = new THREE.PlaneGeometry(newSize, newSize);

    // Reduce fog density so the expanded outer zone stays visible
    if (scene?.fog instanceof THREE.FogExp2) {
      scene.fog.density = CONFIG.FOG_DENSITY * (CONFIG.WORLD_SIZE / newSize);
    }
  }

  // ──────────────────────────────────────────────
  // STARFIELD
  // ──────────────────────────────────────────────

  static createStarfield(scene: THREE.Scene): THREE.Points {
    const positions = new Float32Array(CONFIG.STAR_COUNT * 3);

    for (let i = 0; i < CONFIG.STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = CONFIG.STAR_SPHERE_RADIUS;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
    });

    const stars = new THREE.Points(geo, mat);
    scene.add(stars);
    return stars;
  }

  // ──────────────────────────────────────────────
  // AMBIENT DUST MOTES
  // ──────────────────────────────────────────────

  static createAmbientDust(scene: THREE.Scene): THREE.Points {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const half = CONFIG.WORLD_SIZE / 2;

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() * 2 - 1) * half;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * half;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.15,
    });

    const dust = new THREE.Points(geo, mat);
    scene.add(dust);
    return dust;
  }

  // ──────────────────────────────────────────────
  // DUST ANIMATION (call each frame)
  // ──────────────────────────────────────────────

  static animateDust(dust: THREE.Points, deltaTime: number): void {
    const positions = (dust.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const half = CONFIG.WORLD_SIZE / 2;
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] += 0.002 * deltaTime * 60;
      if (positions[i * 3 + 1] > 20) {
        positions[i * 3 + 1] = 0;
        positions[i * 3]     = (Math.random() * 2 - 1) * half;
        positions[i * 3 + 2] = (Math.random() * 2 - 1) * half;
      }
    }
    (dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
