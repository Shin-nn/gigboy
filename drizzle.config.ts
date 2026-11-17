import { defineConfig } from 'drizzle-kit';
import { resolveDialect } from './server/db/dialect';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required.');
}

// Postgres and SQLite keep separate schema files and migration histories; DATABASE_URL picks which
// one `npm run db:generate` works on. After a schema change, generate for both:
//   DATABASE_URL=postgres://… npm run db:generate
//   DATABASE_URL=file:./data/gigboy.db npm run db:generate
export default resolveDialect(connectionString) === 'sqlite'
  ? defineConfig({
      schema: './server/db/schema.sqlite.ts',
      out: './server/db/migrations-sqlite',
      dialect: 'sqlite',
      dbCredentials: { url: connectionString },
    })
  : defineConfig({
      schema: './server/db/schema.pg.ts',
      out: './server/db/migrations',
      dialect: 'postgresql',
      dbCredentials: { url: connectionString },
    });
