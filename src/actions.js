// What the panel and the viewer may ask of the store.
import { matchesFilter } from './domain/parts.js';

export function createActions({ data, store }) {
  const actions = {
    select: id => store.set({ selected: id }),
    setFilter(filter) {
      const { selected } = store.get();
      const part = data.parts.find(p => p.id === selected);
      store.set({ filter, selected: part && matchesFilter(part, filter) ? selected : null });
    },
    /** A tap in the viewer: selects the part it hit, or clears an existing selection when it hit nothing. */
    pick(part) {
      if (part) actions.select(part.id);
      else if (store.get().selected) actions.select(null);
    },
  };
  return actions;
}
