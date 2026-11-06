/// <reference types="node" />
// The language, the framework and the infrastructure the repository is built with. These read the checkout itself, so they need git and the
// installed TypeScript and Next.js.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { blockCrossSiteDEV } from 'next/dist/server/lib/router-utils/block-cross-site-dev';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('deploy', () => {
  // The SST config, run for real against stand-ins for the globals SST provides: `$config` hands back what it is given,
  // and `sst.aws` records every component `run()` constructs, so a resource added later shows up here.
  type Constructed = { component: string; name: string; args: unknown };
  type App = {
    name: string;
    home: string;
    removal: string;
    protect: boolean;
    providers: { aws: { region: string; defaultTags: { tags: Record<string, string> } } };
  };
  type Config = { app(input: { stage: string }): App; run(): Promise<unknown> };

  const loadConfig = async () => {
    const constructed: Constructed[] = [];
    const recorder = (component: string) => class {
      url = `https://${component}.cloudfront.net`;
      constructor(name: string, args?: unknown) {
        constructed.push({ component, name, args });
      }
    };
    vi.stubGlobal('$config', (config: unknown) => config);
    vi.stubGlobal('sst', {
      aws: new Proxy({}, { get: (_, component) => recorder(String(component)) }),
    });
    // Not a literal specifier, so tsc does not follow it into a file whose globals only `sst install` declares.
    const url = pathToFileURL(fileURLToPath(new URL('../sst.config.ts', import.meta.url))).href;
    const config = (await import(/* @vite-ignore */ url)).default as Config;
    return { config, constructed };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('[PLAT-6] deploys the one stage production in eu-central-1, retains and protects its resources, and tags every resource with project and stage', async () => {
    const { config } = await loadConfig();
    const app = config.app({ stage: 'production' });
    expect(app.name).toBe('playground-3d');
    expect(app.home).toBe('aws');
    expect(app.removal).toBe('retain');
    expect(app.protect).toBe(true);
    expect(Object.keys(app.providers)).toEqual(['aws']);
    expect(app.providers.aws.region).toBe('eu-central-1');
    expect(app.providers.aws.defaultTags).toEqual({ tags: { project: 'playground-3d', stage: 'production' } });
    for (const stage of ['dev', 'staging', 'Production', 'production-2', 'alice', '']) {
      expect(() => config.app({ stage }), stage).toThrow(/production/);
    }
  });

  it('[PLAT-6] declares one sst.aws.Nextjs site and no other resource, with no custom domain, so it serves on CloudFront\'s own address', async () => {
    const { config, constructed } = await loadConfig();
    const output = await config.run();
    expect(constructed).toHaveLength(1);
    const [site] = constructed;
    expect(site.component).toBe('Nextjs');
    expect(site.args === undefined || !Object.hasOwn(site.args as object, 'domain')).toBe(true);
    expect(output).toEqual({ url: 'https://Nextjs.cloudfront.net' });
  });

  describe('the production deploy role\'s trust policy', () => {
    const subject = 'repo:yedeya@46228687/playground-3d@1446091910:environment:production';
    const policyPath = 'infra/aws/production-deploy-role.trust.json';

    it('[PLAT-7] trusts only GitHub\'s OIDC provider, with the audience sts.amazonaws.com and production\'s exact subject by StringEquals', () => {
      const policy = readJson(policyPath);
      expect(policy.Version).toBe('2012-10-17');
      expect(policy.Statement).toHaveLength(1);
      const [statement] = policy.Statement;
      expect(Object.keys(statement).sort()).toEqual(['Action', 'Condition', 'Effect', 'Principal']);
      expect(statement.Effect).toBe('Allow');
      expect(statement.Action).toBe('sts:AssumeRoleWithWebIdentity');
      expect(statement.Principal).toEqual({
        Federated: 'arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com',
      });
      expect(statement.Condition).toEqual({
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': subject,
        },
      });
    });

    it('[PLAT-7] names no branch, tag or wildcard', () => {
      const text = readFileSync(new URL(`../${policyPath}`, import.meta.url), 'utf8');
      for (const forbidden of ['*', '?', 'ref:', 'refs/', 'heads/', 'tags/', 'StringLike', 'ForAnyValue', 'ForAllValues', 'NotPrincipal']) {
        expect(text.includes(forbidden), forbidden).toBe(false);
      }
    });

    it('[PLAT-7] holds no AWS account id in any file under infra/aws/', () => {
      const dir = fileURLToPath(new URL('../infra/aws/', import.meta.url));
      const files = (function walk(path: string): string[] {
        return readdirSync(path).flatMap(entry => {
          const full = `${path}/${entry}`;
          return statSync(full).isDirectory() ? walk(full) : [full];
        });
      })(dir.replace(/\/$/, ''));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        // An AWS account id is twelve digits; the subject's numeric owner and repository ids are not.
        expect(readFileSync(file, 'utf8').match(/(?<!\d)\d{12}(?!\d)/g), file).toBeNull();
      }
    });
  });
});
