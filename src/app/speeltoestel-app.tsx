'use client';
// Mounts the store, the panel and the 3D viewer on the page's markup, in the browser only, and tears them down
// on unmount. Renders nothing itself: the panel and the viewer stay the imperative modules they were on Vite.
import { useEffect } from 'react';
import data from '../data/speeltoestel.json';
import { createActions } from '../actions';
import { createStore } from '../store';
import { byId } from '../ui/dom';
import { createPanel } from '../ui/panel';
import { createViewer } from '../viewer/viewer';

/** Wires the app into the page; returns the function that unwires it again. */
export function mountApp(): () => void {
  const store = createStore({ filter: null, selected: null, natural: false });
  const actions = createActions({ data, store });
  const panel = createPanel({ data, store, actions });
  const reset = byId('reset', HTMLButtonElement);
  const fail = byId('fail', HTMLElement);

  let disposeViewer = () => {};
  try {
    const viewer = createViewer({
      canvas: byId('view', HTMLCanvasElement),
      data,
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

export default function SpeeltoestelApp() {
  useEffect(mountApp, []);
  return null;
}
