/// <reference types="node" />
// The build hook's last step: copy what `sst deploy` reads from the checkout into the lane's `output` directory, so the deploy hook
// deploys this build and never builds again ([PLAT-8], [PLAT-9]). SST's Nextjs component reads `.open-next/` (its output file and
// every bundle it names) and three files of `.next/`; nothing else of the build. It fails, naming the file, when the build left one out.
//
//   node .github/actions/build/collect.ts <output>     (run from the checkout)
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The files of `.next/` SST 4's Nextjs component reads after the build: the build id, the base path and the prerendered routes. */
export const SST_READS = ['BUILD_ID', 'prerender-manifest.json', 'routes-manifest.json'];

export function collect(checkout: string, output: string): void {
  const openNext = join(checkout, '.open-next');
  if (!existsSync(join(openNext, 'open-next.output.json'))) {
    throw new Error(`The build left no .open-next/open-next.output.json in ${checkout}: OpenNext did not finish, so there is nothing to deploy.`);
  }
  for (const file of SST_READS) {
    if (!existsSync(join(checkout, '.next', file))) throw new Error(`The build left no .next/${file} in ${checkout}, which sst deploy reads.`);
  }
  mkdirSync(join(output, '.next'), { recursive: true });
  cpSync(openNext, join(output, '.open-next'), { recursive: true });
  for (const file of SST_READS) cpSync(join(checkout, '.next', file), join(output, '.next', file));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  try {
    if (!output) throw new Error('usage: node collect.ts <output>');
    collect(process.cwd(), output);
    console.log(`Filled ${output} with .open-next/ and .next/${SST_READS.join(', .next/')}.`);
  } catch (error) {
    console.error(`::error::${(error as Error).message}`);
    process.exit(1);
  }
}
