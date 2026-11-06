import { describe, expect, it } from 'vitest';
import data from '../src/data/speeltoestel.json';
import { createActions } from '../src/actions.js';
import { createStore, type AppState } from '../src/store.js';

const part = (id: string) => data.parts.find(p => p.id === id)!;
const estimated = data.parts.find(p => p.source === 'estimate')!;
const manual = data.parts.find(p => p.source === 'manual' && p.module !== estimated.module)!;

function setup(initial?: Partial<AppState>) {
  const store = createStore({ filter: null, selected: null, natural: false, ...initial });
  return { store, actions: createActions({ data, store }) };
}

describe('filter change', () => {
  it('[APP-8] keeps the selected part only when it matches the new filter, and otherwise clears it', () => {
    const { store, actions } = setup({ selected: manual.id });

    actions.setFilter(manual.module);
    expect(store.get()).toMatchObject({ filter: manual.module, selected: manual.id });

    actions.setFilter(null);
    expect(store.get()).toMatchObject({ filter: null, selected: manual.id });

    actions.setFilter('estimate');
    expect(store.get()).toMatchObject({ filter: 'estimate', selected: null });

    actions.select(estimated.id);
    actions.setFilter('estimate');
    expect(store.get()).toMatchObject({ filter: 'estimate', selected: estimated.id });

    actions.setFilter(estimated.module);
    expect(store.get()).toMatchObject({ filter: estimated.module, selected: estimated.id });

    actions.setFilter(manual.module);
    expect(store.get()).toMatchObject({ filter: manual.module, selected: null });

    // With nothing selected, a filter change leaves nothing selected.
    actions.setFilter(null);
    expect(store.get()).toMatchObject({ filter: null, selected: null });
  });

  it('keeps the colour mode across a filter change', () => {
    const { store, actions } = setup({ natural: true, selected: part('C14_S1').id });
    actions.setFilter('C14');
    expect(store.get()).toEqual({ filter: 'C14', selected: 'C14_S1', natural: true });
  });
});

describe('pick from the viewer', () => {
  it('[APP-14] selects the part a tap hits, and a tap that hits nothing clears an existing selection', () => {
    const { store, actions } = setup();
    const states: AppState[] = [];
    store.subscribe(state => states.push(state));

    actions.pick(null);
    expect(states).toHaveLength(0);   // nothing selected: a miss changes nothing

    actions.pick(manual);
    expect(store.get().selected).toBe(manual.id);

    actions.pick(estimated);
    expect(store.get().selected).toBe(estimated.id);

    actions.pick(null);
    expect(store.get().selected).toBeNull();
  });
});
