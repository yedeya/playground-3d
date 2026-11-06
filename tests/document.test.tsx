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

  // The Barlow fonts themselves, and that the build serves them from the app's own origin, are checked on the build
  // (tests/offline.test.ts, [PLAT-4] and [PWA-3]).
  it('[PWA-3] links nothing on another origin from the head, as the Vite page did with Google\'s fonts', () => {
    const urls = [...served().head.querySelectorAll('[href], [src]')].map(e => e.getAttribute('href') ?? e.getAttribute('src')!);
    for (const url of urls) expect(new URL(url, 'https://app.test').origin, url).toBe('https://app.test');
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
