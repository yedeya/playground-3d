# The platform

What the app is built with and how it reaches its environments: the language, the framework, the infrastructure and the hooks Kanon's deploy lane runs. Project #6 seeded these clauses for the move from Vite and plain JavaScript to TypeScript, Next.js and SST. This area holds only the clauses projects have seeded so far. Every clause is `[seed]` until a human promotes it (`K-SPEC-8`).

**Id prefix:** `PLAT`

## Language and framework

- `[PLAT-1]` `[seed]` The repository tracks no JavaScript source: `git ls-files '*.js' '*.jsx' '*.mjs' '*.cjs'` lists nothing, so the app, its tests and its configuration are TypeScript.
- `[PLAT-2]` `[seed]` `tsconfig.json` sets `strict: true`, and `npm run typecheck` runs `tsc --noEmit` and exits 0.
- `[PLAT-3]` `[seed]` The app is a Next.js App Router app and Vite is gone: `package.json` lists neither `vite` nor `@vitejs/*`, no Vite configuration file is tracked, `npm run build` runs `next build`, and `npm run dev` serves on every network interface, so a phone on the same network can open it.
- `[PLAT-4]` `[seed]` The page serves the document the Vite app served: `lang="nl"`, the title `Speeltoestel ArcticFlyer 3D`, the Barlow and Barlow Condensed fonts, and the elements `#stage`, `#view`, `#title`, `#stats`, `#tools`, `#reset`, `#colour`, `#hint`, `#fail`, `#panel`, `#card`, `#modules` and `#parts`, with their Dutch texts and ARIA attributes unchanged.
- `[PLAT-5]` `[seed]` The viewer and the panel run only in the browser and are torn down on unmount: mounting, unmounting and mounting again, as React's strict mode does in development, leaves one set of module chips, one WebGL renderer and no listener of the first mount subscribed to the store.

## Infrastructure

- `[PLAT-6]` `[seed]` `sst.config.ts` declares one `sst.aws.Nextjs` site for the app and no database, bucket, queue or function of the app's own; it deploys one stage, `production`, in the AWS region `eu-central-1`, with no custom domain, so the site serves on CloudFront's own address; it retains and protects production's resources on removal, and tags every resource it creates with `project` set to `playground-3d` and `stage` set to the stage's name.
- `[PLAT-7]` `[seed]` The one AWS deploy role, production's, trusts only GitHub's OIDC provider, with the audience `sts.amazonaws.com` and, by exact match (`StringEquals`), the subject `repo:yedeya@46228687/playground-3d@1446091910:environment:production`. The repository holds that trust policy as a file under `infra/aws/`, which names no branch, tag or wildcard, and no file under `infra/aws/` holds an AWS account id.

## The deploy hooks

- `[PLAT-8]` `[seed]` The build hook builds the app once, from the checked-out commit, holding no credential, and fills its `output` directory with everything the deploy hook needs, the OpenNext build included; it fails when the build fails.
- `[PLAT-9]` `[seed]` The deploy hook obtains the environment's AWS credential through GitHub's OIDC token for the role `KANON_DEPLOY_TARGET` names, and deploys the build hook's artifact with `sst deploy --stage <environment>` without building the app again. With `probe: 'true'` it deploys nothing: it tries each listed environment's role and writes `refused`, `obtained` or `unconfigured` for each to `$RUNNER_TEMP/kanon-deploy-probe.json`.
- `[PLAT-10]` `[seed]` The smoke hook fetches the environment's deployed URL and fails unless the page answers 200 with the title `Speeltoestel ArcticFlyer 3D` and every script the page references also answers 200.
- `[PLAT-11]` `[seed]` The adoption record's `## Deploy` section declares one environment, `production`, and `production` as the reference environment, deployed by the workflow `deploy.yml` in the job `production / deploy`; the record no longer waives `deploy.reference-undeclared`.
