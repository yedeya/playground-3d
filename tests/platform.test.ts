/// <reference types="node" />
// The language the repository is written in. These read the checkout itself, so they need git and the installed TypeScript.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
