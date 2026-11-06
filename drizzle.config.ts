// drizzle-kit's configuration: the one schema module, and the folder it writes each generated migration to
// (`npm run db:generate`). docs/qa/stack.md's `## Schema changes` is the ritual around it.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  strict: true,
  verbose: true,
});
