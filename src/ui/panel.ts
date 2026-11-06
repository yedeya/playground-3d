// Bottom panel: card with the selected part, module chips, and the part list of the current filter.
import type { ModuleCode, Part, Rgb } from '../domain/model';
import { MODULES, MODULE_ORDER, kindOf, kitText, matchesFilter, sizeText, toCssColor } from '../domain/parts';
import type { Actions } from '../actions';
import type { AppState, Store } from '../store';
import { byId } from './dom';

/** The fields of a part the panel shows. */
export type PanelPart = Pick<Part, 'id' | 'module' | 'group' | 'kit' | 'size' | 'source'>;

/** The model data the panel reads. */
export interface PanelData {
  parts: readonly PanelPart[];
  moduleColors: Readonly<Record<ModuleCode, Rgb>>;
}

function chip(html: string, key: string, onClick: () => void, className = 'chip'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.innerHTML = html;
  button.dataset.key = key;
  button.addEventListener('click', onClick);
  return button;
}

function cardHtml(state: AppState, parts: readonly PanelPart[], estimatedCount: number): string {
  const part = parts.find(p => p.id === state.selected);
  if (part) {
    const size = sizeText(part.size);
    const source = part.source === 'manual'
      ? '<span class="badge manual">Uit handleiding</span>'
      : '<span class="badge estimate">Geschat</span>';
    return `<h2>${part.id} <span class="kind">${kindOf(part)}</span></h2>
      <dl><dt>Module</dt><dd>${part.module} ${MODULES[part.module]}</dd>
      <dt>Handleiding</dt><dd>${kitText(part.kit)}</dd>
      ${size ? `<dt>Maat</dt><dd>${size}</dd>` : ''}
      <dt>Bron</dt><dd>${source}</dd></dl>`;
  }
  if (state.filter === 'estimate') {
    return `<h2>${estimatedCount} geschatte onderdelen</h2><p>De vorm of plek hiervan staat niet exact in de handleiding. Controleer deze op het echte toestel.</p>`;
  }
  if (state.filter) {
    const n = parts.filter(p => p.module === state.filter).length;
    return `<h2>${state.filter} ${MODULES[state.filter]}</h2><p>${n} ${n === 1 ? 'onderdeel' : 'onderdelen'}. Tik op een onderdeel in het model of kies het uit de lijst.</p>`;
  }
  return '<h2>Tik op een onderdeel</h2><p>Je ziet dan de code, module, maat en bron. Kies een module om alleen die delen te tonen. Schroeven, stuurwiel, telescoop en rompdoeken staan niet in dit model.</p>';
}

export interface Panel {
  /** Unsubscribes from the store, removes the panel's listeners and chips, and gives the page back its rendered texts. */
  dispose(): void;
}

export function createPanel({ data, store, actions }: { data: PanelData; store: Store; actions: Actions }): Panel {
  const { parts, moduleColors } = data;
  const modulesEl = byId('modules', HTMLElement);
  const partsEl = byId('parts', HTMLElement);
  const cardEl = byId('card', HTMLElement);
  const estimatedCount = parts.filter(p => p.source === 'estimate').length;

  const statsEl = byId('stats', HTMLElement);
  const colourButton = byId('colour', HTMLButtonElement);
  // What the page held before the panel filled it in, for dispose to put back.
  const rendered = { stats: statsEl.textContent, card: cardEl.innerHTML, colour: colourButton.textContent };

  statsEl.textContent =
    `${parts.length} onderdelen · ${MODULE_ORDER.length} modules · ${estimatedCount} geschat`;

  const moduleChips = [chip('<b>Alles</b>', 'all', () => actions.setFilter(null))];
  for (const code of MODULE_ORDER) {
    const n = parts.filter(p => p.module === code).length;
    const swatch = `<span class="tape" style="background:${toCssColor(moduleColors[code])}"></span>`;
    moduleChips.push(chip(`${swatch}<b>${code}</b> ${MODULES[code]} <i>${n}</i>`, code, () => actions.setFilter(code)));
  }
  moduleChips.push(chip(`<b>Geschat</b> <i>${estimatedCount}</i>`, 'estimate', () => actions.setFilter('estimate')));
  modulesEl.append(...moduleChips);

  const toggleColours = () => store.set({ natural: !store.get().natural });
  colourButton.addEventListener('click', toggleColours);

  function render(state: AppState) {
    document.body.classList.toggle('natural', state.natural);
    colourButton.textContent = state.natural ? 'Modulekleur' : 'Houtkleur';
    for (const button of moduleChips) {
      button.setAttribute('aria-pressed', String((state.filter || 'all') === button.dataset.key));
    }
    partsEl.innerHTML = '';
    if (state.filter) {
      for (const part of parts.filter(p => matchesFilter(p, state.filter))) {
        const button = chip(part.id, part.id, () => actions.select(part.id === store.get().selected ? null : part.id), 'chip part');
        button.setAttribute('aria-pressed', String(state.selected === part.id));
        partsEl.append(button);
      }
      const active = partsEl.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (active) partsEl.scrollLeft = active.offsetLeft - partsEl.offsetLeft - 40;
    }
    cardEl.innerHTML = cardHtml(state, parts, estimatedCount);
  }
  const unsubscribe = store.subscribe(render);
  render(store.get());

  return {
    dispose() {
      unsubscribe();
      colourButton.removeEventListener('click', toggleColours);
      for (const button of moduleChips) button.remove();
      partsEl.replaceChildren();
      cardEl.innerHTML = rendered.card;
      statsEl.textContent = rendered.stats;
      colourButton.textContent = rendered.colour;
      document.body.classList.remove('natural');
    },
  };
}
