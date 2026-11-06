/// <reference types="node" />
// The deploy hook's trust probe ([PLAT-9]; docs/lanes.md, "The trust probe"). Kanon runs the hook with `probe: 'true'` in a job
// outside every environment, holding `id-token: write`. For each listed environment this tries that environment's AWS role, from
// `KANON_DEPLOY_TARGETS`, with the job's own OIDC token, and answers:
//
//   refused       AWS STS denied the role (AccessDenied): the role trusts only its environment's subject, as [PLAT-7] requires
//   obtained      AWS STS handed out a credential: the role trusts a job outside its environment, and the lane fails `trust-unbound`
//   unconfigured  anything else: no role named, no OIDC token, no OIDC provider in the account, STS unreachable, or another error
//
// It writes the answers as one JSON object to `$RUNNER_TEMP/kanon-deploy-probe.json`, where Kanon's judge reads them, and exits 0
// whatever they are, so the judge decides. It deploys nothing. AssumeRoleWithWebIdentity needs no credential to call, and a
// credential it obtains is dropped: never printed, written or exported.
//
//   ENVIRONMENTS='production' KANON_DEPLOY_TARGETS='{"production":"<role arn>"}' node .github/actions/deploy/probe.ts
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Answer = 'refused' | 'obtained' | 'unconfigured';
type Env = Record<string, string | undefined>;
type Options = { sts?: string; log?: (line: string) => void };

/** The audience the role's trust policy checks (`token.actions.githubusercontent.com:aud`). */
const AUDIENCE = 'sts.amazonaws.com';
/** The region every role of playground-3d lives in ([PLAT-6]); STS answers there. */
const STS = 'https://sts.eu-central-1.amazonaws.com/';
const TIMEOUT = 20_000;

function targetsOf(env: Env): Record<string, unknown> {
  try {
    const targets = JSON.parse(env.KANON_DEPLOY_TARGETS ?? '');
    return targets && typeof targets === 'object' && !Array.isArray(targets) ? targets : {};
  } catch {
    return {};
  }
}

/** The job's OIDC token for AWS, or why there is none. */
async function oidcToken(env: Env): Promise<{ token: string } | { why: string }> {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) return { why: 'the job has no OIDC token to request (it needs `id-token: write`)' };
  try {
    const request = new URL(url);
    request.searchParams.set('audience', AUDIENCE);
    const response = await fetch(request, { headers: { authorization: `bearer ${bearer}` }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!response.ok) return { why: `GitHub answered ${response.status} to the OIDC token request` };
    const { value } = (await response.json()) as { value?: unknown };
    return typeof value === 'string' && value ? { token: value } : { why: 'GitHub answered the OIDC token request with no token' };
  } catch (error) {
    return { why: `the OIDC token request failed: ${(error as Error).message}` };
  }
}

/** Try one role with the token, and keep only the answer. */
async function tryRole(role: string, token: string, environment: string, sts: string): Promise<{ answer: Answer; why: string }> {
  const body = new URLSearchParams({
    Action: 'AssumeRoleWithWebIdentity',
    Version: '2011-06-15',
    RoleArn: role,
    RoleSessionName: `kanon-probe-${environment}`.replace(/[^\w+=,.@-]/g, '-').slice(0, 64),
    WebIdentityToken: token,
    DurationSeconds: '900',
  });
  try {
    const response = await fetch(sts, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8', accept: 'application/xml' },
      body,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const text = await response.text();
    if (response.ok && text.includes('<Credentials>')) return { answer: 'obtained', why: 'STS handed out a credential, which the probe dropped' };
    const code = /<Code>([^<]*)<\/Code>/.exec(text)?.[1] ?? `HTTP ${response.status}`;
    const message = /<Message>([^<]*)<\/Message>/.exec(text)?.[1] ?? '';
    return { answer: code === 'AccessDenied' ? 'refused' : 'unconfigured', why: `${code}${message ? `: ${message}` : ''}` };
  } catch (error) {
    return { answer: 'unconfigured', why: `STS could not be reached: ${(error as Error).message}` };
  }
}

export async function probe(environments: string[], env: Env, { sts = STS, log = () => {} }: Options = {}): Promise<Record<string, Answer>> {
  const targets = targetsOf(env);
  const answers: Record<string, Answer> = {};
  let token: { token: string } | { why: string } | null = null;
  for (const environment of environments) {
    const role = targets[environment];
    if (typeof role !== 'string' || !role) {
      answers[environment] = 'unconfigured';
      log(`${environment}: unconfigured (KANON_DEPLOY_TARGETS names no role for it)`);
      continue;
    }
    token ??= await oidcToken(env);
    if ('why' in token) {
      answers[environment] = 'unconfigured';
      log(`${environment}: unconfigured (${token.why})`);
      continue;
    }
    const { answer, why } = await tryRole(role, token.token, environment, sts);
    answers[environment] = answer;
    log(`${environment}: ${answer} (${role}: ${why})`);
  }
  return answers;
}

/** The hook's step: probe the listed environments, and write the answers where Kanon's judge reads them. */
export async function main(env: Env, options: Options = {}): Promise<Record<string, Answer>> {
  const runnerTemp = env.RUNNER_TEMP;
  if (!runnerTemp) throw new Error('RUNNER_TEMP is not set, so there is nowhere to write the probe\'s answer.');
  const environments = (env.ENVIRONMENTS ?? '').split(/[\s,]+/).filter(Boolean);
  const answers = await probe(environments, env, options);
  writeFileSync(join(runnerTemp, 'kanon-deploy-probe.json'), JSON.stringify(answers));
  return answers;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.env, { log: line => console.log(line) }).then(
    answers => console.log(`Wrote ${JSON.stringify(answers)} to $RUNNER_TEMP/kanon-deploy-probe.json.`),
    error => {
      console.error(`::error::${(error as Error).message}`);
      process.exit(1);
    },
  );
}
