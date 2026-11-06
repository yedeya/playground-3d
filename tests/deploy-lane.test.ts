/// <reference types="node" />
// Kanon's deploy lane, as this repository wires it: the build, deploy and smoke hooks under .github/actions/, the caller
// .github/workflows/deploy.yml and the adoption record's `## Deploy` section. Production is the only environment, and no test here
// reaches it (`K-OBS-7`): the probe and the smoke check run against a server on 127.0.0.1, and the SST config runs against stand-ins.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { collect, SST_READS } from '../.github/actions/build/collect.ts';
import { place } from '../.github/actions/deploy/place.ts';
import { main as probeMain, probe } from '../.github/actions/deploy/probe.ts';
import { handOff, URL_FILE } from '../.github/actions/deploy/url.ts';
import { MODEL, main as smokeMain, smoke, TITLE } from '../.github/actions/smoke/smoke.ts';
import { MODEL_URL } from '../src/data/load-model';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

type Step = {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  shell?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  'continue-on-error'?: unknown;
};
type Action = { inputs: Record<string, unknown>; runs: { using: string; steps: Step[] } };
const action = (hook: string) => parse(read(`.github/actions/${hook}/action.yml`)) as Action;

// A child's environment: only what it is given, with PATH so it finds bash and sh.
const childEnv = (vars: Record<string, string>): NodeJS.ProcessEnv => ({ NODE_ENV: 'test', PATH: process.env.PATH, ...vars });

const temps: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-lane-'));
  temps.push(dir);
  return dir;
};
const write = (path: string, text: string) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
};
const tree = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();

// The OpenNext the build hook runs: package.json pins it, and sst.config.ts names it to SST's Nextjs as its openNextVersion.
const OPEN_NEXT = '3.9.16';

// Any command that builds the app: OpenNext's, Next's, or the package's build script.
const BUILDS = /\bopen-next(@[\w.]+)?\s+build\b|\bnext\s+build\b|\bnpm\s+run\s+build\b|\bsst\s+build\b/;

// A server on 127.0.0.1 that answers each request with what `routes` returns, and records what it was asked.
type Route = (req: IncomingMessage, body: string) => { status: number; body: string | Uint8Array; type?: string };
async function serve(routes: (path: string) => Route | undefined) {
  const requests: { method: string; url: string; headers: IncomingMessage['headers']; body: string }[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      const route = routes(path);
      const answer = route ? route(req, body) : { status: 404, body: 'not found' };
      res.writeHead(answer.status, { 'content-type': answer.type ?? 'text/html; charset=utf-8' });
      res.end(answer.body);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

describe('the build hook', () => {
  const build = action('build');

  it('[PLAT-8] takes the lane\'s inputs and builds the app once, with the pinned OpenNext, from the checked-out commit', () => {
    expect(Object.keys(build.inputs).sort()).toEqual(['output', 'release', 'sha']);
    expect(build.runs.using).toBe('composite');
    const steps = build.runs.steps;
    expect(steps[0].uses).toBe('./.github/actions/project-setup');
    expect(steps.every(step => step.uses === undefined || step.uses === './.github/actions/project-setup')).toBe(true);
    // One build: OpenNext runs `next build` itself, then bundles its output for SST.
    const builds = steps.filter(step => BUILDS.test(step.run ?? ''));
    expect(builds).toHaveLength(1);
    expect(builds[0].run!.trim()).toBe('npx --no-install open-next build');
    // The installed OpenNext, pinned exactly, never one npx downloads at build time. 3.9.16 is the lowest release past SST 4.17's
    // default 3.9.14 whose lockfile clears 3.9.14's critical fast-xml-parser advisory (#63); the lockfile installs that same version.
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.devDependencies['@opennextjs/aws']).toBe(OPEN_NEXT);
    expect(JSON.parse(read('package-lock.json')).packages['node_modules/@opennextjs/aws'].version).toBe(OPEN_NEXT);
    // A failed build fails the hook: every step is a plain shell step, none continues on error.
    for (const step of steps) {
      expect(step['continue-on-error'], step.name).toBeUndefined();
      if (step.run) expect(step.shell, step.name).toBe('bash');
    }
  });

  it('[PLAT-8] holds no credential and no secret', () => {
    const text = read('.github/actions/build/action.yml') + read('.github/actions/build/collect.ts');
    for (const forbidden of ['id-token', 'aws-actions', 'configure-aws-credentials', 'KANON_DEPLOY', 'secrets.', 'AWS_', 'ACTIONS_ID_TOKEN']) {
      expect(text.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('[PLAT-8] fills output with the OpenNext build and the .next files SST reads, after the build', () => {
    const steps = build.runs.steps;
    const fill = steps.findIndex(step => (step.run ?? '').includes('collect.ts'));
    expect(fill).toBeGreaterThan(steps.findIndex(step => BUILDS.test(step.run ?? '')));
    expect(steps[fill].env).toEqual({ OUTPUT: '${{ inputs.output }}' });
    expect(steps[fill].run!.trim()).toBe('node "$GITHUB_ACTION_PATH/collect.ts" "$OUTPUT"');

    const checkout = temp();
    const output = temp();
    write(join(checkout, '.open-next/open-next.output.json'), '{"origins":{}}');
    write(join(checkout, '.open-next/server-functions/default/index.mjs'), 'server');
    write(join(checkout, '.open-next/assets/_next/static/chunks/app.js'), 'chunk');
    for (const file of SST_READS) write(join(checkout, '.next', file), file);
    write(join(checkout, '.next/cache/webpack/big.pack'), 'not needed');
    write(join(checkout, 'src/app/page.tsx'), 'source');

    collect(checkout, output);
    expect(tree(output)).toEqual([
      ...SST_READS.map(file => `.next/${file}`),
      '.open-next/assets/_next/static/chunks/app.js',
      '.open-next/open-next.output.json',
      '.open-next/server-functions/default/index.mjs',
    ].sort());
    expect(SST_READS).toEqual(['BUILD_ID', 'prerender-manifest.json', 'routes-manifest.json']);
  });

  it('[PLAT-8] fails when the build left out the OpenNext output or a .next file SST reads', () => {
    const missingOpenNext = temp();
    for (const file of SST_READS) write(join(missingOpenNext, '.next', file), file);
    expect(() => collect(missingOpenNext, temp())).toThrow(/open-next\.output\.json/);

    for (const left of SST_READS) {
      const checkout = temp();
      write(join(checkout, '.open-next/open-next.output.json'), '{}');
      for (const file of SST_READS) if (file !== left) write(join(checkout, '.next', file), file);
      expect(() => collect(checkout, temp()), left).toThrow(left);
    }

    // And from the command line the hook runs, as a failed step.
    const result = spawnSync(process.execPath, [join(root, '.github/actions/build/collect.ts'), temp()], { cwd: temp(), encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/open-next\.output\.json/);
  });
});

describe('the deploy hook', () => {
  const deploy = action('deploy');
  const steps = deploy.runs.steps;
  const deploying = steps.filter(step => step.if === "inputs.probe != 'true'");
  const probing = steps.filter(step => step.if === "inputs.probe == 'true'");

  it('[PLAT-9] takes the lane\'s inputs, and runs every step under one of the two modes', () => {
    expect(Object.keys(deploy.inputs).sort()).toEqual(['artifact', 'environment', 'environments', 'probe', 'release', 'role', 'sha']);
    expect(deploy.runs.using).toBe('composite');
    expect(deploying.length + probing.length).toBe(steps.length);
    for (const step of steps) expect(step['continue-on-error'], step.name).toBeUndefined();
  });

  it('[PLAT-9] obtains the credential through GitHub\'s OIDC token for the role KANON_DEPLOY_TARGET names, with no static key', () => {
    const credential = deploying.filter(step => step.uses?.startsWith('aws-actions/configure-aws-credentials@'));
    expect(credential).toHaveLength(1);
    const [step] = credential;
    expect(step.uses).toMatch(/^aws-actions\/configure-aws-credentials@[0-9a-f]{40}$/);
    expect(step.with).toMatchObject({
      'role-to-assume': '${{ env.KANON_DEPLOY_TARGET }}',
      audience: 'sts.amazonaws.com',
      'aws-region': 'eu-central-1',
    });
    for (const key of ['aws-access-key-id', 'aws-secret-access-key', 'aws-session-token', 'web-identity-token-file', 'role-chaining', 'output-credentials']) {
      expect(Object.hasOwn(step.with ?? {}, key), key).toBe(false);
    }
    // An empty role fails by name before the credential step tries anything.
    const guard = deploying.findIndex(step => (step.run ?? '').includes('KANON_DEPLOY_TARGET'));
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(deploying.indexOf(step));
    const empty = spawnSync('bash', ['-c', deploying[guard].run!], { env: childEnv({ KANON_DEPLOY_TARGET: '' }), encoding: 'utf8' });
    expect(empty.status).not.toBe(0);
    expect(empty.stdout + empty.stderr).toMatch(/KANON_DEPLOY_TARGET/);
    const set = spawnSync('bash', ['-c', deploying[guard].run!], { env: childEnv({ KANON_DEPLOY_TARGET: 'arn:aws:iam::<account-id>:role/x' }), encoding: 'utf8' });
    expect(set.status).toBe(0);
    // Nothing in the hook reads the deploy secret or a static key.
    const text = read('.github/actions/deploy/action.yml');
    for (const forbidden of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'KANON_DEPLOY_SECRET', 'secrets.']) {
      expect(text.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('[PLAT-9] puts the build hook\'s artifact in place, then deploys it with sst deploy --stage <environment>, and builds nothing', () => {
    const run = deploying.filter(step => step.run).map(step => step.run!);
    expect(run.filter(command => BUILDS.test(command))).toEqual([]);
    const sst = deploying.filter(step => /\bsst\b/.test(step.run ?? ''));
    expect(sst).toHaveLength(1);
    expect(sst[0].run!.trim()).toBe('npx --no-install sst deploy --stage "$ENVIRONMENT"');
    expect(sst[0].env).toEqual({ ENVIRONMENT: '${{ inputs.environment }}' });

    const order = (match: (step: Step) => boolean) => deploying.findIndex(match);
    const setup = order(step => step.uses === './.github/actions/project-setup');
    const placed = order(step => (step.run ?? '').includes('place.ts'));
    const credential = order(step => step.uses?.startsWith('aws-actions/') ?? false);
    const deployed = deploying.indexOf(sst[0]);
    const handed = order(step => (step.run ?? '').includes('url.ts'));
    expect([setup, placed, credential, deployed, handed].every(index => index >= 0)).toBe(true);
    expect(setup).toBeLessThan(placed);
    expect(placed).toBeLessThan(deployed);
    expect(credential).toBeLessThan(deployed);
    expect(deployed).toBeLessThan(handed);
    expect(deploying[placed].env).toEqual({ ARTIFACT: '${{ inputs.artifact }}' });
    expect(deploying[placed].run!.trim()).toBe('node "$GITHUB_ACTION_PATH/place.ts" "$ARTIFACT"');

    // place.ts copies the artifact into the checkout, replacing anything a build there left.
    const artifact = temp();
    write(join(artifact, '.open-next/open-next.output.json'), '{"fresh":true}');
    write(join(artifact, '.open-next/assets/a.js'), 'a');
    write(join(artifact, '.next/BUILD_ID'), 'release-build');
    const checkout = temp();
    write(join(checkout, '.open-next/stale.js'), 'stale');
    write(join(checkout, 'package.json'), '{}');
    place(artifact, checkout);
    expect(tree(checkout)).toEqual(['.next/BUILD_ID', '.open-next/assets/a.js', '.open-next/open-next.output.json', 'package.json']);
    expect(readFileSync(join(checkout, '.next/BUILD_ID'), 'utf8')).toBe('release-build');
    expect(() => place(temp(), temp())).toThrow(/open-next\.output\.json/);
  });

  describe('the SST config the hook deploys', () => {
    type Config = { run(): Promise<unknown> };
    const loadSite = async () => {
      const constructed: { name: string; args?: { buildCommand?: string; openNextVersion?: string } }[] = [];
      vi.stubGlobal('$config', (config: unknown) => config);
      vi.stubGlobal('sst', {
        aws: {
          Nextjs: class {
            url = 'https://Nextjs.cloudfront.net';
            constructor(name: string, args?: { buildCommand?: string; openNextVersion?: string }) {
              constructed.push({ name, args });
            }
          },
        },
      });
      // Not a literal specifier, so tsc does not follow it into a file whose globals only `sst install` declares.
      const url = pathToFileURL(join(root, 'sst.config.ts')).href;
      const config = (await import(/* @vite-ignore */ url)).default as Config;
      await config.run();
      return constructed[0];
    };
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('[PLAT-9] never builds during sst deploy: the site\'s build command only checks the artifact is in place', async () => {
      const site = await loadSite();
      const command = site.args?.buildCommand;
      expect(command).toBeTypeOf('string');
      expect(command).not.toMatch(BUILDS);
      expect(command).not.toMatch(/\b(npm|npx|pnpm|yarn|bun|node)\b/);
      // SST runs it with sh in the site's directory: it fails without the OpenNext output, and passes with it, changing nothing.
      const empty = temp();
      const missing = spawnSync('sh', ['-c', command!], { cwd: empty, encoding: 'utf8' });
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toMatch(/open-next\.output\.json/);
      expect(tree(empty)).toEqual([]);
      const placed = temp();
      write(join(placed, '.open-next/open-next.output.json'), '{}');
      expect(spawnSync('sh', ['-c', command!], { cwd: placed }).status).toBe(0);
      expect(tree(placed)).toEqual(['.open-next/open-next.output.json']);
    });

    it('names the build hook\'s pinned OpenNext as the site\'s openNextVersion, so SST never assumes its own default', async () => {
      const site = await loadSite();
      expect(site.args?.openNextVersion).toBe(OPEN_NEXT);
      expect(JSON.parse(read('package.json')).devDependencies['@opennextjs/aws']).toBe(site.args?.openNextVersion);
    });
  });

  describe('the probe', () => {
    const OBTAINED_SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYzEXAMPLEKEY';
    let sts: Awaited<ReturnType<typeof serve>>;
    let oidc: Awaited<ReturnType<typeof serve>>;
    const stsAnswer = (role: string) => {
      if (role.endsWith('/trusts-too-much')) {
        return {
          status: 200,
          body: `<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials><AccessKeyId>ASIAEXAMPLE</AccessKeyId><SecretAccessKey>${OBTAINED_SECRET}</SecretAccessKey><SessionToken>session-token-example</SessionToken></Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>`,
        };
      }
      if (role.endsWith('/bound')) {
        return { status: 403, body: '<ErrorResponse><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>Not authorized to perform sts:AssumeRoleWithWebIdentity</Message></Error></ErrorResponse>' };
      }
      return { status: 400, body: '<ErrorResponse><Error><Type>Sender</Type><Code>InvalidIdentityToken</Code><Message>No OpenIDConnect provider found in your account</Message></Error></ErrorResponse>' };
    };
    beforeAll(async () => {
      sts = await serve(() => (_req, body) => stsAnswer(new URLSearchParams(body).get('RoleArn') ?? ''));
      oidc = await serve(path => (path === '/token' ? () => ({ status: 200, type: 'application/json', body: JSON.stringify({ value: 'the-jobs-oidc-token' }) }) : undefined));
    });
    afterAll(async () => {
      await sts.close();
      await oidc.close();
    });

    const env = (targets: Record<string, string> | string, more: Record<string, string> = {}) => ({
      ACTIONS_ID_TOKEN_REQUEST_URL: `${oidc.url}/token?api-version=2.0`,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'the-request-token',
      KANON_DEPLOY_TARGETS: typeof targets === 'string' ? targets : JSON.stringify(targets),
      ...more,
    });

    it('[PLAT-9] runs only with probe: \'true\', and then tries each listed environment\'s role and deploys nothing', () => {
      expect(probing.map(step => step.uses ?? step.run!.trim())).toEqual(['actions/setup-node@v6', 'node "$GITHUB_ACTION_PATH/probe.ts"']);
      const step = probing[1];
      expect(step.env).toEqual({ ENVIRONMENTS: '${{ inputs.environments }}' });
      // The deploy, the credential and the URL hand-off all sit under the other mode.
      for (const deployOnly of deploying) expect(deployOnly.if).toBe("inputs.probe != 'true'");
      const text = read('.github/actions/deploy/probe.ts');
      for (const forbidden of ['sst', 'GITHUB_ENV', 'GITHUB_OUTPUT', 'appendFile', 'child_process']) {
        expect(text.includes(forbidden), forbidden).toBe(false);
      }
    });

    it('[PLAT-9] answers refused, obtained or unconfigured for each environment, and writes them to $RUNNER_TEMP/kanon-deploy-probe.json', async () => {
      const runnerTemp = temp();
      const targets = {
        production: 'arn:aws:iam::<account-id>:role/bound',
        staging: 'arn:aws:iam::<account-id>:role/trusts-too-much',
        preview: 'arn:aws:iam::<account-id>:role/no-provider',
        unlisted: 'arn:aws:iam::<account-id>:role/bound',
      };
      const log: string[] = [];
      const answers = await probeMain(
        { ...env(targets), RUNNER_TEMP: runnerTemp, ENVIRONMENTS: 'production staging preview review' },
        { sts: sts.url, log: line => log.push(line) },
      );
      const expected = { production: 'refused', staging: 'obtained', preview: 'unconfigured', review: 'unconfigured' };
      expect(answers).toEqual(expected);
      const file = readFileSync(join(runnerTemp, 'kanon-deploy-probe.json'), 'utf8');
      expect(JSON.parse(file)).toEqual(expected);
      expect(tree(runnerTemp)).toEqual(['kanon-deploy-probe.json']);

      // It asked GitHub for the job's token with the audience AWS checks, and STS for each listed role with it.
      const tokenRequest = oidc.requests.at(-1)!;
      expect(new URL(tokenRequest.url, oidc.url).searchParams.get('audience')).toBe('sts.amazonaws.com');
      expect(tokenRequest.headers.authorization).toBe('bearer the-request-token');
      const asked = sts.requests.slice(-3).map(request => new URLSearchParams(request.body));
      expect(asked.map(params => params.get('RoleArn'))).toEqual([targets.production, targets.staging, targets.preview]);
      for (const params of asked) {
        expect(params.get('Action')).toBe('AssumeRoleWithWebIdentity');
        expect(params.get('WebIdentityToken')).toBe('the-jobs-oidc-token');
      }
      // A credential it obtained is dropped: it reaches neither the file nor the log.
      expect(file.includes(OBTAINED_SECRET)).toBe(false);
      expect(log.join('\n').includes(OBTAINED_SECRET)).toBe(false);
      expect(log.join('\n').includes('ASIAEXAMPLE')).toBe(false);
    });

    it('[PLAT-9] answers unconfigured for every environment when there is no role or no OIDC token to try', async () => {
      const bound = { production: 'arn:aws:iam::<account-id>:role/bound' };
      expect(await probe(['production'], env(''), { sts: sts.url })).toEqual({ production: 'unconfigured' });
      expect(await probe(['production'], env('not json'), { sts: sts.url })).toEqual({ production: 'unconfigured' });
      expect(await probe(['production'], env({ production: '' }), { sts: sts.url })).toEqual({ production: 'unconfigured' });
      const noToken = { KANON_DEPLOY_TARGETS: JSON.stringify(bound) };
      expect(await probe(['production'], noToken, { sts: sts.url })).toEqual({ production: 'unconfigured' });
      // An STS that can't be reached is no refusal either.
      const closed = await serve(() => undefined);
      await closed.close();
      expect(await probe(['production'], env(bound), { sts: closed.url })).toEqual({ production: 'unconfigured' });
      // The real thing, from the command line the hook runs: still a file, and exit 0, so the lane's judge reads the answer.
      const runnerTemp = temp();
      const result = spawnSync(process.execPath, [join(root, '.github/actions/deploy/probe.ts')], {
        env: childEnv({ RUNNER_TEMP: runnerTemp, ENVIRONMENTS: 'production', KANON_DEPLOY_TARGETS: '' }),
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(readFileSync(join(runnerTemp, 'kanon-deploy-probe.json'), 'utf8'))).toEqual({ production: 'unconfigured' });
    });
  });

  it('[PLAT-9] hands the smoke hook the URL sst deploy wrote, within the job', () => {
    const step = deploying.find(step => (step.run ?? '').includes('url.ts'))!;
    expect(step.run!.trim()).toBe('node "$GITHUB_ACTION_PATH/url.ts"');
    expect(URL_FILE).toBe('playground-3d-url');

    const checkout = temp();
    const runnerTemp = temp();
    write(join(checkout, '.sst/outputs.json'), JSON.stringify({ url: 'https://d111111abcdef8.cloudfront.net' }));
    expect(handOff(checkout, runnerTemp)).toBe('https://d111111abcdef8.cloudfront.net');
    expect(readFileSync(join(runnerTemp, URL_FILE), 'utf8')).toBe('https://d111111abcdef8.cloudfront.net');

    for (const outputs of [null, '{}', '{"url":""}', '{"url":"not a url"}', '{"url":"ftp://x"}']) {
      const bad = temp();
      if (outputs !== null) write(join(bad, '.sst/outputs.json'), outputs);
      expect(() => handOff(bad, temp()), String(outputs)).toThrow(/url/i);
    }
  });
});

describe('the smoke hook', () => {
  const smokeHook = action('smoke');
  let site: Awaited<ReturnType<typeof serve>>;
  const page = (title: string, scripts: string[]) => `<!DOCTYPE html><html lang="nl"><head><meta charSet="utf-8"/><title>${title}</title>${scripts
    .map(src => `<script src="${src}" async=""></script>`)
    .join('')}</head><body><div id="stage"></div></body></html>`;
  const ok = (body: string | Uint8Array, type?: string) => () => ({ status: 200, body, type });
  // The GLB the app ships, as the site serves it.
  const glb = readFileSync(join(root, 'public/models/speeltoestel.glb'));

  beforeAll(async () => {
    site = await serve(path => {
      switch (path) {
        case '/models/speeltoestel.glb':
          return ok(glb, 'model/gltf-binary');
        case '/':
          return ok(page(TITLE, ['/_next/static/chunks/main.js', '_next/static/chunks/page.js']));
        case '/wrong-title/':
          return ok(page('Speeltoestel', ['/_next/static/chunks/main.js']));
        case '/dead-script/':
          return ok(page(TITLE, ['/_next/static/chunks/main.js', '/_next/static/chunks/gone.js']));
        case '/failing/':
          return () => ({ status: 500, body: page(TITLE, []) });
        case '/_next/static/chunks/main.js':
        case '/_next/static/chunks/page.js':
          return ok('void 0', 'application/javascript');
        default:
          return undefined;
      }
    });
  });
  afterAll(async () => {
    await site.close();
  });

  it('[PLAT-10] takes the lane\'s inputs, and fetches the URL the deploy hook handed it', () => {
    expect(Object.keys(smokeHook.inputs).sort()).toEqual(['environment', 'release', 'role']);
    const run = smokeHook.runs.steps.filter(step => step.run);
    expect(run.map(step => step.run!.trim())).toEqual(['node "$GITHUB_ACTION_PATH/smoke.ts"']);
    const text = read('.github/actions/smoke/action.yml');
    for (const forbidden of ['aws-actions', 'KANON_DEPLOY', 'secrets.', 'cloudfront.net']) expect(text.includes(forbidden), forbidden).toBe(false);
    expect(TITLE).toBe('Speeltoestel ArcticFlyer 3D');
  });

  it('[PLAT-10] passes when the page answers 200 with the title, and every script it references answers 200', async () => {
    expect(await smoke(`${site.url}/`, { attempts: 1 })).toEqual([]);
    const fetched = site.requests.map(request => request.url);
    expect(fetched).toEqual(expect.arrayContaining(['/', '/_next/static/chunks/main.js', '/_next/static/chunks/page.js']));
  });

  it('[PLAT-10] fails when the page does not answer 200, has another title, or a script it references does not answer 200', async () => {
    expect((await smoke(`${site.url}/failing/`, { attempts: 1 })).join('\n')).toMatch(/500/);
    expect((await smoke(`${site.url}/wrong-title/`, { attempts: 1 })).join('\n')).toMatch(/title/);
    const dead = await smoke(`${site.url}/dead-script/`, { attempts: 1 });
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatch(/gone\.js.*404/);
    const closed = await serve(() => undefined);
    await closed.close();
    expect(await smoke(`${closed.url}/`, { attempts: 1 })).toHaveLength(1);
  });

  it('[PLAT-10] reads the URL the deploy hook handed it, and fails without one', async () => {
    const runnerTemp = temp();
    const log: string[] = [];
    await expect(smokeMain({ RUNNER_TEMP: runnerTemp }, { attempts: 1, log: line => log.push(line) })).rejects.toThrow(URL_FILE);
    writeFileSync(join(runnerTemp, URL_FILE), `${site.url}/`);
    await expect(smokeMain({ RUNNER_TEMP: runnerTemp }, { attempts: 1, log: line => log.push(line) })).resolves.toBeUndefined();
    writeFileSync(join(runnerTemp, URL_FILE), `${site.url}/dead-script/`);
    await expect(smokeMain({ RUNNER_TEMP: runnerTemp }, { attempts: 1, log: line => log.push(line) })).rejects.toThrow(/gone\.js/);
    // From the command line the hook runs: a failed check is a failed step.
    // Asynchronously, since the server it fetches from runs in this process.
    const result = await new Promise<{ status: number | null; stderr: string }>(done => {
      const child = spawn(process.execPath, [join(root, '.github/actions/smoke/smoke.ts')], {
        env: childEnv({ RUNNER_TEMP: runnerTemp, SMOKE_ATTEMPTS: '1' }),
      });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('close', status => done({ status, stderr }));
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/gone\.js/);
  });
});

describe('the smoke hook\'s model check', () => {
  // Tests of [MODEL-13] use their own sites, so each GLB route answers only what its test names.
  const sites: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(sites.splice(0).map(site => site.close()));
  });
  const page = `<!DOCTYPE html><html><head><title>${TITLE}</title><script src="/main.js"></script></head><body></body></html>`;
  const siteWith = async (model: Route | undefined) => {
    const site = await serve(path => {
      if (path === '/') return () => ({ status: 200, body: page });
      if (path === '/main.js') return () => ({ status: 200, body: 'void 0', type: 'application/javascript' });
      if (path === '/models/speeltoestel.glb') return model;
      return undefined;
    });
    sites.push(site);
    return site;
  };
  const glb = readFileSync(join(root, 'public/models/speeltoestel.glb'));

  it('[MODEL-13] fetches /models/speeltoestel.glb, the path the app fetches, from the deployed URL, and passes on 200 with glTF magic bytes', async () => {
    expect(MODEL).toBe('/models/speeltoestel.glb');
    expect(MODEL).toBe(MODEL_URL);
    const site = await siteWith(() => ({ status: 200, body: glb, type: 'model/gltf-binary' }));
    expect(await smoke(`${site.url}/`, { attempts: 1 })).toEqual([]);
    expect(site.requests.map(request => request.url)).toContain('/models/speeltoestel.glb');
  });

  it('[MODEL-13] fetches the GLB from the deployed URL\'s origin, as the app\'s absolute path does', async () => {
    const site = await serve(path => {
      if (path === '/app/') return () => ({ status: 200, body: page });
      if (path === '/main.js') return () => ({ status: 200, body: 'void 0', type: 'application/javascript' });
      if (path === '/models/speeltoestel.glb') return () => ({ status: 200, body: glb, type: 'model/gltf-binary' });
      return undefined;
    });
    sites.push(site);
    expect(await smoke(`${site.url}/app/`, { attempts: 1 })).toEqual([]);
  });

  it('[MODEL-13] fails when the GLB does not answer 200', async () => {
    const missing = await smoke(`${(await siteWith(undefined)).url}/`, { attempts: 1 });
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatch(/speeltoestel\.glb.*404/);
    const failing = await smoke(`${(await siteWith(() => ({ status: 500, body: glb }))).url}/`, { attempts: 1 });
    expect(failing).toHaveLength(1);
    expect(failing[0]).toMatch(/speeltoestel\.glb.*500/);
  });

  it('[MODEL-13] fails when the GLB answers 200 with a body that does not start with the magic bytes glTF', async () => {
    // A single-page fallback answering the app's HTML, a JSON glTF, a body cut short, and an empty one.
    for (const body of [page, '{"asset":{"version":"2.0"}}', 'glT', '', Buffer.concat([Buffer.from('xglTF'), glb])]) {
      const failures = await smoke(`${(await siteWith(() => ({ status: 200, body }))).url}/`, { attempts: 1 });
      expect(failures, JSON.stringify(String(body).slice(0, 20))).toHaveLength(1);
      expect(failures[0]).toMatch(/speeltoestel\.glb.*glTF/);
    }
  });

  it('[MODEL-13] fails the hook\'s step when the GLB is missing', async () => {
    const runnerTemp = temp();
    writeFileSync(join(runnerTemp, URL_FILE), `${(await siteWith(undefined)).url}/`);
    await expect(smokeMain({ RUNNER_TEMP: runnerTemp }, { attempts: 1 })).rejects.toThrow(/speeltoestel\.glb/);
  });
});

describe('the caller and the declaration', () => {
  // The `## Deploy` section, read the way Kanon's parser (scripts/lib/deploy-declaration.mjs) reads it: `- **Label:** `value``.
  const adoption = read('docs/qa/adoption.md');
  const section = (heading: string) => {
    const lines = adoption.split('\n');
    const start = lines.indexOf(`## ${heading}`);
    if (start < 0) return null;
    const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
    return lines.slice(start + 1, end < 0 ? undefined : end);
  };
  const bullets = (lines: string[]) =>
    Object.fromEntries(lines.flatMap(line => {
      const match = /^- \*\*([^*]+):\*\* (.+)$/.exec(line);
      return match ? [[match[1], match[2]]] : [];
    }));

  it('[PLAT-11] declares one environment, production, as the reference environment, deployed by deploy.yml in the job production / deploy', () => {
    const deploy = section('Deploy');
    expect(deploy).not.toBeNull();
    expect(bullets(deploy!)).toEqual({
      Environments: '`production`',
      'Reference environment': '`production`',
      'Reference deploy workflow': '`deploy.yml`',
      'Reference deploy job': '`production / deploy`',
    });
    // No smoke schedule: production has a required reviewer, and each scheduled run would hold the deploy's slot waiting for one.
    expect(adoption.includes('Smoke schedule')).toBe(false);
    // No deploy bullet anywhere else: `## Plan`'s environments line is prose, not a declaration.
    const plan = bullets(section('Plan')!);
    expect(plan.Environments).toMatch(/production/);
    expect(plan.Environments).not.toMatch(/^`[^`]*`$/);
  });

  it('[PLAT-11] no longer waives deploy.reference-undeclared', () => {
    expect(adoption.includes('deploy.reference-undeclared')).toBe(false);
  });

  it('[PLAT-11] the workflow deploy.yml runs production as the job production, so a run lists it as production / deploy', () => {
    const caller = parse(read('.github/workflows/deploy.yml')) as {
      name: string;
      on: Record<string, unknown>;
      jobs: Record<string, { name?: string; needs?: unknown; uses: string; with: Record<string, unknown>; secrets?: Record<string, string>; permissions?: Record<string, string> }>;
    };
    expect(Object.keys(caller.jobs)).toEqual(['release', 'deploy-1']);
    const { release, 'deploy-1': production } = caller.jobs;
    expect(release.with.environments).toBe('production');
    expect(production.name).toBe('production');
    expect(production.with).toMatchObject({ environment: 'production', position: 1 });
    expect(production.uses).toMatch(/^yedeya-labs\/kanon\/\.github\/workflows\/deploy\.yml@/);
  });

  it('pins the caller to the Kanon release every other caller pins, with the permissions and the two secrets the lane names', () => {
    const caller = parse(read('.github/workflows/deploy.yml')) as {
      name: string;
      on: Record<string, unknown>;
      permissions?: Record<string, string>;
      jobs: Record<string, { name?: string; needs?: unknown; uses: string; with: Record<string, unknown>; secrets?: Record<string, string>; permissions?: Record<string, string> }>;
    };
    // The lane's diagnose caller listens for this name.
    expect(caller.name).toBe('Deploy');
    expect(Object.keys(caller.on).sort()).toEqual(['release', 'workflow_dispatch']);
    const pins = new Set(
      readdirSync(join(root, '.github/workflows'))
        .filter(file => file !== 'deploy.yml')
        .flatMap(file => [...read(`.github/workflows/${file}`).matchAll(/yedeya-labs\/kanon\/\S+@(\S+)/g)].map(match => match[1])),
    );
    expect(pins.size).toBe(1);
    const [pin] = pins;
    const { release, 'deploy-1': production } = caller.jobs;
    expect(release.uses).toBe(`yedeya-labs/kanon/.github/workflows/deploy-release.yml@${pin}`);
    expect(production.uses).toBe(`yedeya-labs/kanon/.github/workflows/deploy.yml@${pin}`);
    expect(release.with.targets).toBe('${{ vars.KANON_DEPLOY_TARGETS }}');
    expect(release.secrets).toBeUndefined();
    expect(production.needs).toEqual('release');
    expect(production.with).toMatchObject({
      build: '${{ needs.release.outputs.build }}',
      targets: '${{ needs.release.outputs.targets }}',
    });
    expect(production.secrets).toEqual({
      KANON_CHAT_DEPLOY: '${{ secrets.KANON_CHAT_DEPLOY }}',
      KANON_DEPLOY_SECRET: '${{ secrets.KANON_DEPLOY_SECRET }}',
    });
    const lanePermissions = { actions: 'read', contents: 'read', deployments: 'read', 'id-token': 'write', issues: 'write' };
    expect(release.permissions).toEqual(lanePermissions);
    expect(production.permissions).toEqual(lanePermissions);
    expect(caller.permissions).toEqual({});
  });

  it('records why nothing pages in docs/observability.md', () => {
    expect(existsSync(join(root, 'docs/observability.md'))).toBe(true);
    const text = read('docs/observability.md');
    expect(text).toMatch(/\| `cloudfront-5xx-rate` \|/);
    expect(text).toMatch(/\| `browser-errors` \|/);
    expect(text).toMatch(/#8/);
  });
});

// Remove what these tests wrote.
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
