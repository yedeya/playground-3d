// Test helper: puts the markup the app's route renders into the jsdom document, as the server sends it.
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../src/app/page';

export function loadPage() {
  document.body.className = '';
  document.body.innerHTML = renderToStaticMarkup(<Page />);
}
