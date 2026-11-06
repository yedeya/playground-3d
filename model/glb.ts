// Writes the generator's model as glTF 2.0 binary (GLB), the file the app is to load ([MODEL-6], [MODEL-7]).
// Hand-written, with no dependency, so the same model always gives the same bytes ([MODEL-8]).

import type { Model, Part } from '../src/domain/model.js';
import { kindOf } from '../src/domain/parts.ts';

/** Where `npm run model` writes the GLB, relative to the repository root. */
export const GLB_PATH = 'public/models/speeltoestel.glb';

const FLOAT = 5126;
const ARRAY_BUFFER = 34962;
const TRIANGLES = 4;

/** sRGB to linear, as glTF's baseColorFactor requires. */
export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** What a part's node carries in its extras: every field the app reads, and the Dutch name `kindOf` gives it. */
export const partExtras = (p: Part) => ({
  id: p.id, module: p.module, kit: p.kit, group: p.group, size: p.size, source: p.source,
  natural: [...p.natural], name: kindOf(p),
});

const pad4 = (n: number): number => (n + 3) & ~3;

/** The model as GLB: one scene, one node per part in the model's order, triangles in metres, unindexed. */
export function toGlb(model: Model): Uint8Array {
  const floats = model.parts.reduce((n, p) => n + p.tri.length, 0);
  const bin = new DataView(new ArrayBuffer(floats * 4));
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const materials: object[] = [];
  const materialOf = new Map<string, number>();
  const meshes: object[] = [];
  const nodes: object[] = [];

  let at = 0;
  model.parts.forEach((p, i) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    p.tri.forEach((mm, k) => {
      const m = Math.fround(mm / 1000);
      bin.setFloat32(at + k * 4, m, true);
      min[k % 3] = Math.min(min[k % 3]!, m);
      max[k % 3] = Math.max(max[k % 3]!, m);
    });
    bufferViews.push({ buffer: 0, byteOffset: at, byteLength: p.tri.length * 4, target: ARRAY_BUFFER });
    accessors.push({ bufferView: i, componentType: FLOAT, count: p.tri.length / 3, type: 'VEC3', min, max });
    at += p.tri.length * 4;

    const key = p.natural.join(',');
    let material = materialOf.get(key);
    if (material === undefined) {
      material = materials.length;
      materialOf.set(key, material);
      materials.push({
        pbrMetallicRoughness: {
          baseColorFactor: [...p.natural.map(srgbToLinear), 1], metallicFactor: 0, roughnessFactor: 1,
        },
      });
    }
    meshes.push({ name: p.id, primitives: [{ attributes: { POSITION: i }, material, mode: TRIANGLES }] });
    nodes.push({ name: p.id, mesh: i, extras: partExtras(p) });
  });

  const gltf = {
    asset: { version: '2.0', generator: 'playground-3d model/glb.ts' },
    scene: 0,
    scenes: [{ name: 'speeltoestel', nodes: nodes.map((_, i) => i), extras: { moduleColors: model.moduleColors } }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };

  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = pad4(json.length);
  const binLength = pad4(bin.byteLength);
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(json, 20);
  out.fill(0x20, 20 + json.length, 20 + jsonLength); // the JSON chunk pads with spaces
  const binAt = 20 + jsonLength;
  view.setUint32(binAt, binLength, true);
  view.setUint32(binAt + 4, 0x004e4942, true); // 'BIN\0'
  out.set(new Uint8Array(bin.buffer), binAt + 8); // the BIN chunk pads with zeros, as the array starts
  return out;
}
