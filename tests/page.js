// Test helper: puts the body of the real index.html into the jsdom document.
import html from '../index.html?raw';

export function loadPage() {
  const page = new DOMParser().parseFromString(html, 'text/html');
  document.body.className = '';
  document.body.innerHTML = page.body.innerHTML;
}
