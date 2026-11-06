/// <reference types="node" />
// The deploy hook's last step: hand the smoke hook the deployed URL, within the job. CloudFront names the site's address only once
// SST has created the distribution (decision 3 of docs/projects/6.md), so the hook reads it from what `sst deploy` wrote,
// `.sst/outputs.json` (sst.config.ts returns `{ url }`), and writes it to `$RUNNER_TEMP/playground-3d-url`, which the smoke hook
// reads ([PLAT-10]). The URL is no secret.
//
//   node .github/actions/deploy/url.ts     (run from the checkout, after sst deploy)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The file under `$RUNNER_TEMP` that carries the deployed URL from the deploy hook to the smoke hook. */
export const URL_FILE = 'playground-3d-url';

export function handOff(checkout: string, runnerTemp: string): string {
  const outputs = join(checkout, '.sst', 'outputs.json');
  if (!existsSync(outputs)) throw new Error(`sst deploy wrote no .sst/outputs.json, so there is no deployed url to hand the smoke hook.`);
  const { url } = JSON.parse(readFileSync(outputs, 'utf8')) as { url?: unknown };
  let parsed: URL | null = null;
  try {
    parsed = typeof url === 'string' ? new URL(url) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== 'https:') {
    throw new Error(`.sst/outputs.json holds no https url (it holds ${JSON.stringify(url)}), so there is no deployed url to hand the smoke hook.`);
  }
  writeFileSync(join(runnerTemp, URL_FILE), url as string);
  return url as string;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const runnerTemp = process.env.RUNNER_TEMP;
    if (!runnerTemp) throw new Error('RUNNER_TEMP is not set.');
    console.log(`Deployed to ${handOff(process.cwd(), runnerTemp)}.`);
  } catch (error) {
    console.error(`::error::${(error as Error).message}`);
    process.exit(1);
  }
}
