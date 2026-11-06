# Stack

The project's stack document (`K-LAYOUT-17`), started by `kanon init`. The sections it leaves out mean their documented defaults.

## Gates

1. `npm test`
2. `npm run typecheck`
3. `npm run build`

## Schema changes

The database's schema is declared once, in Drizzle, in `src/server/db/schema.ts`, and every change to it is a migration that `drizzle-kit` generated into `src/server/db/migrations/` and that is committed (`[SYNC-2]` in `docs/qa/specs/sync.md`). To change it:

1. Edit `src/server/db/schema.ts`, additively only: add a table, a nullable column, a column with a default, or an index. Never drop, rename or narrow a table or a column, and never change a column's type (`[SYNC-3]`). A new table of user data follows `## Data isolation`.
2. Run `npm run db:generate -- --name <what-it-adds>`, as in `npm run db:generate -- --name sync_tables`. If `drizzle-kit` asks whether a column or a table was renamed, it was not: answer that it is created, because a rename is a destructive change.
3. Commit the schema edit, the new `src/server/db/migrations/<NNNN>_<name>.sql`, its `src/server/db/migrations/meta/<NNNN>_snapshot.json` and the updated `src/server/db/migrations/meta/_journal.json` together, in the same pull request.
4. Never hand-edit a generated migration, and never edit or delete a committed one. A migration that turns out wrong is answered by a new, additive one.
5. Run `npm test`. `tests/database.test.ts` applies every migration to PGlite and compares the result with the schema (`[SYNC-2]`), refuses a migration that drops, renames, narrows or retypes (`[SYNC-3]`), and runs the isolation checks below.

The pull request states, in its body, that the deploy applies the migration: the deploy hook applies every pending migration to production's cluster after `sst deploy` and before the smoke hook (`[SYNC-4]`), when the Owner approves the release's production deploy. There is no staging, so production is where a migration first runs on Aurora (decision 5 of `docs/projects/8.md`). Until project #8's Issue C adds the cluster and that deploy step, no deploy applies migrations, and the pull request says that instead.

## Data isolation

Every table that holds user data has a non-null `account_id` that references `accounts(id)`, and every read and write of such a table is limited to the account of the request's session. An account named in a request's body, path or query never chooses rows. This holds for every table added later, and `accounts` itself is the only table without an `account_id` (`[SYNC-5]`). There is one owner today, whose fixed account id is `OWNER_ACCOUNT_ID` in `src/server/db/schema.ts`, and the session carries it.

The checks, which `npm test` runs:

- `npx vitest run tests/database.test.ts`: every table but `accounts`, in the schema module and in a database built from every migration, has a non-null `account_id` with a foreign key to `accounts`.
- From project #8's Issue F on, the sync routes' tests run with two accounts and prove that a session reads and writes only its own account's rows.

A change that fails either never merges.

## Generated files

- `src/server/db/migrations/`: `drizzle-kit`'s. Each migration is a `<NNNN>_<name>.sql` file with its snapshot in `meta/<NNNN>_snapshot.json`, and `meta/_journal.json` lists them in order. `npm run db:generate` writes all three; none is written by hand. They are generated code in the `src/` area, and the only JSON tracked under `src/` (`[MODEL-9]`'s guard in `tests/model-load.test.tsx` allows these two names and no other). After a merge conflict in the folder, which comes from two branches each generating the next migration: take the default branch's `src/server/db/migrations/` whole, delete your branch's own migration from it (its SQL file and its snapshot), resolve `src/server/db/schema.ts` so it holds both sides' changes, and run `npm run db:generate -- --name <name>` again, so your migration is regenerated after the default branch's. Then run `npm test`.
- `package-lock.json`: take the default branch's, then run `npm install`, so the lock is derived rather than merged.

## Code areas

- `src/` — code: the speeltoestel viewer app, and under `src/server/` the backend: the Drizzle schema (`src/server/db/schema.ts`), its generated migrations (`src/server/db/migrations/`, see `## Generated files`) and sign-in (`src/server/auth/`, empty until project #8's Issue E)
- `model/` — code: the model generator: the TypeScript one `npm run model` runs (`model/generator.ts`, its GLB writer `model/glb.ts` and its command line `model/cli.ts`)
- `tests/` `vitest` — tests: unit tests of the model data, the part helpers and the model generator

An area is a directory, so the configuration files at the repository's root, `drizzle.config.ts` (`drizzle-kit`'s, naming the schema and the migrations folder) among them, are in none.
