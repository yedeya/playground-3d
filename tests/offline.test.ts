/// <reference types="node" />
// The offline app as the production build serves it (docs/qa/specs/offline.md). This file builds the app with
// `next build`, in a copy under .pwa-build/ so the checkout's own .next/ is left alone, and reads what the build wrote:
// the page, its stylesheets, the manifest and the service worker with its precache list. It runs that worker in a
// stand-in service worker scope (tests/fake-service-worker.ts), and serves the build with `next start` to read the
// headers. The installed app opening in airplane mode on a real phone is Issue H's check, not this file's.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MODEL_URL } from '../src/data/load-model';
import { APPLE_TOUCH_ICON } from '../src/pwa/app-manifest';
import { SW_URL } from '../src/pwa/routes';
import { ORIGIN, runWorker, type Network } from './fake-service-worker';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = join(root, '.pwa-build');
const next = join(root, 'node_modules/next/dist/bin/next');
const built = (path: string) => join(app, '.next', path);
const read = (path: string) => readFileSync(path, 'utf8');

/** What `next build` needs of the checkout. */
const SOURCES = ['src', 'public', 'package.json', 'next.config.ts', 'tsconfig.json'];

beforeAll(() => {
  rmSync(app, { recursive: true, force: true });
  mkdirSync(app);
  for (const source of SOURCES) cpSync(join(root, source), join(app, source), { recursive: true });
  execFileSync(process.execPath, [next, 'build'], {
    cwd: app,
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'pipe',
  });
}, 300_000);

// --- What the build wrote ---------------------------------------------------------------------------------------

const page = () => read(built('server/app/index.html'));
const workerScript = () => read(built(`server/app${SW_URL}.body`));
const manifest = () => JSON.parse(read(built('server/app/manifest.webmanifest.body')));

/** The values of an attribute on the page's tags, such as every `src`. */
const attributes = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<[a-z]+\\b[^>]*\\s${name}="([^"]*)"`, 'g'))].map(m => m[1]!);

/** The page's tags of one kind, each as its attributes. */
const tags = (html: string, tag: string) =>
  [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))].map(m =>
    Object.fromEntries([...m[1]!.matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)].map(a => [a[1]!.toLowerCase(), a[2] ?? ''])));

const stylesheets = () => tags(page(), 'link').filter(l => l.rel === 'stylesheet').map(l => l.href!);
const scripts = () => tags(page(), 'script').map(s => s.src).filter((src): src is string => !!src);

/** A file the build serves, by its URL path: /_next/static/ from the build, anything else from public/. */
function servedFile(path: string): string {
  if (path.startsWith('/_next/static/')) return built(`static/${path.slice('/_next/static/'.length)}`);
  return join(app, 'public', path);
}

/** Every url() in a stylesheet, as the URL path it resolves to on the app's origin. */
function cssUrls(href: string): URL[] {
  const css = read(servedFile(href));
  return [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => new URL(m[1]!, new URL(href, ORIGIN)));
}

/** The fonts the stylesheets declare: family, weight and the woff2 file. */
function fontFaces() {
  return stylesheets().flatMap(href => [...read(servedFile(href)).matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
    const block = m[1]!;
    const family = /font-family:\s*["']?([^;"']+)["']?/.exec(block)![1]!;
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)![1]);
    const woff2 = /url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/.exec(block)?.[1];
    return { family, weight, woff2: woff2 ? new URL(woff2, new URL(href, ORIGIN)) : undefined };
  }));
}

/** Every file the build put under .next/static, as its URL path. */
function staticFiles(): string[] {
  const dir = built('static');
  const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]);
  return walk(dir).map(file => `/_next/static/${relative(dir, file).split('\\').join('/')}`);
}

/** The PNG's width and height, from its header. */
function pngSize(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString('latin1'), path).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A custom property of src/styles.css's :root. */
function cssVariable(name: string) {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(read(join(root, 'src/styles.css')))![1]!.trim();
}

/** The stand-in network serves the build's own files, as the deployed site would, and answers /api/ itself. */
const servedByBuild: Network = request => {
  const { pathname } = new URL(request.url);
  if (pathname === '/api' || pathname.startsWith('/api/')) return new Response(`network: ${request.method} ${request.url}`);
  const file = pathname === '/' ? built('server/app/index.html') : servedFile(pathname);
  if (!existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(readFileSync(file), { status: 200 });
};

const offline: Network = () => {
  throw new TypeError('Failed to fetch: the network is down');
};

/** The built worker, installed and activated with the build's files, as after one visit online. */
async function installedWorker(network: Network = servedByBuild) {
  let current = network;
  const worker = runWorker(workerScript(), request => current(request));
  await worker.fire('install');
  await worker.fire('activate');
  return { worker, setNetwork: (to: Network) => { current = to; } };
}

/** Everything the page needs to start, as URL paths: the page, its scripts, stylesheets and fonts, the model, the icons. */
function pageNeeds(): string[] {
  const fonts = stylesheets().flatMap(cssUrls).filter(url => url.pathname.endsWith('.woff2')).map(url => url.pathname);
  const icons = [...manifest().icons.map((icon: { src: string }) => icon.src), APPLE_TOUCH_ICON.src];
  return ['/', ...scripts(), ...stylesheets(), ...fonts, MODEL_URL, ...icons];
}

// --- The clauses --------------------------------------------------------------------------------------------------

describe('installing', () => {
  it('[PWA-1] serves a manifest named Speeltoestel ArcticFlyer 3D, short name Speeltoestel, lang nl, standalone, starting at /', () => {
    expect(manifest()).toMatchObject({
      name: 'Speeltoestel ArcticFlyer 3D',
      short_name: 'Speeltoestel',
      lang: 'nl',
      display: 'standalone',
      start_url: '/',
    });
  });

  it('[PWA-1] takes the manifest\'s theme and background colours from the app\'s stylesheet', () => {
    expect(manifest().theme_color).toBe(cssVariable('accent'));
    expect(manifest().background_color).toBe(cssVariable('sky'));
  });

  it('[PWA-1] lists PNG icons of 192 px and 512 px and a maskable one of 512 px, each the size it says', () => {
    const icons: { src: string; sizes: string; type: string; purpose?: string }[] = manifest().icons;
    const listed = icons.map(icon => `${icon.sizes} ${icon.purpose ?? 'any'}`);
    expect(listed).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(pngSize(join(app, 'public', icon.src)), icon.src).toEqual({ width, height });
    }
  });

  it('[PWA-1] links the manifest and a 180 px apple-touch-icon from the page', () => {
    const links = tags(page(), 'link');
    expect(links).toContainEqual(expect.objectContaining({ rel: 'manifest', href: '/manifest.webmanifest' }));
    const apple = links.find(link => link.rel === 'apple-touch-icon');
    expect(apple).toMatchObject({ sizes: '180x180' });
    expect(pngSize(join(app, 'public', apple!.href!))).toEqual({ width: 180, height: 180 });
  });
});

describe('opening offline', () => {
  it('[PWA-2] precaches on install the page, its scripts, stylesheets and fonts, the model and the icons', async () => {
    const { worker } = await installedWorker();
    const cached = (await worker.cachedUrls()).map(url => new URL(url).pathname);
    expect(scripts().length).toBeGreaterThan(0);
    expect(stylesheets().length).toBeGreaterThan(0);
    for (const needed of pageNeeds()) expect(cached, needed).toContain(needed);
    // The scripts the page loads later, such as its lazy chunks, are in the build's static files.
    for (const file of staticFiles().filter(f => /\.(js|css|woff2)$/.test(f))) expect(cached, file).toContain(file);
  });

  it('[PWA-2] answers everything the page needs to start from its cache when the network is down', async () => {
    const { worker, setNetwork } = await installedWorker();
    setNetwork(offline);
    for (const needed of pageNeeds()) {
      const answer = await worker.fetch(new Request(new URL(needed, ORIGIN)));
      expect(answer?.status, needed).toBe(200);
      const expected = needed === '/' ? readFileSync(built('server/app/index.html')) : readFileSync(servedFile(needed));
      expect(Buffer.from(await answer!.arrayBuffer()).equals(expected), needed).toBe(true);
    }
  });
});

describe('nothing from another origin', () => {
  const sameOrigin = (url: string, base = ORIGIN) => new URL(url, base).origin === ORIGIN;

  it('[PWA-3] the page loads, links and styles nothing from another origin', () => {
    const html = page();
    for (const name of ['src', 'href', 'srcset', 'poster', 'data', 'action']) {
      for (const value of attributes(html, name)) expect(sameOrigin(value), `${name}="${value}"`).toBe(true);
    }
    for (const href of stylesheets()) {
      const css = read(servedFile(href));
      expect(css, href).not.toMatch(/@import/);
      for (const url of cssUrls(href)) expect(url.origin, url.href).toBe(ORIGIN);
    }
  });

  it('[PWA-3] the service worker stores only files of the app\'s own origin', async () => {
    const { worker } = await installedWorker();
    expect(worker.fetched.length).toBeGreaterThan(0);
    for (const { url } of worker.fetched) expect(new URL(url).origin, url).toBe(ORIGIN);
  });

  it('[PLAT-4] [PWA-3] serves Barlow and Barlow Condensed in the weights the page uses, from the app\'s own origin', () => {
    const faces = fontFaces();
    const declared = faces.map(f => `${f.family} ${f.weight}`);
    for (const weight of [400, 500, 600]) expect(declared).toContain(`Barlow ${weight}`);
    for (const weight of [500, 600, 700]) expect(declared).toContain(`Barlow Condensed ${weight}`);
    for (const face of faces) {
      expect(face.woff2?.origin, `${face.family} ${face.weight}`).toBe(ORIGIN);
      expect(existsSync(servedFile(face.woff2!.pathname)), face.woff2!.pathname).toBe(true);
    }
  });
});

describe('the API', () => {
  const api = ['/api/sync', '/api/sync?since=3', '/api/', '/api'];

  it('[PWA-4] precaches nothing under /api/', () => {
    const listed = [...workerScript().matchAll(/url:"([^"]*)"/g)].map(m => m[1]!);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter(url => url === '/api' || url.startsWith('/api/'))).toEqual([]);
  });

  it('[PWA-4] sends every /api/ request to the network, even one a cache holds, and stores none of the answers', async () => {
    const { worker } = await installedWorker();
    // A stale answer under /api/, as if anything had ever stored one: the worker must not answer with it.
    const cache = await worker.caches.open('stale');
    for (const path of api) await cache.put(new URL(path, ORIGIN).href, new Response('from a cache'));

    for (const method of ['GET', 'POST']) {
      for (const path of api) {
        const url = new URL(path, ORIGIN).href;
        const request = new Request(url, method === 'POST' ? { method, body: '{}' } : { method });
        const before = worker.fetched.length;
        const answer = await worker.fetch(request);
        // The worker either answers with the network's response or leaves the request to the browser's network.
        if (answer) {
          expect(await answer.text(), `${method} ${path}`).toBe(`network: ${method} ${url}`);
          expect(worker.fetched.slice(before), `${method} ${path}`).toEqual([{ method, url }]);
        }
      }
    }
    await worker.caches.delete('stale');
    expect((await worker.cachedUrls()).filter(url => new URL(url).pathname.startsWith('/api'))).toEqual([]);
  });

  it('[PWA-4] never answers an /api/ request from a cache when the network is down', async () => {
    const { worker, setNetwork } = await installedWorker();
    const cache = await worker.caches.open('stale');
    await cache.put(new URL('/api/sync', ORIGIN).href, new Response('from a cache'));
    setNetwork(offline);
    const answer = worker.fetch(new Request(new URL('/api/sync', ORIGIN)));
    // Either the worker passes the failure on, or it leaves the request to the browser, which fails it.
    const settled = await answer.then(response => response, (error: unknown) => error);
    expect(settled instanceof Response ? await settled.text() : 'network failure').toBe('network failure');
  });
});

describe('updating', () => {
  it('[PWA-5] a new worker waits after it installs, and takes over only when the page asks it to', async () => {
    const worker = runWorker(workerScript(), servedByBuild);
    await worker.fire('install');
    await worker.fire('activate');
    expect(worker.skipWaitingCalls).toBe(0);
    await worker.fire('message', { data: { type: 'SOMETHING_ELSE' } });
    expect(worker.skipWaitingCalls).toBe(0);
    await worker.fire('message', { data: { type: 'SKIP_WAITING' } });
    expect(worker.skipWaitingCalls).toBe(1);
  });

  it('[PWA-5] leaves IndexedDB untouched while it installs, takes over and answers requests', async () => {
    const { worker } = await installedWorker();
    await worker.fire('message', { data: { type: 'SKIP_WAITING' } });
    await worker.fetch(new Request(new URL('/', ORIGIN)));
    await worker.fetch(new Request(new URL('/api/sync', ORIGIN)));
    expect(worker.indexedDbTouches).toEqual([]);
  });
});

describe('serving', () => {
  let server: ChildProcess | undefined;
  let base = '';

  const freePort = () => new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

  beforeAll(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [next, 'start', '-p', String(port), '-H', '127.0.0.1'], {
      cwd: app,
      env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'ignore',
    });
    for (let tries = 0; ; tries++) {
      try {
        await fetch(`${base}/manifest.webmanifest`);
        return;
      } catch (error) {
        if (tries > 150) throw error;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }, 60_000);

  afterAll(() => {
    server?.kill();
  });

  it('[PWA-6] serves the service worker script and the manifest with Cache-Control: no-cache', async () => {
    for (const path of [SW_URL, '/manifest.webmanifest']) {
      const response = await fetch(`${base}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('cache-control'), path).toBe('no-cache');
    }
  });

  it('[PWA-2] serves the service worker as a script that may control the scope /', async () => {
    const response = await fetch(`${base}${SW_URL}`);
    expect(response.headers.get('content-type')).toMatch(/javascript/);
    expect(response.headers.get('service-worker-allowed')).toBe('/');
  });
});
