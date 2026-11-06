import { describe, expect, it } from 'vitest';
import baseline from './fixtures/model-baseline.json';
import type { Part } from '../src/domain/model.js';
import { STOCK, SWAP_LADDER_SLIDE, build, checkIds, checkStock } from '../model/generator.js';

type Vec = readonly [number, number, number];

const built = build();
const unswapped = build({ swapLadderSlide: false });
const byId = (parts: readonly Part[], id: string): Part => {
  const part = parts.find(p => p.id === id);
  if (!part) throw new Error(`no part ${id}`);
  return part;
};

/** The ladder's eight parts and the slide: the parts the ladder-and-slide switch moves. */
const SWITCHED = ['C14_S1', 'C14_S2', 'C14_T1', 'C14_T2', 'C14_T3', 'C14_T4', 'C14_G1', 'C14_G2', 'G01_slide'];

const vertices = (tri: readonly number[]): Vec[] => {
  const out: Vec[] = [];
  for (let i = 0; i < tri.length; i += 3) out.push([tri[i]!, tri[i + 1]!, tri[i + 2]!]);
  return out;
};
const distinct = (tri: readonly number[]): Vec[] => [...new Map(vertices(tri).map(v => [v.join(','), v])).values()];
const mirror = (v: Vec): Vec => [2190 - v[0], v[1], v[2]];
const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The vertices of `from` that lie more than 1 mm from every vertex of `to`. */
const unmatched = (from: readonly Vec[], to: readonly Vec[]) => from.filter(v => !to.some(w => dist(v, w) <= 1));
/** Six times the signed volume the triangles enclose: positive when they face outward. */
const signedVolume = (tri: readonly number[]) => {
  const vs = vertices(tri);
  let sum = 0;
  for (let i = 0; i < vs.length; i += 3) {
    const [a, b, c] = [vs[i]!, vs[i + 1]!, vs[i + 2]!];
    sum += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return sum;
};

describe('the generator against the baseline', () => {
  it('[MODEL-2] the generator matches the baseline fixture part for part', () => {
    expect(built.parts).toHaveLength(161);
    expect(new Set(built.parts.map(p => p.module)).size).toBe(11);
    expect(built.parts.map(p => p.id)).toEqual(baseline.parts.map(p => p.id));
    const far: string[] = [];
    built.parts.forEach((p, n) => {
      const b = baseline.parts[n]!;
      const { tri, ...fields } = p;
      const { tri: baseTri, ...baseFields } = b;
      expect(fields, p.id).toEqual(baseFields);
      expect(tri.length, p.id).toBe(baseTri.length);
      tri.forEach((c, i) => {
        if (!(Math.abs(c - baseTri[i]!) <= 1)) far.push(`${p.id}[${i}]: ${c} vs ${baseTri[i]}`);
      });
    });
    expect(far).toEqual([]);
  });

  it('returns the module colours the JSON model carries', () => {
    expect(built.moduleColors).toEqual(baseline.moduleColors);
  });
});

describe('the stock check', () => {
  it('[MODEL-3] carries the 25-code stock table over unchanged from the Python generator', () => {
    expect(STOCK).toEqual({
      'P-220': 1, 'BG-220': 9, 'BG-195': 8, 'BG-151': 1, 'BG-36': 8, 'BG-13': 1, 'BK-140': 2, 'BK-89': 2, 'BK-80': 3,
      'BK-78': 2, 'BK-76': 2, 'BK-70': 4, 'BK-51': 4, 'BK-34': 2, 'BK-16': 2, 'B-153': 4, 'B-145': 1, 'B-105': 2,
      'B-89': 2, 'B-80': 22, 'B-71': 37, 'B-62': 10, 'B-30': 2, 'B-19': 1, handle: 4,
    });
    expect(Object.keys(STOCK)).toHaveLength(25);
  });

  it('[MODEL-3] passes the model, whose counts equal the manual parts list', () => {
    expect(() => checkStock(built.parts)).not.toThrow();
  });

  it("[MODEL-3] a differing count stops the generator, naming each code with the model's count and the manual's", () => {
    const withoutB80 = built.parts.filter(p => p.id !== 'A47_W1');
    const extraTread = { ...byId(built.parts, 'C14_T1'), id: 'C14_T5' };
    const extraHandle = { ...byId(built.parts, 'C14_G1'), id: 'C14_G3' };
    const wrong = [...withoutB80, extraTread, extraHandle];
    expect(() => checkStock(wrong)).toThrow(/B-80: model 21, manual 22/);
    expect(() => checkStock(wrong)).toThrow(/BK-51: model 5, manual 4/);
    expect(() => checkStock(wrong)).toThrow(/handle: model 5, manual 4/);
    expect(() => checkStock(wrong)).not.toThrow(/B-71/);
  });

  it('[MODEL-3] does not check last words outside the table, such as hook, seat and slide', () => {
    for (const id of ['E24_F1', 'E24_seat', 'G01_slide']) {
      const extra = { ...byId(built.parts, id), id: `${id}x` };
      expect(() => checkStock([...built.parts, extra])).not.toThrow();
    }
  });
});

describe('the part ids', () => {
  it('[MODEL-4] each id is the module code, _ and its id within the module; a handle takes the module of its structure', () => {
    for (const p of built.parts) expect(p.id.startsWith(`${p.module}_`), p.id).toBe(true);
    expect(byId(built.parts, 'A45_VP1').kit).toBe('A45-B BG-195');
    const handles = built.parts.filter(p => p.kit === 'handle').map(p => p.id);
    expect(handles).toEqual(['C14_G1', 'C14_G2', 'A47_G1', 'A47_G2']);
  });

  it('[MODEL-4] ids are unique, and a duplicate stops the generator, naming the id', () => {
    expect(new Set(built.parts.map(p => p.id)).size).toBe(built.parts.length);
    expect(() => checkIds(built.parts)).not.toThrow();
    const twice = [...built.parts, byId(built.parts, 'B07_T3')];
    expect(() => checkIds(twice)).toThrow(/B07_T3/);
  });
});

describe('the ladder-and-slide switch', () => {
  it('[MODEL-5] is on by default, as in today\'s model, and is the default of the build option', () => {
    expect(SWAP_LADDER_SLIDE).toBe(true);
    expect(build({ swapLadderSlide: true })).toEqual(built);
    expect(Math.min(...vertices(byId(built.parts, 'C14_S1').tri).map(v => v[0]))).toBeGreaterThan(2190);
    expect(Math.min(...vertices(byId(built.parts, 'G01_slide').tri).map(v => v[0]))).toBeLessThan(0);
    expect(Math.max(...vertices(byId(unswapped.parts, 'C14_S1').tri).map(v => v[0]))).toBeLessThan(0);
    expect(Math.max(...vertices(byId(unswapped.parts, 'G01_slide').tri).map(v => v[0]))).toBeGreaterThan(2190);
  });

  it('[MODEL-5] switched off, the nine parts are the mirror image with as many triangles, facing outward both ways', () => {
    for (const id of SWITCHED) {
      const on = byId(built.parts, id);
      const off = byId(unswapped.parts, id);
      expect(off.tri.length, id).toBe(on.tri.length);
      const onSet = distinct(on.tri);
      const offSet = distinct(off.tri);
      expect(unmatched(offSet, onSet.map(mirror)), id).toEqual([]);
      expect(unmatched(onSet.map(mirror), offSet), id).toEqual([]);
      expect(signedVolume(on.tri), id).toBeGreaterThan(0);
      expect(signedVolume(off.tri), id).toBeGreaterThan(0);
    }
  });

  it('[MODEL-5] leaves every other part identical in both settings', () => {
    expect(unswapped.parts.map(p => p.id)).toEqual(built.parts.map(p => p.id));
    const others = (parts: readonly Part[]) => parts.filter(p => !SWITCHED.includes(p.id));
    expect(others(unswapped.parts)).toHaveLength(161 - 9);
    expect(others(unswapped.parts)).toEqual(others(built.parts));
    expect(unswapped.moduleColors).toEqual(built.moduleColors);
  });
});
