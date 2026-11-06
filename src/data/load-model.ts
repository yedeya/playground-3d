// The model the app shows: the GLB `npm run model` writes (docs/qa/specs/model.md), fetched at runtime and read with
// three's own GLTFLoader into the part records the panel and the viewer use, plus each part's geometry.
import type { BufferGeometry, Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelPart, ModuleCode, Rgb, Source } from '../domain/model';
import { MODULE_ORDER } from '../domain/parts';

/** Where the app fetches the GLB from: `public/models/speeltoestel.glb`, as the site serves it. */
export const MODEL_URL = '/models/speeltoestel.glb';

/** The model as the app uses it. */
export interface LoadedModel {
  /** One record per part, in the GLB's order, from its node's extras. */
  parts: readonly ModelPart[];
  moduleColors: Readonly<Record<ModuleCode, Rgb>>;
  /** Each part's triangles in metres, unindexed as the GLB stores them, in the order of `parts`. */
  geometries: readonly BufferGeometry[];
}

const SOURCES: readonly Source[] = ['manual', 'estimate'];

function fail(what: string): never {
  throw new Error(`The model GLB is not one the app can read: ${what}`);
}

const isModule = (value: unknown): value is ModuleCode => MODULE_ORDER.includes(value as ModuleCode);

function rgb(value: unknown, what: string): Rgb {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(c => typeof c === 'number' && c >= 0 && c <= 1)) {
    fail(`${what} is not three numbers from 0 to 1`);
  }
  return [value[0], value[1], value[2]];
}

function text(extras: Record<string, unknown>, key: string, id: unknown): string {
  const value = extras[key];
  if (typeof value !== 'string') fail(`part ${String(id)} has no ${key}`);
  return value;
}

/** A part's record from its node's extras. */
function partOf(node: Object3D): ModelPart {
  const extras: Record<string, unknown> = node.userData;
  const id = text(extras, 'id', node.name);
  const module = extras.module;
  if (!isModule(module)) fail(`part ${id} has the unknown module ${String(module)}`);
  const source = extras.source;
  if (!SOURCES.includes(source as Source)) fail(`part ${id} has the unknown source ${String(source)}`);
  return {
    id, module,
    kit: text(extras, 'kit', id),
    group: text(extras, 'group', id),
    size: text(extras, 'size', id),
    source: source as Source,
    natural: rgb(extras.natural, `the natural colour of part ${id}`),
    name: text(extras, 'name', id),
  };
}

/** Reads the model from a GLB's bytes; rejects when they are not a GLB the app can read. */
export async function parseModel(glb: ArrayBuffer): Promise<LoadedModel> {
  const { scene } = await new GLTFLoader().parseAsync(glb, '');
  const colours: unknown = scene.userData.moduleColors;
  if (typeof colours !== 'object' || colours === null) fail('the scene has no module colours');
  const moduleColors = Object.fromEntries(MODULE_ORDER.map(code =>
    [code, rgb((colours as Record<string, unknown>)[code], `the colour of module ${code}`)])) as Record<ModuleCode, Rgb>;

  const parts: ModelPart[] = [];
  const geometries: BufferGeometry[] = [];
  for (const node of scene.children) {
    if (!(node as Mesh).isMesh) fail(`node ${node.name} is not one part's mesh`);
    const part = partOf(node);
    if (parts.some(p => p.id === part.id)) fail(`the id ${part.id} is used twice`);
    parts.push(part);
    geometries.push((node as Mesh).geometry);
  }
  if (!parts.length) fail('it holds no parts');
  return { parts, moduleColors, geometries };
}

/** Fetches the GLB and reads the model from it; rejects when it cannot be fetched or read. */
export async function loadModel(signal?: AbortSignal): Promise<LoadedModel> {
  const response = await fetch(MODEL_URL, { signal });
  if (!response.ok) throw new Error(`Fetching ${MODEL_URL} answered ${response.status} ${response.statusText}`);
  return parseModel(await response.arrayBuffer());
}
