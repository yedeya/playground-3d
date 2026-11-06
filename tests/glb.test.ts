import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Color, type Mesh, type MeshStandardMaterial, SRGBColorSpace } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// The JSON model the app loaded before the GLB, byte for byte.
import jsonModel from './fixtures/model-baseline.json';
import { kindOf } from '../src/domain/parts.js';
import { build } from '../model/generator.js';
import { GLB_PATH, toGlb } from '../model/glb.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = 'tests/fixtures/model-baseline.json';
const built = build();

interface Gltf {
  asset: { version: string };
  scene?: number;
  scenes: { nodes: number[]; extras?: Record<string, unknown> }[];
  nodes: { name?: string; mesh?: number; extras?: Record<string, unknown> }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number; material?: number }[] }[];
  materials: { pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[];
  buffers: { byteLength: number }[];
}

/** Decodes a GLB by the glTF 2.0 spec's own layout: a 12-byte header, then a JSON chunk and a BIN chunk. */
function decode(bytes: Uint8Array): { gltf: Gltf; bin: DataView } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('glTF');
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a); // 'JSON'
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
  const binAt = 20 + jsonLength;
  const binLength = view.getUint32(binAt, true);
  expect(view.getUint32(binAt + 4, true)).toBe(0x004e4942); // 'BIN\0'
  expect(binAt + 8 + binLength).toBe(bytes.byteLength);
  return { gltf, bin: new DataView(bytes.buffer, bytes.byteOffset + binAt + 8, binLength) };
}

/** The floats of a VEC3 float accessor, read little-endian from the BIN chunk. */
function readPositions({ gltf, bin }: ReturnType<typeof decode>, accessor: number): number[] {
  const a = gltf.accessors[accessor]!;
  expect(a.componentType).toBe(5126);
  expect(a.type).toBe('VEC3');
  const bv = gltf.bufferViews[a.bufferView]!;
  expect(bv.buffer).toBe(0);
  const at = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  expect(at + a.count * 12).toBeLessThanOrEqual((bv.byteOffset ?? 0) + bv.byteLength);
  return Array.from({ length: a.count * 3 }, (_, i) => bin.getFloat32(at + i * 4, true));
}

/** sRGB to linear, as glTF 2.0 defines baseColorFactor (written here independently of the generator). */
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const committed = () => new Uint8Array(readFileSync(join(ROOT, GLB_PATH)));
const glb = decode(toGlb(built));

const tmp: string[] = [];
afterAll(() => tmp.forEach(d => rmSync(d, { recursive: true, force: true })));

/** Runs `npm run model` with only Node's own directory on PATH, writing under a fresh directory, and lists what it wrote. */
function runModel(...args: string[]): { dir: string; files: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'model-'));
  tmp.push(dir);
  execFileSync(join(dirname(process.execPath), 'npm'), ['run', '--silent', 'model', '--', '--root', dir, ...args], {
    cwd: ROOT,
    // npm runs scripts with sh, named by path so that PATH holds no directory where python3 could be found.
    env: {
      HOME: process.env.HOME ?? dir, PATH: dirname(process.execPath), npm_config_script_shell: '/bin/sh', NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });
  const files = (readdirSync(dir, { recursive: true, withFileTypes: true }))
    .filter(e => e.isFile())
    .map(e => relative(dir, join(e.parentPath, e.name)))
    .sort();
  return { dir, files };
}

describe('npm run model', () => {
  it('[MODEL-1] runs the TypeScript generator on Node alone and a plain run writes only the GLB', () => {
    const script = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> })
      .scripts.model!;
    expect(script).toMatch(/^node model\/\S+\.ts$/);
    expect(script).not.toMatch(/python|tsx|ts-node/i);
    const { dir, files } = runModel();
    expect(files).toEqual([GLB_PATH]);
    expect(readFileSync(join(dir, GLB_PATH)).equals(Buffer.from(toGlb(built)))).toBe(true);
  }, 60_000);

  it('[MODEL-1] with --baseline also rewrites the baseline fixture from the generator\'s own parts', () => {
    const { dir, files } = runModel('--baseline');
    expect(files).toEqual([GLB_PATH, BASELINE].sort());
    const written = readFileSync(join(dir, BASELINE), 'utf8');
    expect(written).toBe(JSON.stringify(built));
    expect(written).toBe(readFileSync(join(ROOT, BASELINE), 'utf8'));
  }, 60_000);
});

describe('the GLB', () => {
  it('[MODEL-6] holds one scene with one node per part, in the generator\'s order, named by its id', () => {
    const { gltf } = glb;
    expect(gltf.asset.version).toBe('2.0');
    expect(gltf.scenes).toHaveLength(1);
    expect(gltf.scene ?? 0).toBe(0);
    const nodes = gltf.scenes[0]!.nodes.map(i => gltf.nodes[i]!);
    expect(nodes).toHaveLength(161);
    expect(nodes.map(n => n.name)).toEqual(built.parts.map(p => p.id));
  });

  it('[MODEL-6] puts each part\'s metadata and the Dutch name kindOf gives it in its node\'s extras', () => {
    const { gltf } = glb;
    const nodes = gltf.scenes[0]!.nodes.map(i => gltf.nodes[i]!);
    built.parts.forEach((p, i) => {
      expect(nodes[i]!.extras).toEqual({
        id: p.id, module: p.module, kit: p.kit, group: p.group, size: p.size, source: p.source,
        natural: [...p.natural], name: kindOf(p),
      });
    });
    expect(nodes.find(n => n.name === 'C14_T1')!.extras!.name).toBe('Laddersport');
  });

  it('[MODEL-6] holds the 11 module colours of the JSON model in the scene\'s extras', () => {
    const moduleColors = glb.gltf.scenes[0]!.extras!.moduleColors as Record<string, number[]>;
    expect(Object.keys(moduleColors)).toHaveLength(11);
    expect(moduleColors).toEqual(jsonModel.moduleColors);
    expect(moduleColors).toEqual(built.moduleColors);
  });

  it('[MODEL-7] gives each part one primitive of unindexed triangles that read back to its millimetres', () => {
    const { gltf } = glb;
    gltf.scenes[0]!.nodes.forEach((n, i) => {
      const part = built.parts[i]!;
      const mesh = gltf.meshes[gltf.nodes[n]!.mesh!]!;
      expect(mesh.primitives).toHaveLength(1);
      const prim = mesh.primitives[0]!;
      expect(prim.mode ?? 4).toBe(4);
      expect(prim.indices).toBeUndefined();
      const metres = readPositions(glb, prim.attributes.POSITION!);
      expect(metres.map(v => Math.round(v * 1000) + 0), part.id).toEqual([...part.tri]);
      expect(Math.max(...metres.map(Math.abs))).toBeLessThan(20); // metres, not millimetres
    });
  });

  it('[MODEL-7] gives each primitive a material whose base colour is the part\'s natural colour in linear', () => {
    const { gltf } = glb;
    gltf.scenes[0]!.nodes.forEach((n, i) => {
      const part = built.parts[i]!;
      const prim = gltf.meshes[gltf.nodes[n]!.mesh!]!.primitives[0]!;
      const factor = gltf.materials[prim.material!]!.pbrMetallicRoughness!.baseColorFactor!;
      expect(factor).toHaveLength(4);
      part.natural.forEach((c, k) => expect(factor[k]!, part.id).toBeCloseTo(linear(c), 12));
      expect(factor[3]).toBe(1);
    });
  });

  it('[MODEL-7] reads in a generic glTF reader (three\'s GLTFLoader) with the parts\' wood colours', async () => {
    const bytes = toGlb(built);
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    expect(gltf.scene.userData.moduleColors).toEqual(built.moduleColors);
    const meshes: Mesh[] = [];
    gltf.scene.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
    expect(meshes).toHaveLength(161);
    built.parts.forEach(part => {
      const mesh = gltf.scene.getObjectByName(part.id) as Mesh;
      expect(mesh.userData.name).toBe(kindOf(part));
      expect(mesh.geometry.index).toBeNull();
      expect(mesh.geometry.getAttribute('position').count * 3).toBe(part.tri.length);
      const srgb = (mesh.material as MeshStandardMaterial).color.getRGB(new Color(), SRGBColorSpace);
      [srgb.r, srgb.g, srgb.b].forEach((c, k) => expect(c, part.id).toBeCloseTo(part.natural[k]!, 4));
    });
  });

  it('[MODEL-8] the committed GLB is byte for byte what the generator writes, and two runs write the same bytes', () => {
    const once = toGlb(build());
    const twice = toGlb(build());
    expect(Buffer.from(twice).equals(Buffer.from(once))).toBe(true);
    expect(Buffer.from(committed()).equals(Buffer.from(once))).toBe(true);
  });
});
