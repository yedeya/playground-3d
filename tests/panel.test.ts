// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import data from '../src/data/speeltoestel.json';
import { createActions } from '../src/actions.js';
import { MODULES, MODULE_ORDER, toCssColor } from '../src/domain/parts.js';
import { createStore, type AppState, type Store } from '../src/store.js';
import { createPanel, type PanelData } from '../src/ui/panel.js';
import { loadPage } from './page.js';

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const chips = (selector: string) => [...document.querySelectorAll<HTMLButtonElement>(`${selector} > button`)];
const pressed = (selector: string) => chips(selector).filter(b => b.getAttribute('aria-pressed') === 'true');
const moduleChip = (key: string) => chips('#modules').find(b => b.dataset.key === key)!;
const partChip = (id: string) => chips('#parts').find(b => b.dataset.key === id)!;
const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();
const fields = () => Object.fromEntries([...document.querySelectorAll('#card dt')]
  .map(dt => [dt.textContent, text(dt.nextElementSibling!)]));

let store: Store;
function open(appData: PanelData = data, initial: Partial<AppState> = {}) {
  store = createStore({ filter: null, selected: null, natural: false, ...initial });
  createPanel({ data: appData, store, actions: createActions({ data: appData, store }) });
}

beforeEach(loadPage);

describe('stats line and module row', () => {
  it('[APP-9] reads the part, module and estimate counts', () => {
    open();
    expect($('#stats').textContent).toBe('161 onderdelen · 11 modules · 22 geschat');
  });

  it('[APP-9] counts parts and estimates from the data, and modules from the module list', () => {
    const parts = data.parts.filter(p => p.module === 'A45');
    const estimates = parts.filter(p => p.source === 'estimate').length;
    open({ ...data, parts });
    expect(new Set(parts.map(p => p.module)).size).toBe(1);
    expect($('#stats').textContent).toBe(`${parts.length} onderdelen · ${MODULE_ORDER.length} modules · ${estimates} geschat`);
  });

  it('[APP-9] holds Alles, one chip per module in module order, then Geschat, and presses only the current filter', () => {
    open();
    const row = chips('#modules');
    expect(row.map(b => b.dataset.key)).toEqual(['all', ...MODULE_ORDER, 'estimate']);

    expect(text(row[0])).toBe('Alles');
    MODULE_ORDER.forEach((code, i) => {
      const button = row[i + 1];
      const n = data.parts.filter(p => p.module === code).length;
      expect(button.querySelector('b')!.textContent, code).toBe(code);
      expect(button.querySelector('i')!.textContent, code).toBe(String(n));
      expect(text(button), code).toBe(`${code} ${MODULES[code]} ${n}`);
      expect(button.querySelector('.tape')!.getAttribute('style'), code)
        .toBe(`background:${toCssColor(data.moduleColors[code])}`);
    });
    expect(text(row.at(-1)!)).toBe('Geschat 22');

    expect(pressed('#modules').map(b => b.dataset.key)).toEqual(['all']);
    for (const key of ['B07', 'estimate', 'all', 'G01']) {
      moduleChip(key).click();
      expect(store.get().filter).toBe(key === 'all' ? null : key);
      expect(pressed('#modules').map(b => b.dataset.key), key).toEqual([key]);
    }
  });
});

describe('part list', () => {
  it('[APP-10] is empty without a filter, and holds the matching parts in data order', () => {
    open();
    expect(chips('#parts')).toHaveLength(0);

    for (const key of ['estimate', ...MODULE_ORDER]) {
      moduleChip(key).click();
      const expected = data.parts
        .filter(p => (key === 'estimate' ? p.source === 'estimate' : p.module === key))
        .map(p => p.id);
      expect(chips('#parts').map(b => b.textContent), key).toEqual(expected);
      expect(chips('#parts').map(b => b.dataset.key), key).toEqual(expected);
    }

    moduleChip('all').click();
    expect(chips('#parts')).toHaveLength(0);
  });

  it('[APP-10] selects a part on its chip, clears it on the selected chip, and presses only the selected chip', () => {
    open();
    moduleChip('A45').click();
    const [first, second] = data.parts.filter(p => p.module === 'A45');
    expect(pressed('#parts')).toHaveLength(0);

    partChip(first.id).click();
    expect(store.get().selected).toBe(first.id);
    expect(pressed('#parts').map(b => b.dataset.key)).toEqual([first.id]);

    partChip(second.id).click();
    expect(store.get().selected).toBe(second.id);
    expect(pressed('#parts').map(b => b.dataset.key)).toEqual([second.id]);

    partChip(second.id).click();
    expect(store.get().selected).toBeNull();
    expect(pressed('#parts')).toHaveLength(0);
  });
});

describe('card', () => {
  it('[APP-11] shows a selected part: id, kind, module, manual code, size and source badge', () => {
    open(data, { filter: 'C14', selected: 'C14_S1' });
    expect(text($('#card h2'))).toBe('C14_S1 Balk');
    expect($('#card .kind').textContent).toBe('Balk');
    expect(fields()).toEqual({
      Module: 'C14 Ladder', Handleiding: 'C14-A BK-140', Maat: '1400 × 68 × 44 mm', Bron: 'Uit handleiding',
    });
    expect(Object.keys(fields())).toEqual(['Module', 'Handleiding', 'Maat', 'Bron']);
  });

  it('[APP-11] shows the source badge and leaves out the size when a part has none', () => {
    const synthetic: PanelData['parts'] = [
      { id: 'X_manual', module: 'A45', group: 'post', kit: 'E24-F swing hook', size: '1950x88x44', source: 'manual' },
      { id: 'X_estimate', module: 'H10', group: 'canvas', kit: 'handle', size: 'handle', source: 'estimate' },
    ];
    open({ ...data, parts: synthetic }, { selected: 'X_manual' });
    expect(text($('#card h2'))).toBe('X_manual Paal');
    expect(fields()).toEqual({ Module: 'A45 Huis', Handleiding: 'E24-F', Maat: '1950 × 88 × 44 mm', Bron: 'Uit handleiding' });
    expect($('#card .badge').className).toBe('badge manual');
    expect($('#card .badge').textContent).toBe('Uit handleiding');

    store.set({ selected: 'X_estimate' });
    expect(text($('#card h2'))).toBe('X_estimate Schild');
    expect(fields()).toEqual({ Module: 'H10 Schilden', Handleiding: 'Handgreep uit de stuklijst', Bron: 'Geschat' });
    expect($('#card .badge').className).toBe('badge estimate');
    expect($('#card .badge').textContent).toBe('Geschat');
  });

  it('[APP-11] shows the count of estimated parts, a module with its count, or the tap hint when nothing is selected', () => {
    open();
    expect($('#card h2').textContent).toBe('Tik op een onderdeel');

    moduleChip('estimate').click();
    expect($('#card h2').textContent).toBe('22 geschatte onderdelen');

    for (const code of MODULE_ORDER) {
      moduleChip(code).click();
      const n = data.parts.filter(p => p.module === code).length;
      expect($('#card h2').textContent, code).toBe(`${code} ${MODULES[code]}`);
      expect($('#card p').textContent, code).toMatch(new RegExp(`^${n} ${n === 1 ? 'onderdeel' : 'onderdelen'}\\. `));
    }

    moduleChip('all').click();
    expect($('#card h2').textContent).toBe('Tik op een onderdeel');
  });

  it('[APP-11] says onderdeel for a module of one part', () => {
    expect(data.parts.filter(p => p.module === 'G01')).toHaveLength(1);
    open(data, { filter: 'G01' });
    expect($('#card p').textContent).toMatch(/^1 onderdeel\. /);
  });
});

describe('colour button', () => {
  it('[APP-12] switches between module colours and wood colours', () => {
    open();
    const button = $('#colour');
    expect(store.get().natural).toBe(false);
    expect(document.body.classList.contains('natural')).toBe(false);
    expect(button.textContent).toBe('Houtkleur');

    button.click();
    expect(store.get().natural).toBe(true);
    expect(document.body.classList.contains('natural')).toBe(true);
    expect(button.textContent).toBe('Modulekleur');

    button.click();
    expect(store.get().natural).toBe(false);
    expect(document.body.classList.contains('natural')).toBe(false);
    expect(button.textContent).toBe('Houtkleur');
  });
});
