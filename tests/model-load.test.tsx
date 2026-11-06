// @vitest-environment jsdom
// How the app gets its model: the GLB fetched at runtime, its records and geometry, and the page while it loads or
// cannot. jsdom has no WebGL, so the 3D viewer cannot start here; the geometry is checked on the meshes it would draw.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import SpeeltoestelApp from '../src/app/speeltoestel-app';
import { MODEL_URL, parseModel } from '../src/data/load-model';
import { partMeshes } from '../src/viewer/meshes';
import baseline from './fixtures/model-baseline.json';
import { committedModel, editGlb, failShown, glbBytes, glbJson, modelShown, stubModelFetch } from './model-glb';
import { loadPage } from './page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOADING = 'Loading model…';
const LOAD_FAILED = "The model can't load. Reload the page or try another browser.";

// A path, not a URL: under jsdom, URL is jsdom's own, which node:fs does not take.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const chips = () => document.querySelectorAll('#modules > button, #parts > button').length;

let consoleError: MockInstance<typeof console.error>;
let react: Root | null = null;

function mount() {
  react = createRoot(document.createElement('div'));
  act(() => react!.render(<StrictMode><SpeeltoestelApp /></StrictMode>));
}

function unmount() {
  act(() => react!.unmount());
  react = null;
}

beforeEach(() => {
  loadPage();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  if (react) unmount();
  vi.unstubAllGlobals();
  consoleError.mockRestore();
});

describe('where the model comes from', () => {
  it('[MODEL-9] tracks no JSON model under src/ and imports no JSON into the client', () => {
    const tracked = execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(tracked.filter(path => /\.json$/.test(path))).toEqual([]);
    expect(existsSync(join(root, 'src/data/speeltoestel.json'))).toBe(false);
    for (const path of tracked.filter(p => /\.tsx?$/.test(p))) {
      const source = readFileSync(join(root, path), 'utf8');
      expect(source, path).not.toMatch(/(from|import\s*\(?)\s*['"][^'"]+\.json['"]/);
    }
  });

  it('[MODEL-9] fetches the GLB at runtime, and builds the panel from it', async () => {
    const fetch = stubModelFetch();
    mount();
    await modelShown();
    expect(fetch).toHaveBeenCalled();
    for (const [url] of fetch.mock.calls) expect(url).toBe('/models/speeltoestel.glb');
    expect(MODEL_URL).toBe('/models/speeltoestel.glb');
    expect($('#stats').textContent).toBe('161 onderdelen · 11 modules · 22 geschat');
  });

  it('[MODEL-9] takes every part record and the module colours from the GLB\'s extras', async () => {
    const bytes = glbBytes();
    const gltf = glbJson(bytes);
    const model = await parseModel(bytes);
    expect(model.parts.map(p => ({ ...p, natural: [...p.natural] }))).toEqual(gltf.nodes.map(n => n.extras));
    expect(model.parts.map(p => Object.keys(p).sort())[0])
      .toEqual(['group', 'id', 'kit', 'module', 'name', 'natural', 'size', 'source']);
    expect(model.moduleColors).toEqual(gltf.scenes[0]!.extras!.moduleColors);
  });

  it('[MODEL-9] shows the part\'s name from the GLB as the card\'s kind', async () => {
    // A GLB whose name for C14_S1 differs from the one kindOf gives (`Balk`): the card must show the GLB's.
    const renamed = editGlb(glbBytes(), gltf => {
      const node = gltf.nodes.find(n => n.name === 'C14_S1')!;
      node.extras = { ...node.extras, name: 'Naam uit de GLB' };
    });
    stubModelFetch(async () => new Response(renamed));
    mount();
    await modelShown();
    [...document.querySelectorAll<HTMLButtonElement>('#modules > button')].find(b => b.dataset.key === 'C14')!.click();
    [...document.querySelectorAll<HTMLButtonElement>('#parts > button')].find(b => b.dataset.key === 'C14_S1')!.click();
    expect($('#card .kind').textContent).toBe('Naam uit de GLB');
  });
});

describe('the geometry the viewer draws', () => {
  /** The part's positions as the viewer built them from the JSON model: whole millimetres to float32 metres. */
  const fromJson = (tri: readonly number[]) => new Float32Array(tri.map(v => v / 1000));

  it('[MODEL-10] draws each part with the GLB\'s own triangles, unindexed, exactly the positions the JSON gave', async () => {
    const model = await committedModel();
    expect(model.parts.map(p => p.id)).toEqual(baseline.parts.map(p => p.id));
    for (const [i, mesh] of partMeshes(model).entries()) {
      const { id } = model.parts[i]!;
      expect(mesh.userData.part).toBe(model.parts[i]);
      expect(mesh.geometry).toBe(model.geometries[i]);
      expect(mesh.geometry.index, id).toBeNull();
      const position = mesh.geometry.getAttribute('position');
      expect(position.itemSize).toBe(3);
      expect(position.array, id).toEqual(fromJson(baseline.parts[i]!.tri));
    }
  });

  it('[MODEL-10] derives one normal per triangle, and draws edges at a 25° threshold', async () => {
    const model = await committedModel();
    for (const mesh of partMeshes(model)) {
      const position = mesh.geometry.getAttribute('position');
      const normal = mesh.geometry.getAttribute('normal');
      expect(normal.count).toBe(position.count);
      const [a, b, c, n] = [0, 1, 2, 3].map(() => new THREE.Vector3());
      for (let t = 0; t < position.count; t += 3) {
        a.fromBufferAttribute(position, t);
        b.fromBufferAttribute(position, t + 1);
        c.fromBufferAttribute(position, t + 2);
        const face = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
        for (let k = 0; k < 3; k++) {
          n.fromBufferAttribute(normal, t + k);
          expect(n.distanceTo(face), mesh.userData.part.id).toBeLessThan(1e-5);
        }
      }
      expect(mesh.userData.edges.geometry.parameters.thresholdAngle).toBe(25);
    }
  });

  it('[MODEL-10] gives the model the bounds the JSON gave, so the grid and the home view stay where they were', async () => {
    const model = await committedModel();
    const fromGlb = new THREE.Box3();
    for (const mesh of partMeshes(model)) fromGlb.union(mesh.geometry.boundingBox!);
    const json = new THREE.Box3();
    for (const part of baseline.parts) {
      json.union(new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(fromJson(part.tri), 3)));
    }
    expect(fromGlb.min.toArray()).toEqual(json.min.toArray());
    expect(fromGlb.max.toArray()).toEqual(json.max.toArray());
  });
});

describe('the page while the model loads, and when it cannot', () => {
  it('[MODEL-11] reads Loading model… and shows no chips until the GLB has loaded', async () => {
    let answer!: (response: Response) => void;
    stubModelFetch(() => new Promise<Response>(resolve => { answer = resolve; }));
    mount();
    expect($('#stats').textContent).toBe(LOADING);
    expect(chips()).toBe(0);
    expect($('#card').innerHTML).toBe('');
    expect($('#fail').hidden).toBe(true);

    answer(new Response(glbBytes()));
    await modelShown();
    expect($('#stats').textContent).toBe('161 onderdelen · 11 modules · 22 geschat');
  });

  const failures: [string, () => Promise<Response>][] = [
    ['the fetch fails', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['the server answers 404', async () => new Response('Not found', { status: 404 })],
    ['the file is no GLB', async () => new Response('<!DOCTYPE html><title>Oops</title>')],
    ['the GLB holds a part the app cannot read', async () => new Response(editGlb(glbBytes(), gltf => {
      gltf.nodes[0]!.extras = { ...gltf.nodes[0]!.extras, module: 'Z99' };
    }))],
  ];
  for (const [when, answer] of failures) {
    it(`[MODEL-11] shows the load-failure text in #fail and leaves the panel empty when ${when}`, async () => {
      stubModelFetch(answer);
      mount();
      await failShown();
      expect($('#fail').textContent).toBe(LOAD_FAILED);
      expect(chips()).toBe(0);
      expect($('#card').innerHTML).toBe('');
      expect($('#stats').textContent).not.toBe(LOADING);
      expect(consoleError).toHaveBeenCalled();
    });
  }

  it('gives the page back as the route rendered it on unmount, after a failed load', async () => {
    stubModelFetch(async () => new Response('Not found', { status: 404 }));
    mount();
    await failShown();
    unmount();
    const fresh = document.body.innerHTML;
    loadPage();
    expect(fresh).toBe(document.body.innerHTML);
  });

  it('builds nothing from a model that arrives after the app was unmounted', async () => {
    let answer!: (response: Response) => void;
    const fetch = stubModelFetch(() => new Promise<Response>(resolve => { answer = resolve; }));
    react = createRoot(document.createElement('div'));
    act(() => react!.render(<SpeeltoestelApp />));
    unmount();
    expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    answer(new Response(glbBytes()));
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(chips()).toBe(0);
    expect($('#stats').textContent).toBe('');
    expect($('#fail').hidden).toBe(true);
  });
});
