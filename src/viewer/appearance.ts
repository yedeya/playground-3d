// How the state looks in the scene: a part's colour, emission and transparency, and the x-ray of the selected part.
import * as THREE from 'three';
import type { ModuleCode, Part, Rgb } from '../domain/model';
import { matchesFilter } from '../domain/parts';
import type { AppState } from '../store';
import type { PartMesh } from './meshes';

export const SELECT = 0xff1f6b;

/** The fields of a part its appearance depends on. */
export type AppearancePart = Pick<Part, 'id' | 'module' | 'source' | 'natural'>;
export type ModuleColors = Readonly<Record<ModuleCode, Rgb>>;

export type Appearance = {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  edges: boolean;
  emissive: number;
  emissiveIntensity: number;
} & ({ selected: true; color: number } | { selected: false; color: Rgb });

/**
 * A part's appearance for a state. `color` is the hex SELECT for the selected part, and otherwise
 * an sRGB [r, g, b] triple: the part's wood colour in wood colours, its module's colour otherwise.
 */
export function appearanceOf(part: AppearancePart, state: AppState, moduleColors: ModuleColors): Appearance {
  const visible = matchesFilter(part, state.filter);
  const look = { transparent: !visible, opacity: visible ? 1 : 0.09, depthWrite: visible, edges: visible };
  if (part.id === state.selected) {
    return { selected: true, color: SELECT, emissive: SELECT, emissiveIntensity: 0.75, ...look };
  }
  return {
    selected: false,
    color: state.natural ? part.natural : moduleColors[part.module],
    emissive: 0x000000,
    emissiveIntensity: 0,
    ...look,
  };
}

/** Translucent copy without depth test, so a selected part stays visible behind other parts. */
export function createXray(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const xray = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: SELECT, transparent: true, opacity: 0.4, depthTest: false, side: THREE.DoubleSide,
  }));
  xray.renderOrder = 10;
  xray.visible = false;
  return xray;
}

/** Paints every part mesh (see meshes.ts) for the state, and puts the x-ray on the selected one. */
export function applyAppearance(
  meshes: readonly PartMesh<AppearancePart>[],
  xray: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
  state: AppState,
  moduleColors: ModuleColors,
): void {
  xray.visible = false;
  for (const mesh of meshes) {
    const { part, edges } = mesh.userData;
    const look = appearanceOf(part, state, moduleColors);
    const material = mesh.material;
    if (look.selected) {
      material.color.setHex(look.color);
      xray.geometry = mesh.geometry;
      xray.visible = true;
    } else {
      const [r, g, b] = look.color;
      material.color.setRGB(r, g, b, THREE.SRGBColorSpace);
    }
    material.emissive.setHex(look.emissive);
    material.emissiveIntensity = look.emissiveIntensity;
    material.transparent = look.transparent;
    material.opacity = look.opacity;
    material.depthWrite = look.depthWrite;
    edges.visible = look.edges;
    material.needsUpdate = true;
  }
}
