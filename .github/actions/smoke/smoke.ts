/// <reference types="node" />
// The smoke hook's check ([PLAT-10]): fetch the deployed page and fail unless it answers 200 with the title
// `Speeltoestel ArcticFlyer 3D`, and every script it references (`<script src>`) answers 200 too. It reads the URL the deploy hook
// handed it in `$RUNNER_TEMP/playground-3d-url`, within the same job. It holds no credential, and the deploy lane's smoke step is the
// only thing that runs it against production (`K-OBS-7`): its tests run it against a local server.
//
//   node .github/actions/smoke/smoke.ts     (SMOKE_ATTEMPTS overrides the page's 3 attempts)
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TITLE = 'Speeltoestel ArcticFlyer 3D';
/** The file the deploy hook writes the deployed URL to (.github/actions/deploy/url.ts). */
const URL_FILE = 'playground-3d-url';
const TIMEOUT = 30_000;

type Options = { attempts?: number; wait?: number; log?: (line: string) => void };

async function get(url: string): Promise<{ status: number; text: string } | { error: string }> {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

const decode = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]!);

/** Every failure the check found; none means the site passed. */
export async function smoke(url: string, { attempts = 3, wait = 10_000, log = () => {} }: Options = {}): Promise<string[]> {
  // A distribution just created or updated can answer an error for a moment, so the page gets a few attempts.
  let page = await get(url);
  for (let attempt = 2; attempt <= attempts && !('status' in page && page.status === 200); attempt++) {
    log(`${url} answered ${'error' in page ? page.error : page.status}; trying again in ${wait / 1000} s.`);
    await new Promise(done => setTimeout(done, wait));
    page = await get(url);
  }
  if ('error' in page) return [`${url} could not be fetched: ${page.error}`];
  if (page.status !== 200) return [`${url} answered ${page.status}, not 200`];

  const failures: string[] = [];
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(page.text)?.[1];
  if (title === undefined || decode(title).trim() !== TITLE) {
    failures.push(`${url} has the title ${JSON.stringify(title === undefined ? null : decode(title))}, not ${JSON.stringify(TITLE)}`);
  }
  const scripts = [...page.text.matchAll(/<script\b[^>]*?\bsrc=["']([^"']+)["']/gi)].map(match => new URL(decode(match[1]), url).href);
  log(`${url} answered 200 with ${scripts.length} script${scripts.length === 1 ? '' : 's'}.`);
  for (const script of new Set(scripts)) {
    const answer = await get(script);
    if ('error' in answer) failures.push(`${script} could not be fetched: ${answer.error}`);
    else if (answer.status !== 200) failures.push(`${script} answered ${answer.status}, not 200`);
  }
  return failures;
}

/** The hook's step: read the deployed URL, check it, and throw with every failure. */
export async function main(env: Record<string, string | undefined>, options: Options = {}): Promise<void> {
  const file = join(env.RUNNER_TEMP ?? '', URL_FILE);
  if (!env.RUNNER_TEMP || !existsSync(file)) {
    throw new Error(`No deployed URL in $RUNNER_TEMP/${URL_FILE}: the deploy hook writes it after sst deploy, in the same job.`);
  }
  const url = readFileSync(file, 'utf8').trim();
  const failures = await smoke(url, options);
  if (failures.length) throw new Error(`The smoke check of ${url} failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  options.log?.(`${url} passed: the page and every script it references answer 200, and its title is ${TITLE}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const attempts = Number(process.env.SMOKE_ATTEMPTS) || undefined;
  main(process.env, { attempts, log: line => console.log(line) }).catch(error => {
    console.error(`::error::${(error as Error).message.replaceAll('\n', '%0A')}`);
    process.exit(1);
  });
}
