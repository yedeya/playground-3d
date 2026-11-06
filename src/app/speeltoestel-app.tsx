'use client';
// Mounts the store, the panel and the 3D viewer on the page's markup, in the browser only, and tears them down
// on unmount. Renders nothing itself: the panel and the viewer stay the imperative modules they were on Vite.
// The model is the GLB fetched at runtime ([MODEL-9]); until it is in, the page says so, and if it cannot load, the
// page says that instead of building a panel without parts ([MODEL-11]).
import { useEffect } from 'react';
import { createActions } from '../actions';
import { loadModel, type LoadedModel } from '../data/load-model';
import { createStore, type Store } from '../store';
import { byId } from '../ui/dom';
import { createPanel } from '../ui/panel';
import { createViewer } from '../viewer/viewer';

/** The stats line while the GLB loads. English, as the Maintainer chose (docs/projects/7.md, decision 2). */
export const LOADING_TEXT = 'Loading model…';
/** The #fail text when the GLB cannot be fetched or read. English, as the Maintainer chose (decision 2). */
export const LOAD_FAILED_TEXT = "The model can't load. Reload the page or try another browser.";

/** Builds the panel and the viewer on the loaded model; returns the function that takes them down again. */
function showModel(model: LoadedModel, store: Store, fail: HTMLElement): () => void {
  const actions = createActions({ data: model, store });
  const panel = createPanel({ data: model, store, actions });
  const reset = byId('reset', HTMLButtonElement);

  let disposeViewer = () => {};
  try {
    const viewer = createViewer({
      canvas: byId('view', HTMLCanvasElement),
      data: model,
      store,
      onPick: actions.pick,
    });
    reset.addEventListener('click', viewer.home);
    disposeViewer = () => {
      reset.removeEventListener('click', viewer.home);
      viewer.dispose();
    };
  } catch (error) {
    console.error(error);
    fail.hidden = false;
  }

  return () => {
    disposeViewer();
    fail.hidden = true;
    panel.dispose();
  };
}

/** Wires the app into the page; returns the function that unwires it again. */
export function mountApp(): () => void {
  const store = createStore({ filter: null, selected: null, natural: false });
  const stats = byId('stats', HTMLElement);
  const fail = byId('fail', HTMLElement);
  // What the page held before the app filled it in, for the unwiring to put back.
  const rendered = { stats: stats.textContent, fail: fail.textContent };

  stats.textContent = LOADING_TEXT;
  const loading = new AbortController();
  let mounted = true;
  let hideModel = () => {};

  loadModel(loading.signal).then(
    model => {
      if (mounted) hideModel = showModel(model, store, fail);
    },
    (error: unknown) => {
      if (!mounted) return;
      console.error(error);
      stats.textContent = rendered.stats;
      fail.textContent = LOAD_FAILED_TEXT;
      fail.hidden = false;
    },
  );

  return () => {
    mounted = false;
    loading.abort();
    hideModel();
    fail.hidden = true;
    fail.textContent = rendered.fail;
    stats.textContent = rendered.stats;
  };
}

export default function SpeeltoestelApp() {
  useEffect(mountApp, []);
  return null;
}
