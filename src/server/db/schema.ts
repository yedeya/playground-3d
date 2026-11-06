// The database's one schema ([SYNC-2] in docs/qa/specs/sync.md). Every change here is followed by `npm run db:generate`
// and is additive only ([SYNC-3]); docs/qa/stack.md's `## Schema changes` is the ritual, and its `## Data isolation`
// the rule every table of user data keeps ([SYNC-5]): a non-null `account_id` that references `accounts`.
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The one owner's account id. There is one owner (decision 1 of docs/projects/8.md), so the session cookie carries
 * this id and signing in reads no table. Never change it: every row of user data names it.
 */
export const OWNER_ACCOUNT_ID = '6f1b2c4e-8d3a-4f57-9b0e-2a7c5d913e48';

/**
 * One row per account. No migration and no sign-in creates a row: an account's first push does, inside that push's
 * transaction ([SYNC-11]).
 */
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
