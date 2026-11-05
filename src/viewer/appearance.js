// How the state looks in the scene: a part's colour, emission and transparency, and the x-ray of the selected part.
import * as THREE from 'three';
import { matchesFilter } from '../domain/parts.js';

export const SELECT = 0xff1f6b;

/**
 * A part's appearance for a state. `color` is the hex SELECT for the selected part, and otherwise
 * an sRGB [r, g, b] triple: the part's wood colour in wood colours, its module's colour otherwise.
 */
export function appearanceOf(part, state, moduleColors) {
  const visible = matchesFilter(part, state.filter);
  const selected = part.id === state.selected;
  return {
    selected,
    color: selected ? SELECT : (state.natural ? part.natural : moduleColors[part.module]),
    emissive: selected ? SELECT : 0x000000,
    emissiveIntensity: selected ? 0.75 : 0,
    transparent: !visible,
    opacity: visible ? 1 : 0.09,
    depthWrite: visible,
    edges: visible,
  };
}

/** Translucent copy without depth test, so a selected part stays visible behind other parts. */
export function createXray() {
  const xray = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: SELECT, transparent: true, opacity: 0.4, depthTest: false, side: THREE.DoubleSide,
  }));
  xray.renderOrder = 10;
  xray.visible = false;
  return xray;
}

/** Paints every part mesh (see meshes.js) for the state, and puts the x-ray on the selected one. */
export function applyAppearance(meshes, xray, state, moduleColors) {
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
