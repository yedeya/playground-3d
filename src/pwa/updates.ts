// Registers the service worker and reports when a new version is ready ([PWA-2], [PWA-5]).
//
// A new version downloads in the background: the browser checks the worker when the app starts, and this module asks
// it to check again whenever the app comes back to the foreground, as an installed app on a phone mostly does. The new
// worker then waits (src/pwa/sw.ts never skips ahead by itself), so the running app keeps the version it started with,
// and `onReady` is told. The switch happens only on `activate`, which the `Refresh` button calls: the waiting worker
// takes over and the page reloads into the new version. Left alone, the waiting worker takes over at the app's next
// start, once every window of the old one has closed. Neither touches IndexedDB.
import { SW_SCOPE, SW_URL } from './routes';

/** What the page needs of the browser: `navigator.serviceWorker`, the document and `location.reload`. */
export interface UpdateEnvironment {
  serviceWorker: ServiceWorkerContainer;
  document: EventTarget & Pick<Document, 'visibilityState'>;
  reload(): void;
}

/** Called once a new version waits; `activate` switches to it. */
export type OnUpdateReady = (activate: () => void) => void;

/** The message Serwist's worker answers by taking over (`skipWaiting: false` in src/pwa/sw.ts). */
export const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

/** Registers the worker and watches for a new version; returns the function that stops watching. */
export function watchForUpdates(env: UpdateEnvironment, onReady: OnUpdateReady): () => void {
  const { serviceWorker: container, document } = env;
  let stopped = false;
  let switching = false;
  let registration: ServiceWorkerRegistration | null = null;
  const reported = new WeakSet<ServiceWorker>();
  const cleanups: (() => void)[] = [];

  const listen = <T extends EventTarget>(target: T, type: string, listener: () => void) => {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  };

  // Only a worker that replaces a running one is a new version: on the first visit, the first worker installs with no
  // page to update.
  const ready = (worker: ServiceWorker) => {
    if (stopped || !container.controller || reported.has(worker)) return;
    reported.add(worker);
    onReady(() => {
      switching = true;
      worker.postMessage(SKIP_WAITING);
    });
  };

  const track = (worker: ServiceWorker | null) => {
    if (!worker) return;
    if (worker.state === 'installed') return ready(worker);
    listen(worker, 'statechange', () => {
      if (worker.state === 'installed') ready(worker);
    });
  };

  // The worker that takes over is the new version only after a tap on `Refresh`; any other change of controller, such
  // as the first worker claiming the page, leaves the running app alone.
  listen(container, 'controllerchange', () => {
    if (switching && !stopped) env.reload();
  });

  listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') registration?.update().catch(() => {});
  });

  container.register(SW_URL, { scope: SW_SCOPE, type: 'classic', updateViaCache: 'none' }).then(
    reg => {
      if (stopped) return;
      registration = reg;
      if (reg.waiting) ready(reg.waiting);
      else track(reg.installing);
      listen(reg, 'updatefound', () => track(reg.installing));
    },
    (error: unknown) => console.error('The service worker did not register.', error),
  );

  return () => {
    stopped = true;
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}
