// Three.js scene: one mesh per part, orbit controls, tap picking. Renders on demand to spare the phone battery.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyAppearance, createXray } from './appearance.js';
import { partMesh } from './meshes.js';
import { createTapTracker, pickPart } from './picking.js';

export function createViewer({ canvas, data, store, onPick }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdbe5ea);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6a0, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(4, 7, 5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.75);
  fill.position.set(-5, 3, -4);
  scene.add(fill);

  const bounds = new THREE.Box3();
  const meshes = data.parts.map(part => {
    const mesh = partMesh(part);
    bounds.union(mesh.geometry.boundingBox);
    scene.add(mesh);
    return mesh;
  });

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const grid = new THREE.GridHelper(10, 10, 0x9fb0b4, 0xb7c5c8);
  grid.position.set(Math.round(center.x), 0, Math.round(center.z));
  scene.add(grid);

  const xray = createXray();
  scene.add(xray);

  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.4;
  controls.maxDistance = 22;
  const draw = () => renderer.render(scene, camera);
  controls.addEventListener('change', draw);

  function home() {
    // Distance that fits the whole toestel in the current frame, portrait included.
    const radius = 0.5 * Math.hypot(size.x, size.y, size.z);
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const distance = radius / Math.sin(Math.min(vfov, hfov) / 2) * 0.85;
    const direction = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();
    controls.target.set(center.x, size.y * 0.42, center.z);
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
    draw();
  }

  function fit() {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    draw();
  }

  const raycaster = new THREE.Raycaster();
  const pick = (x, y) => pickPart({
    x, y, rect: canvas.getBoundingClientRect(), camera, meshes, filter: store.get().filter, raycaster,
  });

  const tracker = createTapTracker((x, y) => onPick(pick(x, y)));
  canvas.addEventListener('pointerdown', tracker.down);
  window.addEventListener('pointerup', tracker.up);

  function apply(state) {
    applyAppearance(meshes, xray, state, data.moduleColors);
    draw();
  }

  new ResizeObserver(fit).observe(canvas.parentElement);
  const rect = canvas.parentElement.getBoundingClientRect();
  camera.aspect = rect.width / Math.max(rect.height, 1);
  camera.updateProjectionMatrix();
  fit();
  home();
  store.subscribe(apply);
  apply(store.get());

  return { home };
}
