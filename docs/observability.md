# Observability

What each signal playground-3d emits means, and whether it pages (`K-OBS-2`, `K-LAYOUT-5`). Whether a signal may page is decided by Kanon's admission rule, `K-OBS-4`, which this document does not restate.

**Nothing pages.** The Owner decided so on 2026-11-05 (decision 10 of [`docs/projects/6.md`](projects/6.md), §5): the app is a static 3D viewer for one household, nobody depends on it being up, and an alarm would page no one who would answer it. The trigger that changes this is the first backend, [#8](https://github.com/yedeya/playground-3d/issues/8), the first part of the app with data that can be lost.

**The only automated signal from production** is the deploy lane's own. After each approved deploy, Kanon's lane files `Deploy to production failed`, or `Smoke check on production failed` when the release is live and its smoke check (`.github/actions/smoke`) failed, labelled `bug` and `sev:high`, and closes them on the next success ([`docs/lanes.md`](https://github.com/yedeya-labs/kanon/blob/main/docs/lanes.md), "After each environment"). Those issues are the signal, and they need nothing added here.

## Paged signals

<!-- paging-clauses:table -->
| Signal | What it means | Threshold | What a person does |
|---|---|---|---|
<!-- /paging-clauses:table -->

## Not-paged signals

<!-- not-paged-table -->
| Signal | Why it does not page | What would change the answer |
|---|---|---|
| `cloudfront-5xx-rate` | The production distribution's share of 5xx answers, and the server function's errors behind it. No alarm is created: the app is a static viewer for one household, nobody depends on it being up, and a page would cost an alarm no one answers (decision 10). A broken deploy shows in the lane's `Smoke check on production failed` issue instead. | The first backend, [#8](https://github.com/yedeya/playground-3d/issues/8), the first thing with data that can be lost. |
| `browser-errors` | Errors in real users' browsers. Not collected: collecting them needs a third-party script or an endpoint of the app's own, which is #8's territory. | #8's backend, which gives the app an endpoint of its own. |
<!-- /not-paged-table -->

## Hand-created resources

Created by hand by the Owner in [#21](https://github.com/yedeya/playground-3d/issues/21), with its evidence recorded there. The deploy lane's trust probe checks the role refuses a job outside `production` on every release; nothing here has re-checked the configuration itself.

<!-- hand-created:table -->
| Resource | State | Verified |
|---|---|---|
| AWS IAM role `playground-3d-production-deploy`, trusting `infra/aws/production-deploy-role.trust.json` with `AdministratorAccess` | created 2026-11-06 | no |
| AWS IAM OIDC provider `token.actions.githubusercontent.com` | created 2026-11-06 | no |
| GitHub environment `production`, the Owner its required reviewer, deployments from `v*` tags only | created 2026-11-06 | no |
| Repository variable `KANON_DEPLOY_TARGETS` | created 2026-11-06 | no |
<!-- /hand-created:table -->
