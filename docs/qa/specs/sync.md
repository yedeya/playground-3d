# User data: the database, the owner's sign-in and sync

What the backend does for the data its owner keeps for months: where that data is stored, who may read it, and how each device's copy and the server's copy stay the same, offline included. Project #8 seeded these clauses. Its brief is `docs/projects/8.md`, and "decision N" below means decision N of that brief. The transport plan's own tables belong to project #9 (`TRANS`): they follow these rules and add none of their own. Every clause is `[seed]` until a human promotes it (`K-SPEC-8`).

**Id prefix:** `SYNC`

## The database

- `[SYNC-1]` `[seed]` Each stage that `sst.config.ts` deploys has its own Aurora PostgreSQL Serverless v2 cluster with the RDS Data API enabled. The cluster scales from 0 ACU, pausing after 5 minutes without activity, to at most 1 ACU. It sits in a VPC with no NAT gateway and no bastion, is not publicly accessible, and is linked to the Next.js site, whose server reaches it only through the Data API. Production's cluster has deletion protection, keeps automated backups for 35 days, and is retained and protected when its stage is removed. Every resource carries the `project` and `stage` tags. The limits are the ones decision 5 records.
- `[SYNC-2]` `[seed]` The schema is declared once, in Drizzle, and every change to it is a migration that `drizzle-kit` generated and that is committed. Applying every committed migration in order to an empty PostgreSQL database yields exactly the tables, columns and indexes the Drizzle schema declares.
- `[SYNC-3]` `[seed]` Every schema change is additive. No committed migration drops, renames or narrows a table or a column, or changes a column's type.
- `[SYNC-4]` `[seed]` The deploy hook applies every pending migration to the stage's cluster through the Data API, after `sst deploy` and before the smoke hook runs. A migration that fails fails the deploy job, and applying the migrations to a cluster that is already up to date changes nothing.
- `[SYNC-5]` `[seed]` Every table that holds user data has a non-null `account_id` that references `accounts`, and every read and write of such a table is limited to the account of the request's session. An account named in a request's body, path or query never chooses rows. This holds for every table added later as well.

## The owner's sign-in

- `[SYNC-6]` `[seed]` Unless decision 1 records another method, the owner signs in with one passphrase. The server keeps only a salted scrypt hash of it, as a stage secret, and compares in constant time. A successful sign-in sets one session cookie, signed with the session-key secret and naming the owner's one fixed account id, that is `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to `/` and valid for 400 days, and each successful sync renews it. A wrong passphrase answers 401 and sets no cookie. While the hash secret holds its placeholder value, every sign-in fails.
- `[SYNC-7]` `[seed]` Every route under `/api/` other than sign-in and sign-out answers 401 to a request without a valid session, and such a request neither reads nor writes the database. Signing in neither reads nor writes any table either. A request that changes data is accepted only as `application/json` from the app's own origin. Changing the session-key secret ends every session.
- `[SYNC-8]` `[seed]` Signing out ends the session on that device only, and deletes that device's local copy of the user data and its outbox. While the outbox holds changes not yet saved, signing out is refused, and the app says how many changes are unsaved. The texts are the ones decision 3 records.

## The sync protocol

- `[SYNC-9]` `[seed]` Synced data is a set of named collections, each listed once in the sync registry with its Drizzle table and a validator for its fields. A record has a string id that the client chooses, unique within its collection and account, its fields, a `version` the server assigns, and a `deleted` flag. A collection is added with a table and a registry entry, with no change to the sync routes.
- `[SYNC-10]` `[seed]` A pull, `GET /api/sync?since=<cursor>`, returns the session account's records across every collection whose version is above the cursor, deleted records as tombstones, in version order. It returns at most 500 records per response, with the cursor to ask for next and whether more remain. A pull from `since=0` returns the account's whole state.
- `[SYNC-11]` `[seed]` A push, `POST /api/sync`, carries the protocol version and an ordered batch of mutations. Each mutation has a mutation id the client chooses, a collection, a record id, and either the record's fields or a delete. The server applies the batch in order, in one transaction, one push at a time per account. That transaction first creates the session account's `accounts` row if it does not exist yet, so an account's first push is what brings its row into existence; nothing else creates it. The server gives each record it writes a version above every version the account had before. A mutation id that was already applied is skipped, so a retried batch changes nothing. A batch that holds an invalid mutation is refused whole, with 400 and the mutation named.
- `[SYNC-12]` `[seed]` Unless decision 2 records another rule, when two devices change the same record, the change that reaches the server last wins, for the whole record. A delete is a change like any other.
- `[SYNC-13]` `[seed]` A request that meets a cluster still resuming from its pause answers 503 with `Retry-After` and changes nothing. A push carrying a protocol version the server does not accept answers 409.

## The device's copy

- `[SYNC-14]` `[seed]` The app reads user data only from the device's IndexedDB copy, so it reads the same offline as online. A change is applied to that copy at once and queued in an outbox that survives a reload and a restart of the app.
- `[SYNC-15]` `[seed]` The app syncs, pushing its outbox and then pulling, when it starts, when the device comes back online, within 2 seconds of a change, and when the app becomes visible again. It never syncs on a timer alone. A change leaves the outbox only once the server has confirmed it. On 401, 409 or 503, on a refused batch, or with no network, the outbox keeps every change and the app tries again later: after sign-in on 401, after an update on 409, and with backoff otherwise.
- `[SYNC-16]` `[seed]` The app always shows the sync state: everything saved; the number of changes not yet saved, and whether the device is offline; or that sign-in is needed to save. The Dutch texts are the ones decision 3 records.
- `[SYNC-17]` `[seed]` Once the owner has signed in, the app asks the browser to keep its storage persistent (`navigator.storage.persist()`).

## Delivery

- `[SYNC-18]` `[seed]` On staging and on production, the owner has set the passphrase hash and the session key, installed the app on two real devices, signed in inside each installed app, and recorded a pass or fail for each step of the check on the project's human-action issue.
