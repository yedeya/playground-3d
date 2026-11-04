import { describe, expect, it } from 'vitest';
import data from '../src/data/speeltoestel.json';
import { MODULES, kindOf, kitText, matchesFilter, sizeText } from '../src/domain/parts.js';

describe('model data', () => {
  it('holds every part with a unique id, a known module and whole triangles', () => {
    expect(data.parts).toHaveLength(161);
    expect(new Set(data.parts.map(p => p.id)).size).toBe(161);
    for (const p of data.parts) {
      expect(MODULES[p.module], p.id).toBeTruthy();
      expect(p.tri.length, p.id).toBeGreaterThan(0);
      expect(p.tri.length % 9, p.id).toBe(0);
    }
  });

  it('marks 22 parts as estimated', () => {
    expect(data.parts.filter(p => p.source === 'estimate')).toHaveLength(22);
  });

  it('has the ladder and slide swapped compared with the manual', () => {
    const xs = id => {
      const { tri } = data.parts.find(p => p.id === id);
      return tri.filter((_, i) => i % 3 === 0);
    };
    expect(Math.min(...xs('C14_S1'))).toBeGreaterThan(2190);
    expect(Math.min(...xs('G01_slide'))).toBeLessThan(0);
  });
});

describe('part texts', () => {
  it('formats sizes', () => {
    expect(sizeText('1950x88x44')).toBe('1950 × 88 × 44 mm');
    expect(sizeText('dia 280')).toBe('Ø 280 mm');
    expect(sizeText('handle')).toBeNull();
    expect(sizeText('700x590 in parts list, drawn about 700 high')).toBe('700 × 590 mm (tekening: ca. 700 hoog)');
  });

  it('removes the English description from manual codes', () => {
    expect(kitText('E24-F swing hook')).toBe('E24-F');
    expect(kitText('A45-A BG-220')).toBe('A45-A BG-220');
  });

  it('names a part by its role in the module', () => {
    expect(kindOf({ module: 'C14', group: 'floor' })).toBe('Laddersport');
    expect(kindOf({ module: 'A45', group: 'floor' })).toBe('Vloerplank');
  });
});

describe('filter', () => {
  const part = { module: 'A45', source: 'estimate' };
  it('matches everything, a module, or the estimates', () => {
    expect(matchesFilter(part, null)).toBe(true);
    expect(matchesFilter(part, 'A45')).toBe(true);
    expect(matchesFilter(part, 'B07')).toBe(false);
    expect(matchesFilter(part, 'estimate')).toBe(true);
  });
});
