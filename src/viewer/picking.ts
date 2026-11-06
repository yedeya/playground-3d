// Tap detection and tap picking. Needs three.js scene objects and a camera, but no renderer.
import * as THREE from 'three';
import { matchesFilter } from '../domain/parts.js';

export const TAP_MAX_MOVE_PX = 8;
export const TAP_MAX_MS = 500;
export const TAP_RADII_PX = [8, 16, 24];   // thin planks are hard to hit, so also try rays around the fingertip

/** Screen offsets a tap tries in turn: the tap point, then 8 points on each ring of TAP_RADII_PX. */
export const TAP_OFFSETS = [[0, 0]];
for (const r of TAP_RADII_PX) {
  for (let i = 0; i < 8; i++) TAP_OFFSETS.push([r * Math.cos(i * Math.PI / 4), r * Math.sin(i * Math.PI / 4)]);
}

/** press and release are { x, y, t } in px and ms. */
export function isTap(press, release) {
  const moved = Math.hypot(release.x - press.x, release.y - press.y);
  const elapsed = release.t - press.t;
  return moved <= TAP_MAX_MOVE_PX && elapsed <= TAP_MAX_MS;
}

/** Follows the primary pointer from down to up, and calls onTap(clientX, clientY) for a tap. */
export function createTapTracker(onTap, now = () => performance.now()) {
  let press = null;
  return {
    down(e) {
      press = e.isPrimary ? { x: e.clientX, y: e.clientY, t: now() } : null;
    },
    up(e) {
      if (!press || !e.isPrimary) return;
      const tap = isTap(press, { x: e.clientX, y: e.clientY, t: now() });
      press = null;
      if (tap) onTap(e.clientX, e.clientY);
    },
  };
}

const defaultRaycaster = new THREE.Raycaster();

/** The part a tap at client (x, y) picks among the part meshes inside the filter, or null. */
export function pickPart({ x, y, rect, camera, meshes, filter, raycaster = defaultRaycaster }) {
  const targets = meshes.filter(m => matchesFilter(m.userData.part, filter));
  for (const [dx, dy] of TAP_OFFSETS) {
    const ndc = new THREE.Vector2((x + dx - rect.left) / rect.width * 2 - 1, -((y + dy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length) return hits[0].object.userData.part;
  }
  return null;
}
