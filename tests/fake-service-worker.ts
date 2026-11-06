/// <reference types="node" />
// Runs the service worker the build serves, the bundle at /serwist/sw.js, in a stand-in for a browser's service worker
// scope: its own global, a Cache Storage held in memory, a network that records every request, and an `indexedDB`
// that records every touch. The tests then fire the events a browser would (install, activate, fetch, message) and
// read what the worker did.
import { createContext, runInContext } from 'node:vm';

export const ORIGIN = 'https://speeltoestel.test';

/** A request as the stand-in network saw it. */
export interface Fetched { method: string; url: string }

class MemoryCache {
  readonly entries = new Map<string, Response>();

  private key(request: RequestInfo | URL): string {
    const url = typeof request === 'string' || request instanceof URL ? String(request) : request.url;
    return new URL(url, ORIGIN).href;
  }

  async match(request: RequestInfo | URL, options?: CacheQueryOptions): Promise<Response | undefined> {
    const key = this.key(request);
    let found = this.entries.get(key);
    if (!found && options?.ignoreSearch) {
      const bare = key.split('?')[0];
      found = [...this.entries].find(([k]) => k.split('?')[0] === bare)?.[1];
    }
    return found?.clone();
  }

  async matchAll(): Promise<Response[]> {
    return [...this.entries.values()].map(r => r.clone());
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(this.key(request), response.clone());
  }

  async add(request: RequestInfo | URL): Promise<void> {
    throw new Error(`cache.add(${String(request)}) is not part of the stand-in`);
  }

  async addAll(): Promise<void> {
    throw new Error('cache.addAll is not part of the stand-in');
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(this.key(request));
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map(url => new Request(url));
  }
}

class MemoryCacheStorage {
  readonly caches = new Map<string, MemoryCache>();

  async open(name: string): Promise<MemoryCache> {
    if (!this.caches.has(name)) this.caches.set(name, new MemoryCache());
    return this.caches.get(name)!;
  }

  async has(name: string): Promise<boolean> {
    return this.caches.has(name);
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async match(request: RequestInfo | URL, options?: CacheQueryOptions): Promise<Response | undefined> {
    for (const cache of this.caches.values()) {
      const found = await cache.match(request, options);
      if (found) return found;
    }
    return undefined;
  }
}

type Listener = (event: unknown) => void;

// The event classes the worker checks its events against.
class ExtendableEvent {
  readonly waits: Promise<unknown>[] = [];
  constructor(readonly type: string, init: Record<string, unknown> = {}) {
    Object.assign(this, init);
  }
  waitUntil(promise: Promise<unknown>): void {
    this.waits.push(promise);
  }
}

class ExtendableMessageEvent extends ExtendableEvent {}

class FetchEvent extends ExtendableEvent {
  declare readonly request: Request;
  answer: Promise<Response> | undefined;
  readonly clientId = '';
  readonly resultingClientId = '';
  readonly preloadResponse = Promise.resolve(undefined);
  respondWith(response: Promise<Response> | Response): void {
    if (this.answer) throw new Error('respondWith was called twice');
    this.answer = Promise.resolve(response);
  }
}

/** The worker, running, with what it has done so far. */
export interface RunningWorker {
  caches: MemoryCacheStorage;
  /** Every request the worker sent to the network, in order. */
  fetched: Fetched[];
  /** Every property of `indexedDB` the worker read. */
  indexedDbTouches: string[];
  skipWaitingCalls: number;
  /** Fires an extendable event (install, activate, message) and waits for what it asked to wait for. */
  fire(type: 'install' | 'activate' | 'message', init?: Record<string, unknown>): Promise<void>;
  /** Fires a fetch event; resolves to the worker's answer, or to `undefined` when it left the request to the browser. */
  fetch(request: Request): Promise<Response | undefined>;
  /** The URLs held in Cache Storage, with the revision parameter Serwist adds left out. */
  cachedUrls(): Promise<string[]>;
}

/** The network the stand-in answers with: 200 and a body naming the URL, unless `respond` says otherwise. */
export type Network = (request: Request) => Response | Promise<Response>;

const defaultNetwork: Network = request => new Response(`network: ${request.method} ${request.url}`, { status: 200 });

/** Evaluates the worker's script in a fresh service worker scope. */
export function runWorker(script: string, network: Network = defaultNetwork): RunningWorker {
  const listeners = new Map<string, Listener[]>();
  const fetched: Fetched[] = [];
  const indexedDbTouches: string[] = [];
  const caches = new MemoryCacheStorage();
  let skipWaitingCalls = 0;

  const indexedDB = new Proxy({}, {
    get(_, property) {
      indexedDbTouches.push(String(property));
      return undefined;
    },
  });

  const scope: Record<string, unknown> = {
    console, setTimeout, clearTimeout, queueMicrotask, structuredClone,
    Request, Response, Headers, URL, URLSearchParams, AbortController, AbortSignal, Blob,
    ReadableStream, TextEncoder, TextDecoder, DOMException, crypto, Event, EventTarget,
    ExtendableEvent, ExtendableMessageEvent, FetchEvent,
    caches,
    indexedDB,
    location: new URL(`${ORIGIN}/serwist/sw.js`),
    registration: {
      scope: `${ORIGIN}/`,
      navigationPreload: { enable: async () => {}, disable: async () => {} },
    },
    clients: { claim: async () => {}, matchAll: async () => [], get: async () => undefined },
    skipWaiting: async () => {
      skipWaitingCalls++;
    },
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input instanceof Request ? input : new URL(String(input), ORIGIN), init);
      fetched.push({ method: request.method, url: request.url });
      return network(request);
    },
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter(l => l !== listener));
    },
  };
  scope.self = scope;
  scope.globalThis = scope;
  const context = createContext(scope);
  runInContext(script, context, { filename: 'sw.js' });

  const dispatch = async (event: ExtendableEvent) => {
    for (const listener of listeners.get(event.type) ?? []) listener(event);
    await Promise.all(event.waits);
  };

  return {
    caches,
    fetched,
    indexedDbTouches,
    get skipWaitingCalls() {
      return skipWaitingCalls;
    },
    async fire(type, init = {}) {
      await dispatch(type === 'message' ? new ExtendableMessageEvent(type, init) : new ExtendableEvent(type, init));
    },
    async fetch(request) {
      const event = new FetchEvent('fetch', { request });
      const done = dispatch(event);
      const response = await event.answer;
      await done;
      return response;
    },
    async cachedUrls() {
      const urls: string[] = [];
      for (const cache of caches.caches.values()) {
        for (const key of cache.entries.keys()) {
          const url = new URL(key);
          url.searchParams.delete('__WB_REVISION__');
          urls.push(url.href);
        }
      }
      return urls;
    },
  };
}
