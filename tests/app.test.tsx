// @vitest-environment jsdom
// The whole page as the client component wires it, with the committed GLB as the model it fetches. jsdom has no WebGL,
// so the 3D viewer cannot start here.
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import SpeeltoestelApp from '../src/app/speeltoestel-app';
import { modelShown, stubModelFetch } from './model-glb';
import { loadPage } from './page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const chip = (row: string, key: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(`#${row} > button`)].find(b => b.dataset.key === key)!;

let consoleError: MockInstance<typeof console.error>;
let root: Root | null = null;

/**
 * Mounts the client component the way `next dev` does: under strict mode, which mounts it, unmounts it and mounts it
 * again. Then waits for the model it fetches.
 */
async function mount() {
  root = createRoot(document.createElement('div'));
  act(() => root!.render(<StrictMode><SpeeltoestelApp /></StrictMode>));
  await modelShown();
}

function unmount() {
  act(() => root!.unmount());
  root = null;
}

beforeEach(async () => {
  loadPage();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  stubModelFetch();
  await mount();
});
afterEach(() => {
  if (root) unmount();
  vi.unstubAllGlobals();
  consoleError.mockRestore();
});

describe('page', () => {
  it('[APP-12] opens in module colours', () => {
    expect(document.body.classList.contains('natural')).toBe(false);
    expect($('#colour').textContent).toBe('Houtkleur');
  });

  it('[APP-15] shows the #fail message when the 3D viewer cannot start', () => {
    expect($('#fail').hidden).toBe(false);
    expect(consoleError).toHaveBeenCalled();
  });

  it('[APP-15] [MODEL-11] keeps the filters, part list, card and colour button working without the viewer once the GLB has loaded', () => {
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

describe('mounting under strict mode without the viewer', () => {
  it('leaves one module row, and one colour button handler that toggles once per click', () => {
    expect(document.querySelectorAll('#modules > button')).toHaveLength(13);
    $('#colour').click();
    expect(document.body.classList.contains('natural')).toBe(true);
    $('#colour').click();
    expect(document.body.classList.contains('natural')).toBe(false);
  });

  it('gives the page back as the route rendered it on unmount', () => {
    $('#colour').click();
    chip('modules', 'C14').click();
    unmount();
    expect(document.body.classList.contains('natural')).toBe(false);
    const fresh = document.createElement('body');
    fresh.innerHTML = document.body.innerHTML;
    // three.js labels the canvas before it finds no WebGL; that label is all the failed start leaves.
    fresh.querySelector('canvas')!.removeAttribute('data-engine');
    loadPage();
    expect(fresh.innerHTML).toBe(document.body.innerHTML);
  });
});
