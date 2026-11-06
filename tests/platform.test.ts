/// <reference types="node" />
// The language and the framework the repository is built with. These read the checkout itself, so they need git and the
// installed TypeScript and Next.js.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { blockCrossSiteDEV } from 'next/dist/server/lib/router-utils/block-cross-site-dev';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (file: string, args: string[]) => execFileSync(file, args, { cwd: root, encoding: 'utf8' });
const readJson = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

describe('language', () => {
  it('[PLAT-1] tracks no JavaScript source', () => {
    expect(run('git', ['ls-files', '*.js', '*.jsx', '*.mjs', '*.cjs'])).toBe('');
  });

  it('[PLAT-2] sets strict in tsconfig.json, and npm run typecheck runs tsc --noEmit, which exits 0', () => {
    expect(readJson('tsconfig.json').compilerOptions.strict).toBe(true);
    expect(readJson('package.json').scripts.typecheck).toBe('tsc --noEmit');
    // execFileSync throws, with tsc's report, when tsc exits non-zero.
    run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
  }, 60_000);
});

describe('framework', () => {
  const pkg = readJson('package.json');

  it('[PLAT-3] lists neither vite nor @vitejs/* in package.json, and tracks no Vite configuration file', () => {
    const listed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies });
    expect(listed.filter(name => name === 'vite' || name.startsWith('@vitejs/'))).toEqual([]);
    expect(run('git', ['ls-files', 'vite.config.*', '**/vite.config.*'])).toBe('');
  });

  it('[PLAT-3] is a Next.js App Router app: next is a dependency, src/app holds the root layout and the page, and build runs next build', () => {
    expect(pkg.dependencies.next).toBeDefined();
    expect(existsSync(new URL('../src/app/layout.tsx', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../src/app/page.tsx', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../src/pages', import.meta.url))).toBe(false);
    expect(pkg.scripts.build).toBe('next build');
  });

  it('[PLAT-3] serves npm run dev on every network interface, so a phone on the same network can open it', () => {
    expect(pkg.scripts.dev).toBe('next dev --hostname 0.0.0.0');
    // Next.js's dev server refuses its dev resources, the app's scripts included, to a page on a host it does not
    // allow. This is the check it runs on each such request, with the hostname the dev script passes.
    const blocked = (host: string) => blockCrossSiteDEV(
      { url: '/_next/hmr', headers: { origin: `http://${host}:3000` } } as unknown as IncomingMessage,
      { statusCode: 200, end() {} } as unknown as ServerResponse,
      nextConfig.allowedDevOrigins,
      '0.0.0.0',
    );
    for (const host of ['localhost', '192.168.1.23', '10.0.0.5', '172.16.4.2', '172.31.255.1', 'laptop.local']) {
      expect(blocked(host), host).toBe(false);
    }
    for (const host of ['example.com', '8.8.8.8', '172.32.0.1', '192.169.1.1']) {
      expect(blocked(host), host).toBe(true);
    }
  });
});
