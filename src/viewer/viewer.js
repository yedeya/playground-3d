// Three.js scene: one mesh per part, orbit controls, tap picking. Renders on demand to spare the phone battery.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { matchesFilter } from '../domain/parts.js';

const SELECT = 0xff1f6b;
const TAP_MAX_MOVE_PX = 8;
const TAP_MAX_MS = 500;
const TAP_RADII_PX = [8, 16, 24];   // thin planks are hard to hit, so also try rays around the fingertip

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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(part.tri.map(v => v / 1000)), 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 25),
      new THREE.LineBasicMaterial({ color: 0x1c2a2f, transparent: true, opacity: 0.45 }),
    );
    mesh.add(edges);
    mesh.userData = { part, edges };
    scene.add(mesh);
    return mesh;
  });

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const grid = new THREE.GridHelper(10, 10, 0x9fb0b4, 0xb7c5c8);
  grid.position.set(Math.round(center.x), 0, Math.round(center.z));
  scene.add(grid);

  // Translucent copy without depth test, so a selected part stays visible behind other parts.
  const xray = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: SELECT, transparent: true, opacity: 0.4, depthTest: false, side: THREE.DoubleSide,
  }));
  xray.renderOrder = 10;
  xray.visible = false;
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
  function pick(x, y) {
    const rect = canvas.getBoundingClientRect();
    const { filter } = store.get();
    const targets = meshes.filter(m => matchesFilter(m.userData.part, filter));
    const offsets = [[0, 0]];
    for (const r of TAP_RADII_PX) {
      for (let i = 0; i < 8; i++) offsets.push([r * Math.cos(i * Math.PI / 4), r * Math.sin(i * Math.PI / 4)]);
    }
    for (const [dx, dy] of offsets) {
      const ndc = new THREE.Vector2((x + dx - rect.left) / rect.width * 2 - 1, -((y + dy - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length) return hits[0].object.userData.part;
    }
    return null;
  }

  let press = null;
  canvas.addEventListener('pointerdown', e => {
    press = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  window.addEventListener('pointerup', e => {
    if (!press || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    const elapsed = performance.now() - press.t;
    press = null;
    if (moved <= TAP_MAX_MOVE_PX && elapsed <= TAP_MAX_MS) onPick(pick(e.clientX, e.clientY));
  });

  function apply(state) {
    xray.visible = false;
    for (const mesh of meshes) {
      const { part, edges } = mesh.userData;
      const visible = matchesFilter(part, state.filter);
      const selected = part.id === state.selected;
      const material = mesh.material;
      if (selected) {
        material.color.setHex(SELECT);
        xray.geometry = mesh.geometry;
        xray.visible = true;
      } else {
        const [r, g, b] = state.natural ? part.natural : data.moduleColors[part.module];
        material.color.setRGB(r, g, b, THREE.SRGBColorSpace);
      }
      material.emissive.setHex(selected ? SELECT : 0x000000);
      material.emissiveIntensity = selected ? 0.75 : 0;
      material.transparent = !visible;
      material.opacity = visible ? 1 : 0.09;
      material.depthWrite = visible;
      edges.visible = visible;
      material.needsUpdate = true;
    }
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
