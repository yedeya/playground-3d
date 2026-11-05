# Adoption record

`yedeya/playground-3d` adopts Kanon. This is its adoption record (`K-LAYOUT-10`), started by `kanon init` on 2026-11-05. A section or choice it leaves out means its documented default.

## People

| Role | Who |
|---|---|
| Owner | `@yedeya` |
| Maintainer | `@yedeya` |
| Stakeholder | `@yedeya` |

On a personal account a collaborator has write access, with no Triage role, so a Stakeholder who is a collaborator holds more than chapter 03's Triage (`K-ADOPT-2`).

## Plan

`yedeya/playground-3d` is a **public repository on a personal account** (`K-ADOPT-2`). Of the platform features of `K-ADOPT-3`:

- **Rulesets:** available.
- **Merge queue:** not on this plan, so "require branches to be up to date" stays off and the release commit's full CI run catches a stale base (`K-MERGE-7`).
- **Environments:** no Kanon lane needs one.

## Bootstrap

`in bootstrap since 2026-11-05`

## Choices

- **Feature:** `build`
- **Review trigger:** `labelled`
- **Upstream findings:** `sent with evidence`
- **Waived doctor finding:** `label.github-default` on `yedeya/playground-3d` for `documentation`, `duplicate`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix` (kept at adoption: existing and future issues may carry them)
- **Waived doctor finding:** `deploy.reference-undeclared` on `docs/qa/adoption.md` (playground-3d deploys nothing yet: no environments, no Lead projects)

## Data

Whether this repository holds private or sensitive material, as declared at install. The lanes read the files and diffs their work needs either way.

- **Private or sensitive material:** `no`
