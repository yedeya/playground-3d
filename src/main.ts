import './styles.css';
import data from './data/speeltoestel.json';
import { createActions } from './actions.js';
import { createStore } from './store.js';
import { byId } from './ui/dom.js';
import { createPanel } from './ui/panel.js';
import { createViewer } from './viewer/viewer.js';

const store = createStore({ filter: null, selected: null, natural: false });

const actions = createActions({ data, store });

createPanel({ data, store, actions });

try {
  const viewer = createViewer({
    canvas: byId('view', HTMLCanvasElement),
    data,
    store,
    onPick: actions.pick,
  });
  byId('reset', HTMLButtonElement).addEventListener('click', viewer.home);
} catch (error) {
  console.error(error);
  byId('fail', HTMLElement).hidden = false;
}
