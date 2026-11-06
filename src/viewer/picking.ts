// Tap detection and tap picking. Needs three.js scene objects and a camera, but no renderer.
import * as THREE from 'three';
import type { Filter, Part } from '../domain/model.js';
import { matchesFilter } from '../domain/parts.js';
import type { PartMesh } from './meshes.js';

export const TAP_MAX_MOVE_PX = 8;
export const TAP_MAX_MS = 500;
export const TAP_RADII_PX = [8, 16, 24];   // thin planks are hard to hit, so also try rays around the fingertip

/** Screen offsets a tap tries in turn: the tap point, then 8 points on each ring of TAP_RADII_PX. */
export const TAP_OFFSETS: [number, number][] = [[0, 0]];
for (const r of TAP_RADII_PX) {
  for (let i = 0; i < 8; i++) TAP_OFFSETS.push([r * Math.cos(i * Math.PI / 4), r * Math.sin(i * Math.PI / 4)]);
}

/** A pointer position and time, in px and ms. */
export interface PointerMark { x: number; y: number; t: number }

/** The fields of a pointer event the tap tracker reads. */
export type TapPointer = Pick<PointerEvent, 'clientX' | 'clientY' | 'isPrimary'>;

export interface TapTracker {
  down(e: TapPointer): void;
  up(e: TapPointer): void;
}

/** press and release are { x, y, t } in px and ms. */
export function isTap(press: PointerMark, release: PointerMark): boolean {
  const moved = Math.hypot(release.x - press.x, release.y - press.y);
  const elapsed = release.t - press.t;
  return moved <= TAP_MAX_MOVE_PX && elapsed <= TAP_MAX_MS;
}

/** Follows the primary pointer from down to up, and calls onTap(clientX, clientY) for a tap. */
export function createTapTracker(onTap: (x: number, y: number) => void, now = () => performance.now()): TapTracker {
  let press: PointerMark | null = null;
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
export function pickPart<P extends Pick<Part, 'module' | 'source'>>({ x, y, rect, camera, meshes, filter, raycaster = defaultRaycaster }: {
  x: number;
  y: number;
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  camera: THREE.Camera;
  meshes: readonly PartMesh<P>[];
  filter: Filter;
  raycaster?: THREE.Raycaster;
}): P | null {
  const targets = meshes.filter(m => matchesFilter(m.userData.part, filter));
  for (const [dx, dy] of TAP_OFFSETS) {
    const ndc = new THREE.Vector2((x + dx - rect.left) / rect.width * 2 - 1, -((y + dy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(targets, false);
    // Only part meshes are targets, so whatever the ray hit is one.
    if (hits.length) return (hits[0].object as PartMesh<P>).userData.part;
  }
  return null;
}
