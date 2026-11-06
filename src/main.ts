import './styles.css';
import data from './data/speeltoestel.json';
import { createActions } from './actions.js';
import { createStore } from './store.js';
import { createPanel } from './ui/panel.js';
import { createViewer } from './viewer/viewer.js';

const store = createStore({ filter: null, selected: null, natural: false });

const actions = createActions({ data, store });

createPanel({ data, store, actions });

try {
  const viewer = createViewer({
    canvas: document.getElementById('view'),
    data,
    store,
    onPick: actions.pick,
  });
  document.getElementById('reset').addEventListener('click', viewer.home);
} catch (error) {
  console.error(error);
  document.getElementById('fail').hidden = false;
}
