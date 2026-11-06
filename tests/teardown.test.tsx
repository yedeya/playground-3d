// @vitest-environment jsdom
// Mounting and unmounting the client component with a viewer that starts. jsdom has no WebGL and no
// ResizeObserver, so this file stands in a counting renderer and observer; the rest of three.js is real.
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Listener, Store } from '../src/store';
import { loadPage } from './page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seen = vi.hoisted(() => ({
  renderers: [] as { disposed: boolean }[],
  observers: [] as { observing: number }[],
  /** Every store the app created, with the listeners subscribed to it right now. */
  stores: [] as { listeners: Set<unknown> }[],
}));

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>();
  class CountingRenderer {
    disposed = false;
    domElement: HTMLCanvasElement;
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas;
      seen.renderers.push(this);
    }
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() { this.disposed = true; }
  }
  return { ...three, WebGLRenderer: CountingRenderer };
});

vi.mock('../src/store', async importOriginal => {
  const real = await importOriginal<typeof import('../src/store')>();
  return {
    ...real,
    createStore(initial: AppState): Store {
      const store = real.createStore(initial);
      const record = { listeners: new Set<Listener>() };
      seen.stores.push(record);
      return {
        ...store,
        subscribe(fn) {
          record.listeners.add(fn);
          const off = store.subscribe(fn);
          return () => { record.listeners.delete(fn); return off(); };
        },
      };
    },
  };
});

class CountingObserver {
  observing = 0;
  constructor() { seen.observers.push(this); }
  observe() { this.observing++; }
  unobserve() { this.observing--; }
  disconnect() { this.observing = 0; }
}

interface Listening { target: EventTarget; type: string; listener: unknown }

const { addEventListener: add, removeEventListener: remove } = EventTarget.prototype;
// Vitest's jsdom window carries its own copies of these, which do not go through EventTarget.prototype.
const { addEventListener: addToWindow, removeEventListener: removeFromWindow } = window;

/** Starts counting DOM listeners: returns the listeners added since, minus those removed again. */
function trackListeners() {
  const live: Listening[] = [];
  const track = (original: typeof add) => function (this: EventTarget, ...args: Parameters<typeof add>) {
    const [type, listener] = args;
    if (listener && !live.some(l => l.target === this && l.type === type && l.listener === listener)) {
      live.push({ target: this, type, listener });
    }
    original.apply(this, args);
  };
  const untrack = (original: typeof remove) => function (this: EventTarget, ...args: Parameters<typeof remove>) {
    const [type, listener] = args;
    const at = live.findIndex(l => l.target === this && l.type === type && l.listener === listener);
    if (at >= 0) live.splice(at, 1);
    original.apply(this, args);
  };
  vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(track(add));
  vi.spyOn(EventTarget.prototype, 'removeEventListener').mockImplementation(untrack(remove));
  if (addToWindow !== add) {
    vi.spyOn(window, 'addEventListener').mockImplementation(track(addToWindow));
    vi.spyOn(window, 'removeEventListener').mockImplementation(untrack(removeFromWindow));
  }
  return live;
}

let root: Root | null = null;

/** Creates the React root first, so the listeners React itself puts on it are not counted as the app's. */
async function mount(strict: boolean) {
  const { default: SpeeltoestelApp } = await import('../src/app/speeltoestel-app');
  root = createRoot(document.createElement('div'));
  const listeners = trackListeners();
  act(() => root!.render(strict ? <StrictMode><SpeeltoestelApp /></StrictMode> : <SpeeltoestelApp />));
  return listeners;
}

function unmount() {
  act(() => root!.unmount());
  root = null;
}

const liveRenderers = () => seen.renderers.filter(r => !r.disposed).length;
const liveObservers = () => seen.observers.filter(o => o.observing > 0).length;
const subscribed = () => seen.stores.map(s => s.listeners.size);

beforeEach(() => {
  seen.renderers.length = 0;
  seen.observers.length = 0;
  seen.stores.length = 0;
  vi.stubGlobal('ResizeObserver', CountingObserver);
  loadPage();
});
afterEach(() => {
  if (root) unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const moduleChips = () => document.querySelectorAll('#modules > button').length;
const listenersOn = (live: Listening[], target: EventTarget) =>
  live.filter(l => l.target === target).map(l => l.type).sort();
/** The listeners still reachable from the page: on the window, the document or an element in it. A chip that left the page took its own with it. */
const inPage = (live: Listening[]) =>
  live.filter(l => l.target === window || (l.target instanceof Node && l.target.isConnected));

describe('mounting and unmounting the viewer and the panel', () => {
  it('[PLAT-5] leaves one set of module chips, one WebGL renderer and no listener of the first mount on the store, under strict mode', async () => {
    await mount(true);
    // Strict mode mounted, unmounted and mounted again: two of everything were created, one is left.
    expect(seen.renderers).toHaveLength(2);
    expect(seen.stores).toHaveLength(2);
    expect(moduleChips()).toBe(13);
    expect(liveRenderers()).toBe(1);
    expect(liveObservers()).toBe(1);
    // The first mount's panel and viewer listened to the first store; neither does any more.
    expect(subscribed()).toEqual([0, 2]);
  });

  it('[PLAT-5] leaves the same listeners under strict mode as a single mount does', async () => {
    const once = await mount(false);
    const single = { window: listenersOn(once, window), canvas: listenersOn(once, document.getElementById('view')!), count: inPage(once).length };
    unmount();
    loadPage();
    const twice = await mount(true);
    expect(single.window).toContain('pointerup');
    expect(single.canvas).toContain('pointerdown');
    expect({ window: listenersOn(twice, window), canvas: listenersOn(twice, document.getElementById('view')!), count: inPage(twice).length })
      .toEqual(single);
  });

  it('[PLAT-5] tears everything down on unmount: chips, renderer, observer, store and DOM listeners', async () => {
    const live = await mount(true);
    unmount();
    expect(moduleChips()).toBe(0);
    expect(document.querySelectorAll('#parts > button')).toHaveLength(0);
    expect(liveRenderers()).toBe(0);
    expect(liveObservers()).toBe(0);
    expect(subscribed()).toEqual([0, 0]);
    expect(inPage(live)).toEqual([]);
  });

  it('[PLAT-5] mounts again after an unmount as it did the first time', async () => {
    await mount(true);
    unmount();
    await mount(true);
    expect(moduleChips()).toBe(13);
    expect(liveRenderers()).toBe(1);
    expect(subscribed()).toEqual([0, 0, 0, 2]);
    expect(document.getElementById('fail')!.hidden).toBe(true);
  });
});
