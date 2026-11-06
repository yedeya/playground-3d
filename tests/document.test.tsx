// @vitest-environment jsdom
// The document Next.js serves, against the one the Vite app served from its index.html.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RootLayout, { metadata } from '../src/app/layout';
import Page from '../src/app/page';

// The <body> of the Vite app's index.html, as it was before the move, without its module script.
const VITE_BODY = `
<div id="stage">
  <canvas id="view" aria-label="3D-model van het speeltoestel. Tik op een onderdeel om de gegevens te zien, of kies het hieronder uit de lijst."></canvas>
  <div id="title"><h1>Wickey ArcticFlyer</h1><p id="stats"></p></div>
  <div id="tools">
    <button class="tool" id="reset" type="button">Beginstand</button>
    <button class="tool" id="colour" type="button">Houtkleur</button>
  </div>
  <div id="hint">Eén vinger draait, twee zoomen en schuiven. Raster 1 m.</div>
  <div id="fail" hidden>Het 3D-beeld kan hier niet laden. Laad de pagina opnieuw of probeer een andere browser. De onderdelenlijst hieronder werkt wel.</div>
</div>
<section id="panel" aria-label="Onderdelen">
  <div id="card" aria-live="polite"></div>
  <div class="row" id="modules" role="group" aria-label="Filter op module"></div>
  <div class="row" id="parts" role="group" aria-label="Onderdelen in deze selectie"></div>
</section>`;

const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap';

/** Drops the whitespace-only text nodes the hand-written HTML has between its elements and JSX has not. */
function trimmed<T extends Node>(node: T): T {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE && !child.textContent!.trim()) child.remove();
    else trimmed(child);
  }
  return node;
}

function served() {
  const html = renderToStaticMarkup(<RootLayout><Page /></RootLayout>);
  return new DOMParser().parseFromString(`<!DOCTYPE html>${html}`, 'text/html');
}

function vite() {
  return new DOMParser().parseFromString(`<!DOCTYPE html><html lang="nl"><body>${VITE_BODY}</body></html>`, 'text/html');
}

describe('the document', () => {
  it('[PLAT-4] is in Dutch, titled Speeltoestel ArcticFlyer 3D', () => {
    expect(served().documentElement.getAttribute('lang')).toBe('nl');
    expect(metadata.title).toBe('Speeltoestel ArcticFlyer 3D');
  });

  it('[PLAT-4] loads the Barlow and Barlow Condensed fonts, as the Vite page did', () => {
    const links = [...served().head.querySelectorAll('link')].map(l => ({
      rel: l.getAttribute('rel'), href: l.getAttribute('href'), crossorigin: l.getAttribute('crossorigin'),
    }));
    expect(links).toContainEqual({ rel: 'stylesheet', href: FONTS, crossorigin: null });
    expect(links).toContainEqual({ rel: 'preconnect', href: 'https://fonts.googleapis.com', crossorigin: null });
    expect(links).toContainEqual({ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' });
  });

  it('[PLAT-4] holds the Vite page\'s elements, with their Dutch texts and ARIA attributes unchanged', () => {
    const body = trimmed(served().body);
    const expected = trimmed(vite().body);
    expect(body.innerHTML).toBe(expected.innerHTML);
    for (const id of ['stage', 'view', 'title', 'stats', 'tools', 'reset', 'colour', 'hint', 'fail', 'panel', 'card', 'modules', 'parts']) {
      expect(body.querySelectorAll(`#${id}`), `#${id}`).toHaveLength(1);
    }
  });
});
