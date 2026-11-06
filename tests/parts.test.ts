import { describe, expect, it } from 'vitest';
import data from '../src/data/speeltoestel.json';
import type { Part } from '../src/domain/model';
import { MODULES, MODULE_ORDER, kindOf, kitText, matchesFilter, sizeText } from '../src/domain/parts';

describe('model data', () => {
  it('[APP-1] holds 161 parts with unique ids, one of the 11 module codes and whole triangles', () => {
    expect(MODULE_ORDER).toHaveLength(11);
    expect(data.parts).toHaveLength(161);
    expect(new Set(data.parts.map(p => p.id)).size).toBe(161);
    for (const p of data.parts) {
      expect(MODULE_ORDER, p.id).toContain(p.module);
      expect(MODULES[p.module], p.id).toBeTruthy();
      expect(p.tri.length, p.id).toBeGreaterThan(0);
      expect(p.tri.length % 9, p.id).toBe(0);
    }
  });

  it('[APP-2] marks exactly 22 parts as estimated', () => {
    expect(data.parts.filter(p => p.source === 'estimate')).toHaveLength(22);
  });

  it('[APP-3] [TRANS-19] has the ladder and slide swapped compared with the manual', () => {
    const xs = (id: string) => {
      const { tri } = data.parts.find(p => p.id === id)!;
      return tri.filter((_, i) => i % 3 === 0);
    };
    expect(Math.min(...xs('C14_S1'))).toBeGreaterThan(2190);
    expect(Math.min(...xs('G01_slide'))).toBeLessThan(0);
  });
});

describe('part texts', () => {
  it('[APP-4] formats sizes, and shows none for a size that is only a description', () => {
    expect(sizeText('1950x88x44')).toBe('1950 × 88 × 44 mm');
    expect(sizeText('dia 280')).toBe('Ø 280 mm');
    expect(sizeText('700x590 in parts list, drawn about 700 high')).toBe('700 × 590 mm (tekening: ca. 700 hoog)');
    expect(sizeText('handle')).toBeNull();
    expect(sizeText('swing hook')).toBeNull();
  });

  it('[APP-5] removes the English description from manual codes, and names the kit handle', () => {
    expect(kitText('E24-F swing hook')).toBe('E24-F');
    expect(kitText('A45-A BG-220')).toBe('A45-A BG-220');
    expect(kitText('handle')).toBe('Handgreep uit de stuklijst');
  });

  it('[APP-6] names a part by its role in the module, falling back to its raw group', () => {
    expect(kindOf({ module: 'C14', group: 'floor' })).toBe('Laddersport');
    expect(kindOf({ module: 'A45', group: 'floor' })).toBe('Vloerplank');
    expect(kindOf({ module: 'H10', group: 'canvas' })).toBe('Schild');
    expect(kindOf({ module: 'H10', group: 'floor' })).toBe('Schild');
    const shields = data.parts.filter(p => p.module === 'H10');
    expect(shields.length).toBeGreaterThan(0);
    for (const p of shields) expect(kindOf(p), p.id).toBe('Schild');
    expect(kindOf({ module: 'A45', group: 'gizmo' })).toBe('gizmo');
  });
});

describe('filter', () => {
  const ids = (parts: readonly Pick<Part, 'id'>[]) => parts.map(p => p.id);

  it('[APP-7] matches everything, exactly the estimates, or exactly a module', () => {
    expect(data.parts.every(p => matchesFilter(p, null))).toBe(true);

    expect(ids(data.parts.filter(p => matchesFilter(p, 'estimate'))))
      .toEqual(ids(data.parts.filter(p => p.source === 'estimate')));

    for (const code of MODULE_ORDER) {
      expect(ids(data.parts.filter(p => matchesFilter(p, code))), code)
        .toEqual(ids(data.parts.filter(p => p.module === code)));
    }

    const part = { module: 'A45', source: 'estimate' } as const;
    expect(matchesFilter(part, null)).toBe(true);
    expect(matchesFilter(part, 'A45')).toBe(true);
    expect(matchesFilter(part, 'B07')).toBe(false);
    expect(matchesFilter(part, 'estimate')).toBe(true);
    expect(matchesFilter({ module: 'A45', source: 'manual' }, 'estimate')).toBe(false);
  });
});
