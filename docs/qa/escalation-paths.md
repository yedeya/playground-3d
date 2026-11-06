# Escalation paths

The project's escalation file (`K-LAYOUT-8`), declared by decision 4 of `docs/projects/8.md` (answered by the Owner on 2026-11-05). This repository has no Merger lane, so a person merges every pull request whatever this file says. The entries label the backend's pull requests in telemetry today, and they are what a Merger, once installed, sends to a person.

## Escalation paths

- `^src/server/db/migrations/` `migrations` — the database's generated migrations, which the deploy applies to production's only cluster (`[SYNC-2]`, `[SYNC-3]`, `[SYNC-4]`)
- `^src/server/db/schema` `schema` — the one Drizzle schema the migrations are generated from, and the account rule every table keeps (`[SYNC-2]`, `[SYNC-5]`)
- `^src/server/auth/` `auth` — the owner's sign-in and the session that scopes every read and write of user data (`[SYNC-6]`, `[SYNC-7]`)
- `^sst\.config\.ts$` `infra` — the infrastructure every deploy creates: the site and, from project #8 on, the database cluster (`[PLAT-6]`, `[SYNC-1]`)

## Pipeline code

None: the project's own pipeline is under `.github/`, which escalates whatever this file says (`K-MERGE-4`).

## Bail list

The Implementer stops on each of these and hands off with a plan (`K-AGENT-13`). They repeat the implement lane's built-in list:

- a data migration: backfilling or transforming existing rows
- an auth, credential or security change
- a destructive schema change: dropping, renaming or narrowing a column or a table
