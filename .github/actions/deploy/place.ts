/// <reference types="node" />
// The deploy hook's first step after setup: put the build hook's artifact, downloaded and checked by the lane, where `sst deploy`
// reads it, so SST deploys that build ([PLAT-9]). It replaces any `.open-next/` already in the checkout, and fails when the
// artifact holds no OpenNext output.
//
//   node .github/actions/deploy/place.ts <artifact>     (run from the checkout)
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function place(artifact: string, checkout: string): void {
  if (!existsSync(join(artifact, '.open-next', 'open-next.output.json'))) {
    throw new Error(`The artifact ${artifact} holds no .open-next/open-next.output.json: the build hook's output is missing, so there is nothing to deploy.`);
  }
  for (const dir of ['.open-next', '.next']) {
    rmSync(join(checkout, dir), { recursive: true, force: true });
    if (existsSync(join(artifact, dir))) cpSync(join(artifact, dir), join(checkout, dir), { recursive: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifact = process.argv[2];
  try {
    if (!artifact) throw new Error('usage: node place.ts <artifact>');
    place(artifact, process.cwd());
    console.log(`Put the build from ${artifact} in place for sst deploy.`);
  } catch (error) {
    console.error(`::error::${(error as Error).message}`);
    process.exit(1);
  }
}
