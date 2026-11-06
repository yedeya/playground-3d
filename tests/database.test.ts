/// <reference types="node" />
// The database's schema and its migrations, held to the SYNC clauses that govern them: one Drizzle schema, migrations
// that drizzle-kit generated and that agree with it ([SYNC-2]), additive changes only ([SYNC-3]), and an account_id on
// every table of user data ([SYNC-5]). Every migration is applied to PGlite, PostgreSQL compiled to WebAssembly, in
// process (decision 9 of docs/projects/8.md), so no test needs a database server.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable, pgTable, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { generateDrizzleJson, generateMigration, pushSchema } from 'drizzle-kit/api';
import { describe, expect, it } from 'vitest';
import drizzleConfig from '../drizzle.config';
import * as schema from '../src/server/db/schema';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationsFolder = `${root}src/server/db/migrations`;
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

type Journal = { dialect: string; entries: { idx: number; tag: string; breakpoints: boolean }[] };
const journal = (): Journal => readJson(`${migrationsFolder}/meta/_journal.json`);
const sqlFiles = () => readdirSync(migrationsFolder).filter(name => name.endsWith('.sql')).sort();

const tables = () => (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map(table => getTableConfig(table));

// A fresh database with every committed migration applied, in the journal's order.
const migrated = async () => {
  const client = new PGlite();
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder });
  return { client, db };
};

// What the database holds, read from its own catalog: each table of the public schema, its columns and its indexes.
type Shape = Record<string, { columns: Record<string, { type: string; notNull: boolean }>; indexes: string[] }>;
const shapeOf = async (client: PGlite): Promise<Shape> => {
  const shape: Shape = {};
  const { rows: columns } = await client.query<{ table_name: string; column_name: string; udt_name: string; is_nullable: string }>(
    `select table_name, column_name, udt_name, is_nullable from information_schema.columns
     where table_schema = 'public' order by table_name, ordinal_position`,
  );
  for (const row of columns) {
    shape[row.table_name] ??= { columns: {}, indexes: [] };
    shape[row.table_name].columns[row.column_name] = { type: row.udt_name, notNull: row.is_nullable === 'NO' };
  }
  const { rows: indexes } = await client.query<{ tablename: string; indexname: string }>(
    `select tablename, indexname from pg_indexes where schemaname = 'public' order by tablename, indexname`,
  );
  for (const row of indexes) shape[row.tablename]?.indexes.push(row.indexname);
  return shape;
};

// The name PostgreSQL's catalog gives the type Drizzle declares, as information_schema.columns.udt_name reads it.
const catalogType = (declared: string) => ({
  'timestamp with time zone': 'timestamptz',
  'timestamp': 'timestamp',
  'integer': 'int4',
  'bigint': 'int8',
  'smallint': 'int2',
  'boolean': 'bool',
  'double precision': 'float8',
  'real': 'float4',
})[declared] ?? declared.replace(/\(.*\)$/, '').replace(/^character varying$/, 'varchar');

// The tables of user data that break [SYNC-5]'s rule, read from a database's catalog: every table but accounts must
// have an account_id that is not null and a foreign key from it to accounts.
const isolationBreaches = async (client: PGlite) => {
  const { rows } = await client.query<{ table_name: string; is_nullable: string | null; references_accounts: boolean }>(
    `select t.table_name, c.is_nullable,
       exists (
         select 1 from information_schema.key_column_usage k
         join information_schema.referential_constraints r on r.constraint_name = k.constraint_name and r.constraint_schema = k.constraint_schema
         join information_schema.constraint_column_usage u on u.constraint_name = r.unique_constraint_name and u.constraint_schema = r.unique_constraint_schema
         where k.table_schema = t.table_schema and k.table_name = t.table_name and k.column_name = 'account_id'
           and u.table_name = 'accounts' and u.column_name = 'id'
       ) as references_accounts
     from information_schema.tables t
     left join information_schema.columns c on c.table_schema = t.table_schema and c.table_name = t.table_name and c.column_name = 'account_id'
     where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and t.table_name <> 'accounts'
     order by t.table_name`,
  );
  return rows
    .filter(row => row.is_nullable !== 'NO' || !row.references_accounts)
    .map(row => row.table_name);
};

// The same rule, read from the schema module's declarations.
const declaredBreaches = (declared: ReturnType<typeof getTableConfig>[]) => declared
  .filter(table => table.name !== 'accounts')
  .filter(table => {
    const accountId = table.columns.find(column => column.name === 'account_id');
    const referencesAccounts = table.foreignKeys.map(key => key.reference()).some(ref =>
      ref.columns.map(column => column.name).join() === 'account_id'
      && getTableConfig(ref.foreignTable).name === 'accounts'
      && ref.foreignColumns.map(column => column.name).join() === 'id');
    return !accountId?.notNull || !referencesAccounts;
  })
  .map(table => table.name);

// A migration's statements, with its comments and quoted text taken out, so a word inside a comment, a string or a
// quoted name is never read as a statement.
const statementsOf = (sql: string) => sql
  .replace(/--[^\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/'(?:[^']|'')*'/g, "''")
  .replace(/"(?:[^"]|"")*"/g, '""')
  .split(';')
  .map(statement => statement.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

// What [SYNC-3] forbids: dropping, renaming, narrowing or emptying a table or a column, or changing a column's type.
const destructive: [string, RegExp][] = [
  ['drops a table, a view, a schema or a type', /\bdrop\s+(table|view|materialized\s+view|schema|type|domain)\b/i],
  ['drops a column', /\balter\s+table\b.*\bdrop\s+(column\b|"")/i],
  ['renames a table, a column or a type', /\brename\b/i],
  ['changes a column\'s type', /\balter\s+(column\s+)?""\s+(set\s+data\s+)?type\b/i],
  ['narrows a column to not null', /\balter\s+(column\s+)?""\s+set\s+not\s+null\b/i],
  ['empties a table', /\b(truncate|delete\s+from)\b/i],
];
const violationsOf = (sql: string) => statementsOf(sql).flatMap(statement =>
  destructive.filter(([, pattern]) => pattern.test(statement)).map(([what]) => `${what}: ${statement}`));

describe('the schema module', () => {
  it('declares the accounts table, one row per account, keyed by its id', () => {
    const accounts = getTableConfig(schema.accounts);
    expect(accounts.name).toBe('accounts');
    const id = accounts.columns.find(column => column.name === 'id');
    expect(id?.primary).toBe(true);
    expect(id?.notNull).toBe(true);
  });

  it('holds the one owner\'s fixed account id as a constant', () => {
    expect(typeof schema.OWNER_ACCOUNT_ID).toBe('string');
    expect(schema.OWNER_ACCOUNT_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('is the schema drizzle.config.ts generates from, into the migrations folder, and npm run db:generate runs drizzle-kit generate', () => {
    expect(drizzleConfig.dialect).toBe('postgresql');
    expect(drizzleConfig.schema).toBe('./src/server/db/schema.ts');
    expect(drizzleConfig.out).toBe('./src/server/db/migrations');
    expect(readJson(`${root}package.json`).scripts['db:generate']).toBe('drizzle-kit generate');
  });
});

describe('the migrations', () => {
  it('[SYNC-2] are drizzle-kit\'s: the journal lists every committed SQL file, in order, each with its snapshot', () => {
    const { dialect, entries } = journal();
    expect(dialect).toBe('postgresql');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map(entry => entry.idx)).toEqual(entries.map((_, index) => index));
    expect(entries.map(entry => `${entry.tag}.sql`)).toEqual(sqlFiles());
    const snapshots = readdirSync(`${migrationsFolder}/meta`).filter(name => name.endsWith('_snapshot.json')).sort();
    expect(snapshots).toEqual(entries.map(entry => `${entry.tag.slice(0, 4)}_snapshot.json`));
  });

  it('[SYNC-2] are up to date: generating from the schema now would add no migration', async () => {
    const { entries } = journal();
    const last = readJson(`${migrationsFolder}/meta/${entries.at(-1)!.tag.slice(0, 4)}_snapshot.json`);
    const current = generateDrizzleJson(schema, last.id);
    expect(await generateMigration(last, current)).toEqual([]);
  });

  it('[SYNC-2] applied in order to an empty database yield exactly the tables, columns and indexes the schema declares', async () => {
    const { client, db } = await migrated();
    // drizzle-kit's own comparison of a live database with the schema: nothing to add, change or remove.
    const { statementsToExecute } = await pushSchema(schema, db as never);
    expect(statementsToExecute).toEqual([]);
    // And the same, read from the database's catalog without drizzle-kit.
    const expected: Shape = {};
    for (const table of tables()) {
      expected[table.name] = {
        columns: Object.fromEntries(table.columns.map(column => [column.name, {
          type: catalogType(column.getSQLType()),
          notNull: column.notNull,
        }])),
        indexes: [
          // A column's own primary key is PostgreSQL's <table>_pkey; a composite one carries the name Drizzle gives it.
          ...(table.columns.some(column => column.primary) ? [`${table.name}_pkey`] : []),
          ...table.primaryKeys.map(key => key.getName()),
          ...table.indexes.map(index => index.config.name!),
          ...table.uniqueConstraints.map(unique => unique.getName()!),
          ...table.columns.filter(column => column.isUnique).map(column => column.uniqueName!),
        ].sort(),
      };
    }
    expect(await shapeOf(client)).toEqual(expected);
    await client.close();
  });

  it('create no accounts row: the account\'s first push is what creates it', async () => {
    const { client } = await migrated();
    expect((await client.query('select * from accounts')).rows).toEqual([]);
    await client.close();
  });

  it('[SYNC-3] are additive: no committed migration drops, renames or narrows a table or a column, or changes a column\'s type', () => {
    const files = sqlFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(violationsOf(readFileSync(`${migrationsFolder}/${file}`, 'utf8')), file).toEqual([]);
    }
  });

  it('the additive check refuses each destructive statement drizzle-kit can write, and passes additive ones', () => {
    for (const sql of [
      'DROP TABLE "accounts" CASCADE;',
      'ALTER TABLE "items" DROP COLUMN "label";',
      'ALTER TABLE "items" DROP COLUMN IF EXISTS "label";',
      'ALTER TABLE "items" RENAME TO "things";',
      'ALTER TABLE "items" RENAME COLUMN "label" TO "name";',
      'ALTER TABLE "items" ALTER COLUMN "label" SET DATA TYPE varchar(20);',
      'ALTER TABLE "items" ALTER COLUMN "label" TYPE integer USING "label"::integer;',
      'ALTER TABLE "items" ALTER COLUMN "label" SET NOT NULL;',
      'DROP TYPE "public"."colour";',
      'ALTER TYPE "public"."colour" RENAME VALUE \'red\' TO \'rood\';',
      'DROP SCHEMA "app";',
      'TRUNCATE "items";',
      'DELETE FROM "items";',
    ]) {
      expect(violationsOf(sql), sql).not.toEqual([]);
    }
    for (const sql of [
      'CREATE TABLE "items" (\n\t"id" text PRIMARY KEY NOT NULL,\n\t"note" text DEFAULT \'drop table x; rename\'\n);',
      'ALTER TABLE "items" ADD COLUMN "label" text;',
      'ALTER TABLE "items" ADD COLUMN "count" integer DEFAULT 0 NOT NULL;',
      'ALTER TABLE "items" ALTER COLUMN "label" DROP NOT NULL;',
      'ALTER TABLE "items" ALTER COLUMN "label" DROP DEFAULT;',
      'ALTER TABLE "items" ADD CONSTRAINT "items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;',
      'CREATE UNIQUE INDEX "items_account_id_id_index" ON "items" USING btree ("account_id","id");',
      '-- rename and drop are only words in a comment\nCREATE TABLE "drop_rename" ("id" text);',
    ]) {
      expect(violationsOf(sql), sql).toEqual([]);
    }
  });
});

describe('data isolation', () => {
  it('[SYNC-5] every table but accounts, in the migrated database, has a non-null account_id that references accounts', async () => {
    const { client } = await migrated();
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(rows.map(row => row.table_name)).toContain('accounts');
    expect(await isolationBreaches(client)).toEqual([]);
    await client.close();
  });

  it('[SYNC-5] every table but accounts, in the schema module, declares a non-null account_id that references accounts', () => {
    expect(tables().map(table => table.name)).toContain('accounts');
    expect(declaredBreaches(tables())).toEqual([]);
  });

  it('the schema module\'s isolation check names a table with no account_id, a nullable one, or one that references nothing', () => {
    const fixtures = [
      pgTable('loose', { id: text('id').primaryKey() }),
      pgTable('nullable', { id: text('id').primaryKey(), accountId: text('account_id').references(() => schema.accounts.id) }),
      pgTable('unreferenced', { id: text('id').primaryKey(), accountId: text('account_id').notNull() }),
      pgTable('scoped', { id: text('id').primaryKey(), accountId: text('account_id').notNull().references(() => schema.accounts.id) }),
    ];
    expect(declaredBreaches([...tables(), ...fixtures.map(getTableConfig)])).toEqual(['loose', 'nullable', 'unreferenced']);
  });

  it('the database\'s isolation check names a table with no account_id, a nullable one, or one that references nothing', async () => {
    const { client } = await migrated();
    await client.exec(`
      create table loose (id text primary key);
      create table nullable (id text primary key, account_id text references accounts(id));
      create table unreferenced (id text primary key, account_id text not null);
      create table scoped (id text primary key, account_id text not null references accounts(id));
    `);
    expect(await isolationBreaches(client)).toEqual(['loose', 'nullable', 'unreferenced']);
    await client.close();
  });
});
