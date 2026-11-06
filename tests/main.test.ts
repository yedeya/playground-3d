// @vitest-environment jsdom
// The whole page as main.js wires it. jsdom has no WebGL, so the 3D viewer cannot start here.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { loadPage } from './page.js';

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const chip = (row: string, key: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(`#${row} > button`)].find(b => b.dataset.key === key)!;

let consoleError: MockInstance<typeof console.error>;
beforeEach(async () => {
  loadPage();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.resetModules();
  await import('../src/main.js');
});
afterEach(() => consoleError.mockRestore());

describe('page', () => {
  it('[APP-12] opens in module colours', () => {
    expect(document.body.classList.contains('natural')).toBe(false);
    expect($('#colour').textContent).toBe('Houtkleur');
  });

  it('[APP-15] shows the #fail message when the 3D viewer cannot start', () => {
    expect($('#fail').hidden).toBe(false);
    expect(consoleError).toHaveBeenCalled();
  });

  it('[APP-15] keeps the filters, part list, card and colour button working without the viewer', () => {
    expect($('#stats').textContent).toBe('161 onderdelen · 11 modules · 22 geschat');
    expect($('#card h2').textContent).toBe('Tik op een onderdeel');

    chip('modules', 'C14').click();
    expect(chip('modules', 'C14').getAttribute('aria-pressed')).toBe('true');
    expect(chip('modules', 'all').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('#parts > button')).toHaveLength(8);
    expect($('#card h2').textContent).toBe('C14 Ladder');

    chip('parts', 'C14_S1').click();
    expect(chip('parts', 'C14_S1').getAttribute('aria-pressed')).toBe('true');
    expect($('#card h2').textContent.replace(/\s+/g, ' ')).toBe('C14_S1 Balk');

    chip('modules', 'estimate').click();
    expect($('#card h2').textContent).toBe('22 geschatte onderdelen');
    expect(document.querySelectorAll('#parts > button')).toHaveLength(22);

    $('#colour').click();
    expect(document.body.classList.contains('natural')).toBe(true);
    expect($('#colour').textContent).toBe('Modulekleur');
  });
});
