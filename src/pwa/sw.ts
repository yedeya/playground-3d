/// <reference lib="webworker" />
// The service worker ([PWA-2], [PWA-4], [PWA-5]). The Serwist route (src/app/serwist/[path]/route.ts) bundles this
// file with esbuild at `next build` and fills `self.__SW_MANIFEST` with the precache list: the page, its scripts,
// stylesheets and fonts, the model GLB and the icons. Everything the page needs to start is stored on install, so after
// one visit online the app opens with no network.
//
// Updates wait: a new worker installs in the background and then waits, never skipping ahead by itself, so the running
// app keeps the version it started with. It takes over when the page posts `SKIP_WAITING` (the `Refresh` button, see
// src/pwa/updates.ts) or when every window of the app has closed, which is the app's next start. Nothing here opens
// IndexedDB: an update replaces cached files only.
import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';
import { isApiRequest } from './routes';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  // The one runtime route: /api/ always goes to the network and its answers are never stored ([PWA-4]). Any other
  // request the precache does not hold goes to the network untouched.
  runtimeCaching: [{ matcher: ({ url, sameOrigin }) => sameOrigin && isApiRequest(url), handler: new NetworkOnly() }],
});

serwist.addEventListeners();
