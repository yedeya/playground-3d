// @vitest-environment jsdom
// The page's side of the offline app: registering the service worker and switching to a new version only on a tap
// ([PWA-2], [PWA-5]). jsdom has no service workers, so this file stands in a container, a registration and workers
// that the tests move through their states as a browser would.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_VERSION_TEXT, REFRESH_TEXT } from '../src/app/update-notice';
import { SW_URL } from '../src/pwa/routes';
import { SKIP_WAITING, watchForUpdates, type UpdateEnvironment } from '../src/pwa/updates';
import { stubModelFetch } from './model-glb';
import Page from '../src/app/page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeWorker extends EventTarget {
  readonly messages: unknown[] = [];
  constructor(public state: ServiceWorkerState) {
    super();
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  moveTo(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  updates = 0;
  async update() {
    this.updates++;
    return this;
  }
  /** A new worker starts installing, as after the browser found a changed script. */
  find(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
  }
}

class FakeContainer extends EventTarget {
  readonly registered: [string, RegistrationOptions | undefined][] = [];
  constructor(public controller: object | null, readonly registration = new FakeRegistration()) {
    super();
  }
  async register(url: string, options?: RegistrationOptions) {
    this.registered.push([url, options]);
    return this.registration;
  }
  /** The waiting worker takes over the page. */
  takeOver() {
    this.controller = {};
    this.dispatchEvent(new Event('controllerchange'));
  }
}

function environment(container: FakeContainer) {
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const reload = vi.fn();
  const env = { serviceWorker: container as unknown as ServiceWorkerContainer, document: page, reload } satisfies UpdateEnvironment;
  return { env, page, reload };
}

/** Lets the registration's promise settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('watchForUpdates', () => {
  it('[PWA-2] registers the service worker the build serves, with the scope /', async () => {
    const container = new FakeContainer(null);
    const stop = watchForUpdates(environment(container).env, () => {});
    await settle();
    expect(container.registered).toEqual([[SW_URL, expect.objectContaining({ scope: '/' })]]);
    stop();
  });

  it('[PWA-5] reports nothing for the first worker, which installs with no running version to replace', async () => {
    const container = new FakeContainer(null);
    const onReady = vi.fn();
    watchForUpdates(environment(container).env, onReady);
    await settle();
    const first = new FakeWorker('installing');
    container.registration.find(first);
    first.moveTo('installed');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('[PWA-5] reports a new version once it has downloaded and waits, and the running app keeps its version until then', async () => {
    const container = new FakeContainer({});
    const { env, reload } = environment(container);
    const onReady = vi.fn();
    watchForUpdates(env, onReady);
    await settle();
    const next = new FakeWorker('installing');
    container.registration.find(next);
    expect(onReady).not.toHaveBeenCalled();
    next.moveTo('installed');
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(next.messages).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('[PWA-5] reports a version that was already waiting when the app started', async () => {
    const container = new FakeContainer({});
    container.registration.waiting = new FakeWorker('installed');
    const onReady = vi.fn();
    watchForUpdates(environment(container).env, onReady);
    await settle();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('[PWA-5] switches on the tap: the waiting worker is told to take over, and the page reloads when it has', async () => {
    const container = new FakeContainer({});
    container.registration.waiting = new FakeWorker('installed');
    const { env, reload } = environment(container);
    let activate = () => {};
    watchForUpdates(env, next => { activate = next; });
    await settle();
    activate();
    expect(container.registration.waiting.messages).toEqual([SKIP_WAITING]);
    expect(reload).not.toHaveBeenCalled();
    container.takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('[PWA-5] never switches by itself: a worker taking over without a tap leaves the running app alone', async () => {
    const container = new FakeContainer({});
    container.registration.waiting = new FakeWorker('installed');
    const { env, reload } = environment(container);
    watchForUpdates(env, () => {});
    await settle();
    container.takeOver();
    expect(reload).not.toHaveBeenCalled();
  });

  it('[PWA-5] looks for a new version in the background whenever the app comes back to the foreground', async () => {
    const container = new FakeContainer({});
    const { env, page } = environment(container);
    const stop = watchForUpdates(env, () => {});
    await settle();
    page.dispatchEvent(new Event('visibilitychange'));
    expect(container.registration.updates).toBe(1);
    stop();
    page.dispatchEvent(new Event('visibilitychange'));
    expect(container.registration.updates).toBe(1);
  });
});

describe('the update notice', () => {
  let root: Root;
  let container: FakeContainer;

  beforeEach(() => {
    stubModelFetch();
    container = new FakeContainer({});
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<main></main>';
    root = createRoot(document.querySelector('main')!);
  });

  afterEach(() => {
    act(() => root.unmount());
    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const notice = () => document.querySelector<HTMLElement>('#update');

  it('[PWA-2] [PWA-5] is on the page: the page registers the worker, and shows New version with Refresh only once one waits', async () => {
    await act(async () => {
      root.render(<Page />);
      await settle();
    });
    expect(container.registered.map(([url, options]) => [url, options?.scope])).toEqual([[SW_URL, '/']]);
    expect(notice()).toBeNull();

    const next = new FakeWorker('installing');
    await act(async () => {
      container.registration.find(next);
      next.moveTo('installed');
    });
    expect(notice()!.getAttribute('role')).toBe('status');
    expect(notice()!.querySelector('span')!.textContent).toBe(NEW_VERSION_TEXT);
    expect(NEW_VERSION_TEXT).toBe('New version');
    const button = notice()!.querySelector('button')!;
    expect(button.textContent).toBe(REFRESH_TEXT);
    expect(REFRESH_TEXT).toBe('Refresh');
    expect(button.getAttribute('type')).toBe('button');

    await act(async () => button.click());
    expect(next.messages).toEqual([SKIP_WAITING]);
  });
});
