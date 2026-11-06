import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SELECT, appearanceOf, applyAppearance, createXray } from '../src/viewer/appearance';
import { partMeshes } from '../src/viewer/meshes';
import type { Rgb } from '../src/domain/model';
import type { AppState } from '../src/store';
import { committedModel } from './model-glb';

const data = await committedModel();

const part = (id: string) => data.parts.find(p => p.id === id)!;
const srgb = ([r, g, b]: Rgb) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const state = (patch: Partial<AppState>): AppState => ({ filter: null, selected: null, natural: false, ...patch });

describe('appearance of a part', () => {
  const ladder = part('C14_S1');
  const other = part('G01_slide');

  it('[APP-13] colours the selected part #ff1f6b with that emissive colour at intensity 0.75', () => {
    expect(SELECT).toBe(0xff1f6b);
    for (const natural of [false, true]) {
      expect(appearanceOf(ladder, state({ selected: ladder.id, natural }), data.moduleColors)).toEqual({
        selected: true, color: 0xff1f6b, emissive: 0xff1f6b, emissiveIntensity: 0.75,
        transparent: false, opacity: 1, depthWrite: true, edges: true,
      });
    }
  });

  it('[APP-13] gives any other part its wood colour in wood colours and its module colour otherwise', () => {
    expect(appearanceOf(other, state({ selected: ladder.id }), data.moduleColors)).toEqual({
      selected: false, color: data.moduleColors.G01, emissive: 0x000000, emissiveIntensity: 0,
      transparent: false, opacity: 1, depthWrite: true, edges: true,
    });
    expect(appearanceOf(other, state({ natural: true }), data.moduleColors)).toMatchObject({
      selected: false, color: other.natural, emissive: 0x000000, emissiveIntensity: 0,
    });
  });

  it('[APP-13] draws a part outside the filter at opacity 0.09 without depth writes or edges', () => {
    expect(appearanceOf(other, state({ filter: 'C14' }), data.moduleColors)).toMatchObject({
      transparent: true, opacity: 0.09, depthWrite: false, edges: false,
    });
    expect(appearanceOf(other, state({ filter: 'estimate' }), data.moduleColors)).toMatchObject({
      transparent: other.source !== 'estimate',
    });
    expect(appearanceOf(ladder, state({ filter: 'C14' }), data.moduleColors)).toMatchObject({
      transparent: false, opacity: 1, depthWrite: true, edges: true,
    });
  });
});

describe('appearance applied to the scene', () => {
  const meshes = partMeshes(data);
  const xray = createXray();
  const byId = (id: string) => meshes.find(m => m.userData.part.id === id)!;

  it('[APP-13] paints every mesh from the state, and draws a translucent copy of the selected part over the rest', () => {
    applyAppearance(meshes, xray, state({ filter: 'C14', selected: 'C14_S1' }), data.moduleColors);

    const selected = byId('C14_S1');
    expect(selected.material.color.getHex()).toBe(0xff1f6b);
    expect(selected.material.emissive.getHex()).toBe(0xff1f6b);
    expect(selected.material.emissiveIntensity).toBe(0.75);

    expect(xray.visible).toBe(true);
    expect(xray.geometry).toBe(selected.geometry);
    expect(xray.material.color.getHex()).toBe(0xff1f6b);
    expect(xray.material).toMatchObject({ transparent: true, opacity: 0.4, depthTest: false, side: THREE.DoubleSide });
    expect(xray.renderOrder).toBe(10);

    for (const mesh of meshes) {
      const { part: p, edges } = mesh.userData;
      const inside = p.module === 'C14';
      expect(mesh.material.transparent, p.id).toBe(!inside);
      expect(mesh.material.opacity, p.id).toBe(inside ? 1 : 0.09);
      expect(mesh.material.depthWrite, p.id).toBe(inside);
      expect(edges.visible, p.id).toBe(inside);
      if (p.id === 'C14_S1') continue;
      expect(mesh.material.color.equals(srgb(data.moduleColors[p.module])), p.id).toBe(true);
      expect(mesh.material.emissive.getHex(), p.id).toBe(0);
      expect(mesh.material.emissiveIntensity, p.id).toBe(0);
    }
  });

  it('[APP-13] repaints in wood colours, restores a deselected part and hides the copy', () => {
    applyAppearance(meshes, xray, state({ selected: 'C14_S1' }), data.moduleColors);
    applyAppearance(meshes, xray, state({ natural: true }), data.moduleColors);

    expect(xray.visible).toBe(false);
    for (const mesh of meshes) {
      const { part: p, edges } = mesh.userData;
      expect(mesh.material.color.equals(srgb(p.natural)), p.id).toBe(true);
      expect(mesh.material.emissive.getHex(), p.id).toBe(0);
      expect(mesh.material.emissiveIntensity, p.id).toBe(0);
      expect(mesh.material.transparent, p.id).toBe(false);
      expect(mesh.material.opacity, p.id).toBe(1);
      expect(mesh.material.depthWrite, p.id).toBe(true);
      expect(edges.visible, p.id).toBe(true);
    }
  });
});
