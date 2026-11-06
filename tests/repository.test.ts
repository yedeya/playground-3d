import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The names `[MODEL-12]` keeps out of the docs: the language, the scene format and the two Mac tools. */
const RETIRED = [/python/i, /usda/i, /usdzip/i, /render3/i];

describe('the retired Python generator and Swift render tool', () => {
  it('[MODEL-12] the repository tracks no Python or Swift, and package.json, the README and the handover name none of it', () => {
    const tracked = execFileSync('git', ['ls-files', '*.py', '*.swift'], { cwd: ROOT, encoding: 'utf8' });
    expect(tracked.split('\n').filter(Boolean)).toEqual([]);

    const named: string[] = [];
    for (const file of ['package.json', 'README.md', 'docs/HANDOVER.md']) {
      readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((line, n) => {
        for (const word of RETIRED) if (word.test(line)) named.push(`${file}:${n + 1} ${word}: ${line.trim()}`);
      });
    }
    expect(named).toEqual([]);
  });
});
