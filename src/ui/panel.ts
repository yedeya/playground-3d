// Bottom panel: card with the selected part, module chips, and the part list of the current filter.
import { MODULES, MODULE_ORDER, kindOf, kitText, matchesFilter, sizeText, toCssColor } from '../domain/parts.js';

function chip(html, key, onClick, className = 'chip') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.innerHTML = html;
  button.dataset.key = key;
  button.addEventListener('click', onClick);
  return button;
}

function cardHtml(state, parts, estimatedCount) {
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

export function createPanel({ data, store, actions }) {
  const { parts, moduleColors } = data;
  const modulesEl = document.getElementById('modules');
  const partsEl = document.getElementById('parts');
  const cardEl = document.getElementById('card');
  const estimatedCount = parts.filter(p => p.source === 'estimate').length;

  document.getElementById('stats').textContent =
    `${parts.length} onderdelen · ${MODULE_ORDER.length} modules · ${estimatedCount} geschat`;

  modulesEl.append(chip('<b>Alles</b>', 'all', () => actions.setFilter(null)));
  for (const code of MODULE_ORDER) {
    const n = parts.filter(p => p.module === code).length;
    const swatch = `<span class="tape" style="background:${toCssColor(moduleColors[code])}"></span>`;
    modulesEl.append(chip(`${swatch}<b>${code}</b> ${MODULES[code]} <i>${n}</i>`, code, () => actions.setFilter(code)));
  }
  modulesEl.append(chip(`<b>Geschat</b> <i>${estimatedCount}</i>`, 'estimate', () => actions.setFilter('estimate')));

  const colourButton = document.getElementById('colour');
  colourButton.addEventListener('click', () => store.set({ natural: !store.get().natural }));

  function render(state) {
    document.body.classList.toggle('natural', state.natural);
    colourButton.textContent = state.natural ? 'Modulekleur' : 'Houtkleur';
    for (const button of modulesEl.children) {
      button.setAttribute('aria-pressed', String((state.filter || 'all') === button.dataset.key));
    }
    partsEl.innerHTML = '';
    if (state.filter) {
      for (const part of parts.filter(p => matchesFilter(p, state.filter))) {
        const button = chip(part.id, part.id, () => actions.select(part.id === store.get().selected ? null : part.id), 'chip part');
        button.setAttribute('aria-pressed', String(state.selected === part.id));
        partsEl.append(button);
      }
      const active = partsEl.querySelector('[aria-pressed="true"]');
      if (active) partsEl.scrollLeft = active.offsetLeft - partsEl.offsetLeft - 40;
    }
    cardEl.innerHTML = cardHtml(state, parts, estimatedCount);
  }
  store.subscribe(render);
  render(store.get());
}
