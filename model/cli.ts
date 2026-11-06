// `npm run model`: builds the model and writes the GLB; with --baseline, also the baseline fixture ([MODEL-1]).
// Node runs this file directly, stripping the types, so it needs nothing outside the repository's npm dependencies.
//
//   node model/cli.ts [--baseline] [--root DIR]
//
// --root writes under DIR instead of the repository root, for the tests.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './generator.ts';
import { GLB_PATH, toGlb } from './glb.ts';

/** The baseline fixture `[MODEL-2]` checks the generator against, relative to the repository root. */
export const BASELINE_PATH = 'tests/fixtures/model-baseline.json';

function main(args: string[]): void {
  let root = join(dirname(fileURLToPath(import.meta.url)), '..');
  let baseline = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--baseline') baseline = true;
    else if (args[i] === '--root' && args[i + 1]) root = args[++i]!;
    else throw new Error(`unknown argument ${args[i]}; usage: node model/cli.ts [--baseline] [--root DIR]`);
  }

  // Build and encode everything first: a failed check ([MODEL-3], [MODEL-4]) throws before any file is written.
  const model = build();
  const files: [string, Uint8Array | string][] = [[GLB_PATH, toGlb(model)]];
  if (baseline) files.push([BASELINE_PATH, JSON.stringify(model)]);

  for (const [path, data] of files) {
    const to = join(root, path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, data);
    console.log(`wrote ${path}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(`model: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
