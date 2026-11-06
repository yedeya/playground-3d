// Test helper: the committed GLB the app fetches, the model the app reads from it, and a fetch that serves it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { parseModel } from '../src/data/load-model';

/** The committed GLB's bytes, as the browser's fetch hands them over. */
export function glbBytes(): ArrayBuffer {
  // A path, not a URL: under jsdom, URL is jsdom's own, which node:fs does not take.
  const file = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/models/speeltoestel.glb'));
  // Copied into this realm's ArrayBuffer: under jsdom, Node's Buffer has its own, which GLTFLoader's instanceof refuses.
  const bytes = new Uint8Array(file.byteLength);
  bytes.set(file);
  return bytes.buffer;
}

/** The model the app reads from the committed GLB. */
export const committedModel = () => parseModel(glbBytes());

/** The parts of a GLB's JSON chunk these tests edit. */
export interface GltfJson {
  scenes: { extras?: Record<string, unknown> }[];
  nodes: { name?: string; extras?: Record<string, unknown> }[];
  meshes: unknown[];
}

/** The JSON chunk of a GLB, decoded. */
export function glbJson(bytes: ArrayBuffer): GltfJson {
  const length = new DataView(bytes).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length))) as GltfJson;
}

/** A copy of a GLB whose JSON chunk `edit` has changed, its BIN chunk untouched. */
export function editGlb(bytes: ArrayBuffer, edit: (gltf: GltfJson) => void): ArrayBuffer {
  const gltf = glbJson(bytes);
  edit(gltf);
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = (json.length + 3) & ~3;
  const bin = new Uint8Array(bytes, 20 + new DataView(bytes).getUint32(12, true)); // the BIN chunk, with its header
  const out = new Uint8Array(20 + jsonLength + bin.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.fill(0x20, 20, 20 + jsonLength);
  out.set(json, 20);
  out.set(bin, 20 + jsonLength);
  return out.buffer;
}

/** Stands in a fetch that answers with `answer()`, the committed GLB by default, and returns it to inspect. */
export function stubModelFetch(answer: () => Promise<Response> = async () => new Response(glbBytes())) {
  const fetch = vi.fn((_url: string | URL | Request, _init?: RequestInit) => answer());
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Waits until the app has built its panel from the fetched model. */
export const modelShown = () => vi.waitFor(() => {
  if (!document.querySelector('#modules > button')) throw new Error('the panel is not built yet');
}, { timeout: 10_000 });

/** Waits until the app shows its #fail element. */
export const failShown = () => vi.waitFor(() => {
  if (document.getElementById('fail')!.hidden) throw new Error('#fail is still hidden');
}, { timeout: 10_000 });
