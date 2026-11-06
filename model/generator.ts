// Clean parametric model of the complete Wickey ArcticFlyer, built from the assembly manual.
// A TypeScript port of model/build_playground.py, kept arithmetic for arithmetic so its parts match that generator's
// output (tests/fixtures/model-baseline.json) to within 1 mm, as [MODEL-2] in docs/qa/specs/model.md requires.
//
// All sizes are mm and come from the manual unless source == 'estimate'.
// World axes: x runs along the house frames (slide at x<0, ladder at x>2190; the manual has them the other way round,
// see SWAP_LADDER_SLIDE), y is up, z runs from the swing (z<0) through house and bridge to the ship (z>2242).

import type { ModuleCode, Part, Rgb, Source } from '../src/domain/model.js';

/** The user's choice: ladder and slide change ends compared with the manual. */
export const SWAP_LADDER_SLIDE = true;

const M: Source = 'manual';
const E: Source = 'estimate';

type Vec = number[];
type Uv = readonly [number, number];
type Face = Vec[];

export const COLORS: Readonly<Record<string, Rgb>> = {
  post: [0.72, 0.56, 0.36], wall: [0.85, 0.70, 0.48], back: [0.78, 0.63, 0.42],
  beam: [0.55, 0.40, 0.25], floor: [0.90, 0.78, 0.58], side: [0.80, 0.60, 0.40],
  bow: [0.30, 0.55, 0.65], mast: [0.42, 0.32, 0.55], sail: [0.10, 0.25, 0.70],
  hold: [0.20, 0.70, 0.35], handle: [0.85, 0.12, 0.12], canvas: [0.10, 0.25, 0.70],
  hole: [0.05, 0.05, 0.08], belt: [0.12, 0.12, 0.12], slide: [0.10, 0.35, 0.75],
  rope: [0.85, 0.82, 0.70], metal: [0.55, 0.55, 0.58], seat: [0.10, 0.10, 0.12],
};

export const MODULE_COLORS: Readonly<Record<ModuleCode, Rgb>> = {
  A45: [0.86, 0.70, 0.45], A47: [0.55, 0.72, 0.42], B07: [0.93, 0.55, 0.15], C14: [0.95, 0.85, 0.20],
  D42: [0.80, 0.20, 0.20], E24: [0.75, 0.30, 0.70], F34: [0.15, 0.40, 0.85], G01: [0.20, 0.75, 0.85],
  G24: [0.10, 0.50, 0.20], G28: [0.15, 0.55, 0.55], H10: [0.98, 0.65, 0.65],
};

/** The manual's overall parts list (page 4): how many of each stock code the kit holds. */
export const STOCK: Readonly<Record<string, number>> = {
  'P-220': 1, 'BG-220': 9, 'BG-195': 8, 'BG-151': 1, 'BG-36': 8, 'BG-13': 1, 'BK-140': 2, 'BK-89': 2, 'BK-80': 3,
  'BK-78': 2, 'BK-76': 2, 'BK-70': 4, 'BK-51': 4, 'BK-34': 2, 'BK-16': 2, 'B-153': 4, 'B-145': 1, 'B-105': 2,
  'B-89': 2, 'B-80': 22, 'B-71': 37, 'B-62': 10, 'B-30': 2, 'B-19': 1, handle: 4,
};

const sub = (a: Vec, b: Vec): Vec => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: Vec, b: Vec): Vec => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const mul = (a: Vec, s: number): Vec => a.map(v => v * s);
const dot = (a: Vec, b: Vec): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: Vec, b: Vec): Vec => [
  a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!,
];
const norm = (a: Vec): Vec => {
  const n = Math.sqrt(dot(a, a));
  return a.map(v => v / n);
};
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(...a.map((v, i) => v - b[i]!));

/** Python's round(): to the nearest whole number, halves to the even one. */
function roundHalfEven(x: number): number {
  const r = Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x);
  return r + 0; // no negative zero
}

/** Python's round(x, 3) for the colour values, which have at most three decimals. */
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Ear-clip a planar polygon (it may be concave) into index triples. */
export function triangulate(face: readonly Vec[]): number[][] {
  let n: Vec = [0, 0, 0];
  face.forEach((a, i) => {
    const b = face[(i + 1) % face.length]!;
    n = add(n, cross(a, b));
  });
  n = norm(n);
  const inside = (p: Vec, a: Vec, b: Vec, c: Vec) =>
    ([[a, b], [b, c], [c, a]] as const).every(([o, q]) => dot(cross(sub(q, o), sub(p, o)), n) >= -1e-6);
  const idx = face.map((_, i) => i);
  const tris: number[][] = [];
  while (idx.length > 3) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[(k - 1 + idx.length) % idx.length]!, j = idx[k]!, l = idx[(k + 1) % idx.length]!;
      const a = face[i]!, b = face[j]!, c = face[l]!;
      if (dot(cross(sub(b, a), sub(c, a)), n) <= 1e-6) continue;
      if (idx.some(m => m !== i && m !== j && m !== l && inside(face[m]!, a, b, c))) continue;
      tris.push([i, j, l]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error('polygon could not be triangulated');
  }
  tris.push([...idx]);
  return tris;
}

/** A part while the generator builds it: polygon faces, its id within the module, and no module yet. */
interface RawPart {
  id: string;
  kit: string;
  group: string;
  size: string;
  source: Source;
  faces: Face[];
  color?: Rgb;
  module?: ModuleCode;
}

/** Throws, naming each id, when two parts share one (`[MODEL-4]`). */
export function checkIds(parts: readonly Pick<Part, 'id'>[]): void {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const { id } of parts) (seen.has(id) ? twice : seen).add(id);
  if (twice.size) throw new Error(`duplicate part ids: ${[...twice].join(', ')}`);
}

/**
 * Compares the parts against the manual's parts list (`[MODEL-3]`): counts them by stock code, the last word of
 * each part's kit, and throws, naming each code of STOCK whose count differs with the model's and the manual's count.
 * Last words that are not in STOCK are not checked.
 */
export function checkStock(parts: readonly Pick<Part, 'kit'>[]): void {
  const count = new Map<string, number>();
  for (const { kit } of parts) {
    const code = kit.split(' ').at(-1)!;
    count.set(code, (count.get(code) ?? 0) + 1);
  }
  const bad = Object.entries(STOCK)
    .filter(([code, want]) => (count.get(code) ?? 0) !== want)
    .map(([code, want]) => `${code}: model ${count.get(code) ?? 0}, manual ${want}`);
  if (bad.length) throw new Error(`stock counts differ from the manual: ${bad.join('; ')}`);
}

export interface BuildOptions {
  /** Whether the ladder and the slide change ends compared with the manual; defaults to SWAP_LADDER_SLIDE. */
  swapLadderSlide?: boolean;
}

export interface BuiltModel {
  parts: Part[];
  moduleColors: Record<ModuleCode, Rgb>;
}

/** Builds every part of the model, checks the ids and the stock counts, and returns parts in whole-mm triangles. */
export function build({ swapLadderSlide = SWAP_LADDER_SLIDE }: BuildOptions = {}): BuiltModel {
  const parts: RawPart[] = [];

  /** Extrude polygon poly (u,v coordinates, mm) by thick along u x v, centred on the uv plane. */
  function prism(pid: string, kit: string, group: string, size: string, source: Source,
    origin: Vec, u: Vec, v: Vec, poly: readonly Uv[], thick: number): void {
    const n = norm(cross(u, v));
    const ring = poly.map(([a, b]) => add(add(origin, mul(u, a)), mul(v, b)));
    const lo = ring.map(p => add(p, mul(n, -thick / 2)));
    const hi = ring.map(p => add(p, mul(n, thick / 2)));
    const faces: Face[] = [[...lo].reverse(), hi];
    const m = ring.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      faces.push([lo[i]!, lo[j]!, hi[j]!, hi[i]!]);
    }
    parts.push({ id: pid, kit, group, size, source, faces });
  }

  /** Axis-aligned box. */
  function box(pid: string, kit: string, group: string, size: string, source: Source,
    x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const a = x1 - x0, b = y1 - y0, t = z1 - z0;
    const poly: Uv[] = [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]];
    prism(pid, kit, group, size, source, c, [1, 0, 0], [0, 1, 0], poly, t);
  }

  /** Beam along p0->p1 with its height along world y. */
  function beam(pid: string, kit: string, group: string, size: string, source: Source,
    p0: Vec, p1: Vec, height: number, thick: number): number {
    const axis = norm(sub(p1, p0));
    const length = dist(p0, p1);
    const up = norm(sub([0, 1, 0], mul(axis, axis[1]!)));
    const poly: Uv[] = [[0, -height / 2], [length, -height / 2], [length, height / 2], [0, height / 2]];
    prism(pid, kit, group, size, source, p0, axis, up, poly, thick);
    return length;
  }

  /** Merge all parts added since index start into one logical part (ropes, slide, belts). */
  function merge(start: number, pid: string, kit: string, group: string, size: string, source: Source): void {
    const faces = parts.slice(start).flatMap(p => p.faces);
    parts.splice(start);
    parts.push({ id: pid, kit, group, size, source, faces });
  }

  function disc(pid: string, kit: string, group: string, size: string, source: Source,
    centre: Vec, u: Vec, v: Vec, radius: number, thick: number): void {
    const poly: Uv[] = Array.from({ length: 32 }, (_, i) =>
      [radius * Math.cos(2 * Math.PI * i / 32), radius * Math.sin(2 * Math.PI * i / 32)]);
    prism(pid, kit, group, size, source, centre, u, v, poly, thick);
  }

  // -------------------------------------------------------------- A45 house
  // Frames: posts have their 88 mm face in the frame plane; beams sit on the inside of the posts; planks on the outside.
  const LEN = 2190, DEP = 800;
  const PW = 88, PTH_Z = 44;
  const BEAM_LOW = [1092, 1180] as const; // step 1: 118 cm to the top of the lower beam
  const BEAM_UP = [1714, 1802] as const; // step 1: 71 cm from the top of the upper beam to the bottom of the lower beam
  const POSTS = [['B', 'A45-B BG-195', 0, 1950], ['A', 'A45-A BG-220', 692, 2190],
    ['A', 'A45-A BG-220', 1410, 2190], ['B', 'A45-B BG-195', LEN - PW, 1950]] as const;

  /** z interval [a,b] measured inward from the outside post face of a frame. */
  const frameZ = (front: boolean, a: number, b: number): [number, number] => front ? [DEP - b, DEP - a] : [a, b];

  for (const front of [false, true]) {
    const tag = front ? 'V' : 'A'; // V = bridge side frame, A = swing side frame
    POSTS.forEach(([, kit, x0, h], i) => {
      const [z0, z1] = frameZ(front, 0, PTH_Z);
      box(`${tag}P${i + 1}`, kit, 'post', `${h}x88x44`, M, x0, x0 + PW, 0, h, z0, z1);
    });
    let [z0, z1] = frameZ(front, PTH_Z, 2 * PTH_Z);
    box(`${tag}L`, 'A45-A BG-220', 'beam', '2190x88x44', M, 0, LEN, ...BEAM_LOW, z0, z1);
    if (front) {
      [0, LEN - 785].forEach((x, j) => {
        box(`${tag}B${j + 1}`, 'A45-D BK-78', 'beam', '785x68x44', M, x, x + 785, BEAM_UP[1] - 68, BEAM_UP[1], z0, z1);
      });
    } else {
      box(`${tag}U`, 'A45-A BG-220', 'beam', '2190x88x44', M, 0, LEN, ...BEAM_UP, z0, z1);
    }
    // Upright boards F: between the posts, lying against the outside of the beams.
    [z0, z1] = frameZ(front, PTH_Z - 18, PTH_Z);
    const bays = [[PW, 692, 3], [1498, LEN - PW, 3]] as const;
    let n = 0;
    for (const [lo, hi, cnt] of bays) {
      const gap = (hi - lo - cnt * 140) / (cnt + 1);
      for (let k = 0; k < cnt; k++) {
        const x = lo + gap + k * (140 + gap);
        n += 1;
        box(`${tag}R${n}`, 'A45-F B-71', 'side', '710x140x18', M, x, x + 140, BEAM_LOW[0], BEAM_LOW[0] + 710, z0, z1);
      }
    }
    if (!front) {
      for (const x of [780 + 50, 1410 - 50 - 140]) { // step 2: 25 cm opening in the middle
        n += 1;
        box(`${tag}R${n}`, 'A45-F B-71', 'side', '710x140x18', M, x, x + 140, BEAM_LOW[0], BEAM_LOW[0] + 710, z0, z1);
      }
    }
    // Bottom boards E: outside on the outer bays, inside on the middle bay (steps 2, 4, 5).
    [z0, z1] = frameZ(front, -18, 0);
    box(`${tag}E1`, 'A45-E B-80', 'side', '800x140x18', M, 0, 800, 0, 140, z0, z1);
    box(`${tag}E2`, 'A45-E B-80', 'side', '800x140x18', M, LEN - 800, LEN, 0, 140, z0, z1);
    [z0, z1] = frameZ(front, PTH_Z, PTH_Z + 18);
    box(`${tag}E3`, 'A45-E B-80', 'side', '800x140x18', M, 695, 1495, 0, 140, z0, z1);
    // Braces C, one under the deck at each post (step 7).
    [44, 736, 1454, LEN - 44].forEach((xc, i) => {
      const yLow = 1180 - 255, s = !front ? 1 : -1;
      const origin = [xc, yLow, !front ? PTH_Z : DEP - PTH_Z];
      const poly: Uv[] = [[0, 0], [s * 255, 255], [s * 131, 255], [0, 124]];
      prism(`${tag}C${i + 1}`, 'A45-C BG-36', 'beam', '360x88x44', M, origin, [0, 0, 1], [0, 1, 0], poly, 44);
    });
  }

  // End boards E at deck and ground level (step 5). Deck board stands 18 mm above the beam.
  ([[-18, 0], [LEN, LEN + 18]] as const).forEach(([x0, x1], i) => {
    box(`E${i + 1}`, 'A45-E B-80', 'side', '800x140x18', M, x0, x1, 0, 140, 0, DEP);
    box(`E${i + 3}`, 'A45-E B-80', 'side', '800x140x18', M, x0, x1, 1058, 1198, 0, DEP);
  });
  // Floor F: 14 boards over the full length, equal gaps; the count is manual, the gap is derived.
  {
    const gap = (LEN - 14 * 140) / 13;
    for (let i = 0; i < 14; i++) {
      const x = i * (140 + gap);
      box(`F${i + 1}`, 'A45-F B-71', 'floor', '710x140x18', M, x, x + 140, 1180, 1198, 45, 755);
    }
  }
  // Canvas panels K and L on the outer bays of the bridge-side frame (step 8). Vertical position is an estimate.
  for (const [pid, kit, xc] of [['L', 'A45-L canvas', 390], ['K', 'A45-K canvas', LEN - 390]] as const) {
    box(pid, kit, 'canvas', '700x590 in parts list, drawn about 700 high', E, xc - 350, xc + 350, 140, 840, DEP, DEP + 3);
  }
  // Openings as in the overview drawing: upper right, lower left.
  ([[0.2, 0.2], [-0.2, -0.22]] as const).forEach(([fx, fy], i) => {
    disc(`LG${i + 1}`, 'A45-L opening', 'hole', 'dia 280', E, [390 + fx * 700, 490 + fy * 700, DEP + 4],
      [1, 0, 0], [0, 1, 0], 140, 2);
  });

  // -------------------------------------------------------------- F34 roof
  // Two trusses outside the inner posts; ridge along z. 890 mm planes are flush with the truss faces.
  const c45 = Math.sqrt(0.5);
  const XC = 1095, YT = 2537;
  [-22, DEP + 22].forEach((zc, t) => {
    for (const [s, name] of [[1, 'R'], [-1, 'L']] as const) {
      const d = [s * c45, -c45] as const, inner = [-s * c45, -c45] as const;
      const A: Uv = [XC, YT];
      const B: Uv = [XC + d[0] * 700, YT + d[1] * 700];
      const C: Uv = [B[0] + inner[0] * 68, B[1] + inner[1] * 68];
      const D: Uv = [XC, YT - 96];
      prism(`T${t + 1}${name}`, 'F34-A BK-70', 'beam', '700x68x44', M, [0, 0, zc], [1, 0, 0], [0, 1, 0], [A, B, C, D], 44);
    }
    prism(`T${t + 1}B`, 'F34-B BK-16', 'beam', '160x68x44', M, [0, 0, zc], [1, 0, 0], [0, 1, 0],
      [[XC - 80, YT - 176], [XC + 80, YT - 176], [XC, YT - 96]], 44);
  });
  [1, -1].forEach((s, i) => {
    const d = [s * c45, -c45, 0], out = [s * c45, c45, 0];
    const v = [0, 0, 1];
    const p = [XC, YT, DEP / 2];
    prism(`H${i + 1}`, 'F34-H plane', 'canvas', '590x890', M, add(p, mul(out, 1.5)), d, v,
      [[60, -445], [650, -445], [650, 445], [60, 445]], 3);
    prism(`C${i + 1}`, 'F34-C B-89', 'floor', '890x140x18', M, add(p, mul(out, 12)), d, v,
      [[0, -445], [140, -445], [140, 445], [0, 445]], 18);
  });

  // -------------------------------------------------------------- C14 ladder
  const ladderStart = parts.length;
  {
    const top = [-70, 1165] as const, footY = 34;
    const run = Math.sqrt(1400 ** 2 - (top[1] - footY) ** 2);
    const foot = [top[0] - run, footY] as const;
    const LZ = [145, 655] as const;
    [LZ[0] + 22, LZ[1] - 22].forEach((z, i) => {
      beam(`S${i + 1}`, 'C14-A BK-140', 'beam', '1400x68x44', M, [foot[0], foot[1], z], [top[0], top[1], z], 68, 44);
    });
    const ax = norm([top[0] - foot[0], top[1] - foot[1], 0]);
    let upn = [-ax[1]!, ax[0]!, 0];
    if (upn[1]! < 0) upn = mul(upn, -1);
    for (let i = 0; i < 4; i++) {
      const a = 240 + 250 * i + 34;
      const p = [foot[0] + ax[0]! * a + upn[0]! * 56, foot[1] + ax[1]! * a + upn[1]! * 56, 400];
      prism(`T${i + 1}`, 'C14-B BK-51', 'floor', '510x68x44', M, p, ax, [0, 0, 1],
        [[-34, -255], [34, -255], [34, 255], [-34, 255]], 44);
    }
    // Two handles beside the ladder entry. Not shown in a module step, so the position is an estimate.
    [22, DEP - 22].forEach((z, i) => {
      box(`G${i + 1}`, 'handle', 'handle', 'handle', E, -45, 0, 1350, 1650, z - 15, z + 15);
    });
  }
  const ladderEnd = parts.length;

  // -------------------------------------------------------------- E24 swing beam and D42 A-frame
  const XB = 648; // beam on the x<692 face of the inner post, swing-side frame (the ladder side in the manual)
  const BY0 = 1898, BY1 = 1986; // beam height from the E24 elevation; agrees with the D42 leg and brace geometry
  const ZN = 66, ZF = 66 - 2200; // bolt hole is 44 mm from the end, through the 44 mm post
  box('P', 'E24-A P-220', 'beam', '2200x88x88', M, XB - 44, XB + 44, BY0, BY1, ZF, ZN);
  const HOOKS = [ZF + 440, ZF + 440 + 540, ZF + 440 + 540 + 630] as const;
  HOOKS.forEach((z, i) => {
    box(`F${i + 1}`, 'E24-F swing hook', 'metal', 'swing hook', M, XB - 18, XB + 18, BY0 - 45, BY0, z - 25, z + 25);
  });
  // Swing seat on the two hooks furthest from the house.
  {
    const start = parts.length;
    const zs = (HOOKS[0] + HOOKS[1]) / 2;
    box('seat', 'seat', 'seat', 'seat', E, XB - 80, XB + 80, 400, 425, zs - 225, zs + 225);
    ([[HOOKS[0], zs - 215], [HOOKS[1], zs + 215]] as const).forEach(([zh, ze], i) => {
      beam(`r${i}`, 'rope', 'rope', 'rope', E, [XB, BY0 - 45, zh], [XB, 425, ze], 12, 12);
    });
    merge(start, 'seat', 'E24 swing seat', 'seat', 'seat', E);
  }
  // Rope ladder on the hook nearest the house.
  {
    const start = parts.length;
    const zh = HOOKS[2];
    [-130, 130].forEach((dx, i) => {
      beam(`a${i}`, 'r', 'r', 'r', E, [XB, BY0 - 45, zh], [XB + dx, 1400, zh], 12, 12);
      box(`b${i}`, 'r', 'r', 'r', E, XB + dx - 6, XB + dx + 6, 300, 1400, zh - 6, zh + 6);
    });
    for (let i = 0; i < 5; i++) {
      const y = 340 + i * 250;
      box(`c${i}`, 'r', 'r', 'r', E, XB - 130, XB + 130, y, y + 25, zh - 12, zh + 12);
    }
    merge(start, 'rope_ladder', 'E24 rope ladder', 'rope', 'rope ladder', E);
  }

  const BOLT_Y = BY0 - 34; // ledger top carries the beam
  const LEG_BELOW = 2190 - 61; // D42 step 1: bolt is 61 mm below the leg top
  const theta = Math.acos(BOLT_Y / LEG_BELOW);
  const ZL0 = ZF + 44, ZL1 = ZF + 44 + 88; // legs between the ledgers; beam end is flush with the far ledger (step 2)
  const ZLC = (ZL0 + ZL1) / 2;
  [-1, 1].forEach((s, i) => {
    const bx = XB + s * 107; // 17 cm clear between 44 mm legs at the bolts
    const footX = bx + s * LEG_BELOW * Math.sin(theta);
    const tip = [bx - s * 61 * Math.sin(theta), BOLT_Y + 61 * Math.cos(theta), ZLC];
    beam(`L${i + 1}`, 'D42-A BG-220', 'post', '2190x88x44', M, [footX, 0, ZLC], tip, 44, 88);
  });
  ([[ZF, ZF + 44], [ZL1, ZL1 + 44]] as const).forEach(([z0, z1], i) => {
    box(`C${i + 1}`, 'D42-C BK-34', 'beam', '340x68x44', M, XB - 170, XB + 170, BY0 - 68, BY0, z0, z1);
  });
  box('B', 'D42-B BG-13', 'beam', '130x88x44', M, XB - 65, XB + 65, BY0 - 44, BY0, ZL0, ZL1);
  // Brace D: top edge 94 cm below the ledger, 1450 mm at its long edge.
  {
    const ytop = BOLT_Y - 34 - 940;
    const taper = 140 * Math.tan(theta);
    prism('D', 'D42-D B-145', 'side', '1450x140x18', M, [XB, ytop - 140, ZL0 - 9], [1, 0, 0], [0, 1, 0],
      [[-725, 0], [725, 0], [725 - taper, 140], [-725 + taper, 140]], 18);
  }

  // -------------------------------------------------------------- A47 ship tower, G28 bow, G24 holds
  const XS = 695, ZS = 2242; // ship origin: tower centred on the bridge; bridge rails end flush with its first post pair
  const shipStart = parts.length;
  const W = 800, D = 800; // outer tower footprint: plank B-80 sits flush on the posts
  const PT = 44, PD = 88; // post thickness (x) and depth (z): BG-195 is 88 x 44
  const PL = 1950;
  const PLANK = 140, PTH = 18; // B-series plank
  const DECK = 1160; // top of floor beams, A47 step 3

  // Posts A47-A: A47 step 1 shows the 44 mm face toward the planks.
  for (const [pid, x0, z0] of [['P1', 0, 0], ['P2', W - PT, 0], ['P3', 0, D - PD], ['P4', W - PT, D - PD]] as const) {
    box(pid, 'A47-A BG-195', 'post', '1950x88x44', M, x0, x0 + PT, 0, PL, z0, z0 + PD);
  }

  // Climbing wall A47 step 2: 6 planks, top at 116 cm, equal gaps.
  {
    const gap = (DECK - 6 * PLANK) / 5;
    for (let i = 0; i < 6; i++) {
      const y = i * (PLANK + gap);
      box(`W${i + 1}`, 'A47-E B-80', 'wall', '800x140x18', M, 0, W, y, y + PLANK, D, D + PTH);
    }
  }

  // Back frame A47 step 1: 1 bottom plank, 4 upper planks; top of top plank 15 cm below post top.
  box('R1', 'A47-E B-80', 'back', '800x140x18', M, 0, W, 0, PLANK, -PTH, 0);
  {
    const top = PL - 150, low = DECK - PLANK;
    const gap = (top - low - 4 * PLANK) / 3;
    for (let i = 0; i < 4; i++) {
      const y = low + i * (PLANK + gap);
      box(`R${i + 2}`, 'A47-E B-80', 'back', '800x140x18', M, 0, W, y, y + PLANK, -PTH, 0);
    }
  }

  // Bottom side plank A47 step 3, on the bridge side, because the bow side stays open.
  box('S1', 'A47-E B-80', 'side', '800x140x18', E, W, W + PTH, 0, PLANK, 0, D);

  // Cross beams A47-C BK-80: inside the posts, 71 cm apart on the bow side, one on the bridge side.
  const BH = 68;
  box('C1', 'A47-C BK-80', 'beam', '800x68x44', M, PT, 2 * PT, DECK - BH, DECK, 0, D);
  box('C2', 'A47-C BK-80', 'beam', '800x68x44', M, PT, 2 * PT, DECK + 710 - BH, DECK + 710, 0, D);
  box('C3', 'A47-C BK-80', 'beam', '800x68x44', M, W - 2 * PT, W - PT, DECK - BH, DECK, 0, D);

  // Floor A47 step 4: 6 planks B-71 over the full depth including the wall planks.
  {
    const span = D + 2 * PTH;
    const x0 = (W - 710) / 2;
    for (let i = 0; i < 6; i++) {
      const z = -PTH + i * span / 6;
      box(`F${i + 1}`, 'A47-F B-71', 'floor', '710x140x18', M, x0, x0 + 710, DECK, DECK + PTH, z, z + PLANK - 1);
    }
  }

  // Bow side boards A47 step 5: 3 vertical B-71 between the posts, equal gaps.
  {
    const inner = D - 2 * PD;
    const gap = (inner - 3 * PLANK) / 4;
    for (let i = 0; i < 3; i++) {
      const z = PD + gap + i * (PLANK + gap);
      box(`V${i + 1}`, 'A47-F B-71', 'side', '710x140x18', M, PT - PTH, PT, DECK, DECK + 710, z, z + PLANK);
    }
  }

  // Mast A47 step 8: pole stands on the floor against the inside of C2. Top should land on the 269 cm product height.
  const DECK_TOP = DECK + PTH;
  const MAST = 1512;
  const mx0 = 2 * PT, mx1 = 3 * PT;
  box('M1', 'A47-B BG-151', 'mast', '1512x88x44', M, mx0, mx1, DECK_TOP, DECK_TOP + MAST, D / 2 - PD / 2, D / 2 + PD / 2);
  // Yard A47 step 6: B-105 crosses the mast, its lower edge 112 cm above the mast foot.
  const yardY = DECK_TOP + 1120;
  box('M2', 'A47-D B-105', 'mast', '1050x140x18', M, mx0 - PTH, mx0, yardY, yardY + PLANK, D / 2 - 525, D / 2 + 525);
  // Sail A47 step 7 and canvas plan: 105 x 55 cm with a curved lower edge, simplified to straight segments.
  prism('M3', 'A47-M canvas', 'sail', '1050x550', M, [mx0 - PTH - 1.5, yardY + PLANK, D / 2], [0, 0, 1], [0, 1, 0],
    [[-525, 0], [525, 0], [525, -550], [300, -440], [0, -420], [-300, -440], [-525, -550]], 3);
  // Flag canvas plan: 20 x 35 cm triangle on the mast top, drawn in the z-y plane.
  const fy = DECK_TOP + MAST - 15;
  prism('M4', 'A47-N canvas', 'sail', '350x200', M, [mx1 + 2, fy, D / 2 + PD / 2],
    [0, 0, 1], [0, 1, 0], [[0, -200], [350, -100], [0, 0]], 3);

  // Bow G28 steps 2-3. Beams start at the front and back posts and meet on the centre line.
  const HT = 44;
  const BOW_Z = [HT / 2, D - HT / 2] as const;
  const TZ = D / 2;
  const LOW = 770, UP = 890;
  const RISE = 740; // G28 step 3: 74 cm from the bottom of the lower beam to the top of the upper beam
  const dz = Math.abs(BOW_Z[0] - TZ);
  const lowTip = -Math.sqrt(LOW ** 2 - dz ** 2);
  const upTip = -Math.sqrt(UP ** 2 - dz ** 2);
  BOW_Z.forEach((z, i) => {
    beam(`B${i + 1}`, 'G28-B BK-76', 'bow', '770x68x44', M, [0, BH / 2, z], [lowTip, BH / 2, TZ], BH, HT);
    beam(`B${i + 3}`, 'G28-A BK-89', 'bow', '890x68x44', M, [0, RISE - BH / 2, z], [upTip, RISE - BH / 2, TZ], BH, HT);
  });

  // Stem G28-C: 1050 x 140 board on the centre line with its broad face to the side, leaning out over the beam tips.
  const yLow = BH / 2, yUp = RISE - BH / 2;
  const lean = (upTip - lowTip) / (yUp - yLow);
  const ang = Math.atan(-lean);
  const stemAx = [-Math.sin(ang), Math.cos(ang), 0];
  const side = [Math.cos(ang), Math.sin(ang), 0];
  const stemFoot = [lowTip + lean * (0 - yLow), 0, TZ];
  const L = 1050;
  prism('B5', 'G28-C B-105', 'bow', '1050x140x18', M, stemFoot, side, stemAx,
    [[0, 0], [PLANK, 0], [PLANK, L], [0, L]], PTH);
  const head = add(add(stemFoot, mul(stemAx, L - 50)), mul(side, PLANK / 2));

  // Bow head G28 steps 7-9: B-30 plates on both sides of the stem. Placement is approximate.
  [-1, 1].forEach((s, i) => {
    const o = add(head, [0, 0, s * (PTH / 2 + PTH / 2)]);
    prism(`B${i + 6}`, 'G28-D B-30', 'bow', '300x140x18', E, o, side, stemAx,
      [[-190, -70], [110, -70], [110, 70], [-190, 70]], PTH);
  });
  prism('B8', 'G28-E B-19', 'bow', '190x140x18', E, add(head, mul(stemAx, 70)), side, stemAx,
    [[-95, 0], [95, 0], [40, 70], [-40, 70]], PTH);

  // Climbing holds G24: heights follow the wall planks; x positions and colours are read from the user's photos.
  const HOLD_C: Record<string, Rgb> = {
    H1: [0.80, 0.68, 0.20], H2: [0.90, 0.50, 0.45], H3: [0.15, 0.45, 0.75], H4: [0.92, 0.65, 0.70], H5: [0.15, 0.55, 0.45],
  };
  {
    const gap = (DECK - 6 * PLANK) / 5;
    const holds = [['H1', .72, 5], ['H2', .35, 4], ['H3', .68, 3], ['H4', .35, 2], ['H5', .70, 1]] as const;
    for (const [name, xf, plank] of holds) {
      const y = plank * (PLANK + gap) + PLANK / 2;
      const x = W * xf;
      box(name, 'G24-D', 'hold', 'climbing stone', E, x - 35, x + 35, y - 40, y + 40, D + PTH, D + PTH + 45);
      parts.at(-1)!.color = HOLD_C[name]!;
    }
  }

  // Handles, two on the outer face of the wall posts above the deck. Position is an estimate from the photos.
  [PT / 2, W - PT / 2].forEach((x, i) => {
    box(`G${i + 1}`, 'handle', 'handle', 'handle', E, x - 15, x + 15, DECK + 150, DECK + 450, D, D + 45);
  });

  for (const p of parts.slice(shipStart)) {
    p.faces = p.faces.map(f => f.map(v => [XS + v[2]!, v[1]!, ZS + 800 - v[0]!]));
  }

  // -------------------------------------------------------------- B07 bridge
  // Belts clamp over the A45 lower beam and the A47 single cross beam.
  const Z0 = 770, Y0 = 1180, Z1 = ZS + 44, Y1 = 1160;
  const SAG = 200; // estimate: 190 cm belts minus the part wrapped around the beams
  const bridgePt = (t: number): number[] => [Z0 + (Z1 - Z0) * t, Y0 + (Y1 - Y0) * t - 4 * SAG * t * (1 - t)];
  const SAMPLES = Array.from({ length: 201 }, (_, i) => bridgePt(i / 200));
  const arc = [0];
  for (let i = 0; i < 200; i++) arc.push(arc[i]! + dist(SAMPLES[i]!, SAMPLES[i + 1]!));
  const atArc = (s: number): [number[], Vec] => {
    for (let i = 0; i < 200; i++) {
      if (arc[i + 1]! >= s) {
        const f = (s - arc[i]!) / (arc[i + 1]! - arc[i]!);
        const a = SAMPLES[i]!, b = SAMPLES[i + 1]!;
        return [[a[0]! + (b[0]! - a[0]!) * f, a[1]! + (b[1]! - a[1]!) * f], norm([0, b[1]! - a[1]!, b[0]! - a[0]!])];
      }
    }
    return [SAMPLES[200]!, norm([0, 0, 1])];
  };
  const PITCH = 149; // 140 mm board + 9 mm spacer, B07 step 1
  const first = (arc[200]! - 9 * PITCH) / 2;
  for (let i = 0; i < 10; i++) {
    const [[z, y], t] = atArc(first + i * PITCH);
    let n = norm(cross(t, [1, 0, 0]));
    if (n[1]! < 0) n = mul(n, -1);
    prism(`T${i + 1}`, 'B07-B B-62', 'floor', '620x140x18', M, [1095, y! + n[1]! * 12, z! + n[2]! * 12], t, [1, 0, 0],
      [[-70, -310], [70, -310], [70, 310], [-70, 310]], 18);
  }
  [1095 - 232, 1095 + 232].forEach((x, j) => { // B07 step 4: belt edge 60 mm from the board end, width estimated
    const start = parts.length;
    for (let k = 0; k + 8 <= 200; k += 8) {
      const a = SAMPLES[k]!, b = SAMPLES[k + 8]!;
      beam(`b${j}`, 'r', 'r', 'r', E, [x, a[1]!, a[0]!], [x, b[1]!, b[0]!], 3, 36);
    }
    merge(start, `B${j + 1}`, 'B07-I belt', 'belt', '1900x36', E);
  });
  // Rails A inside the inner posts: 60 cm high, 80 mm gap (step 7). Rails sit on the bridge-facing inside of the posts.
  const RAIL_TOP = 1198 + 600;
  [783, 1407 - 18].forEach((x0, i) => {
    [RAIL_TOP, RAIL_TOP - 220].forEach((ytop, j) => {
      box(`R${i + 1}${j + 1}`, 'B07-A B-153', 'side', '1530x140x18', M, x0, x0 + 18, ytop - 140, ytop, 756, 2286);
    });
  });

  // -------------------------------------------------------------- H10 shields
  {
    let n = 0;
    for (const x of [783 - 2, 1407 - 18 - 2]) {
      for (const z of [756 + 510, 756 + 1020]) {
        n += 1;
        disc(`S${n}`, 'H10-C shield', 'canvas', 'dia 280', M, [x, RAIL_TOP - 180, z], [0, 1, 0], [0, 0, 1], 140, 3);
      }
    }
  }

  // -------------------------------------------------------------- G01 slide (shape estimated, length from product page)
  {
    const start = parts.length;
    const PROFILE = [[-60, 1205], [120, 1180], [400, 980], [650, 800], [900, 680], [1150, 500], [1400, 340],
      [1600, 170], [1780, 110], [1840, 110]] as const;
    for (let i = 0; i + 1 < PROFILE.length; i++) {
      const a = PROFILE[i]!, b = PROFILE[i + 1]!;
      const p0 = [LEN + a[0], a[1], 400], p1 = [LEN + b[0], b[1], 400];
      beam('s', 'r', 'slide', 'r', E, p0, p1, 10, 500);
      for (const z of [165, 635]) {
        beam('s', 'r', 'slide', 'r', E, [p0[0]!, p0[1]! + 45, z], [p1[0]!, p1[1]! + 45, z], 90, 30);
      }
    }
    merge(start, 'slide', 'G01-B slide', 'slide', '2200x500', E);
  }

  if (swapLadderSlide) {
    // Both attach to identical house ends, so mirroring them about the house centre swaps them. Reversal keeps normals outward.
    for (const p of [...parts.slice(ladderStart, ladderEnd), parts.at(-1)!]) {
      p.faces = p.faces.map(f => [...f].reverse().map(v => [LEN - v[0]!, v[1]!, v[2]!]));
    }
  }

  // Assign modules; handles beside the ladder belong with C14 for transport, ship handles with A47.
  parts.forEach((p, i) => {
    const m = p.kit.split('-')[0]!.split(' ')[0]!;
    p.module = m in MODULE_COLORS ? m as ModuleCode : i >= shipStart ? 'A47' : 'C14';
  });

  const out: Part[] = parts.map(p => {
    const tri: number[] = [];
    for (const face of p.faces) {
      for (const t of triangulate(face)) {
        for (const i of t) tri.push(...face[i]!.map(roundHalfEven));
      }
    }
    const col = p.color ?? COLORS[p.group]!;
    return {
      id: `${p.module}_${p.id}`, module: p.module!, kit: p.kit, group: p.group, size: p.size,
      source: p.source, natural: col.map(round3) as unknown as Rgb, tri,
    };
  });
  checkIds(out);
  checkStock(out);
  const moduleColors = Object.fromEntries(
    Object.entries(MODULE_COLORS).map(([k, v]) => [k, [...v]]),
  ) as unknown as Record<ModuleCode, Rgb>;
  return { parts: out, moduleColors };
}
