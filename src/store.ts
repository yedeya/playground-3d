// The app's single source of UI state. Viewer and panel subscribe; neither talks to the other directly.
import type { Filter } from './domain/model';

export interface AppState {
  filter: Filter;
  /** The selected part's id, or null. */
  selected: string | null;
  /** true = wood colours, false = module colours. */
  natural: boolean;
}

export type Listener = (state: AppState) => void;

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  /** Calls fn after every set; returns the function that unsubscribes it. */
  subscribe(fn: Listener): () => boolean;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
