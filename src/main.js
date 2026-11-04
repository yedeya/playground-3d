import './styles.css';
import data from './data/speeltoestel.json';
import { matchesFilter } from './domain/parts.js';
import { createStore } from './store.js';
import { createPanel } from './ui/panel.js';
import { createViewer } from './viewer/viewer.js';

const store = createStore({ filter: null, selected: null, natural: false });

const actions = {
  select: id => store.set({ selected: id }),
  setFilter(filter) {
    const { selected } = store.get();
    const part = data.parts.find(p => p.id === selected);
    store.set({ filter, selected: part && matchesFilter(part, filter) ? selected : null });
  },
};

createPanel({ data, store, actions });

try {
  const viewer = createViewer({
    canvas: document.getElementById('view'),
    data,
    store,
    onPick: part => {
      if (part) actions.select(part.id);
      else if (store.get().selected) actions.select(null);
    },
  });
  document.getElementById('reset').addEventListener('click', viewer.home);
} catch (error) {
  console.error(error);
  document.getElementById('fail').hidden = false;
}
