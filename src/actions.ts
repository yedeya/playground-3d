// What the panel and the viewer may ask of the store.
import type { Filter, Part } from './domain/model.js';
import { matchesFilter } from './domain/parts.js';
import type { Store } from './store.js';

/** The fields of a part the actions read. */
export type ActionPart = Pick<Part, 'id' | 'module' | 'source'>;

export interface Actions {
  select(id: string | null): void;
  setFilter(filter: Filter): void;
  pick(part: Pick<Part, 'id'> | null): void;
}

export function createActions({ data, store }: { data: { parts: readonly ActionPart[] }; store: Store }): Actions {
  const actions: Actions = {
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
