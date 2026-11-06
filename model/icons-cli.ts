// `npm run icons`: draws the app's icons (model/icons.ts) and writes them under public/icons/ ([PWA-1]).
// Node runs this file directly, stripping the types, as it does model/cli.ts.
//
//   node model/icons-cli.ts [--root DIR]
//
// --root writes under DIR instead of the repository root, for the tests.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, ICON_SPECS, renderIcon } from './icons.ts';

function main(args: string[]): void {
  let root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) root = args[++i]!;
    else throw new Error(`unknown argument ${args[i]}; usage: node model/icons-cli.ts [--root DIR]`);
  }
  for (const { path, size, maskable } of ICON_SPECS) {
    const to = join(root, path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, encodePng(renderIcon(size, maskable), size));
    console.log(`wrote ${path}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(`icons: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
