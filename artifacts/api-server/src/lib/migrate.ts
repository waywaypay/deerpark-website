// Minimal data-migration runner. Runs SQL files from lib/db/migrations/ in
// filename order, tracking applied filenames in a `data_migrations` table so
// each migration only runs once.
//
// Use this for one-off corrective updates (data backfills, name fixes) where
// the change is intentional and tied to a single deploy. Schema changes that
// must apply to live data on every boot belong in the existing self-healing
// `ensureSchema()` patterns — those are idempotent and cheap to re-run, while
// migrations here are explicitly one-shot.
//
// Directives: a migration file whose first non-empty line is exactly
// `-- @no-transaction` is executed OUTSIDE a transaction. Use this for
// statements Postgres refuses to run inside a transaction block — most
// commonly `CREATE INDEX CONCURRENTLY`, which we want on tables that
// already front production traffic. The bookkeeping insert into
// `data_migrations` still happens, just not atomically with the SQL — so
// a no-transaction migration that partially applies will be RE-RUN on
// next boot. Keep each `@no-transaction` migration narrowly scoped to
// statements that are themselves idempotent (`CREATE INDEX CONCURRENTLY
// IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc).

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger";

// __dirname depends on how the server is launched:
//   - dev (tsx, src/lib/migrate.ts):  artifacts/api-server/src/lib  → 4 up
//   - dev-build (dist/, monorepo):    artifacts/api-server/dist      → 3 up
//   - prod (Fly runtime image):       /app/dist                      → 1 up
//     (Dockerfile copies lib/db/migrations to /app/lib/db/migrations
//     alongside the dist bundle.)
// Walk all three candidates, take the first that exists.
function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, "..", "lib", "db", "migrations"),                   // prod
    path.resolve(__dirname, "..", "..", "..", "lib", "db", "migrations"),       // dev-build
    path.resolve(__dirname, "..", "..", "..", "..", "lib", "db", "migrations"), // dev (tsx)
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0]!;
}

export async function runDataMigrations(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS data_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = resolveMigrationsDir();
  if (!existsSync(dir)) {
    logger.warn({ dir }, "Data migrations: directory not found, skipping");
    return;
  }

  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = await db.execute(sql`
      SELECT filename FROM data_migrations WHERE filename = ${file}
    `);
    const rows = (existing as { rows?: unknown[] }).rows ?? [];
    if (rows.length > 0) continue;

    const fullPath = path.join(dir, file);
    const content = await readFile(fullPath, "utf8");
    const noTransaction = /^\s*--\s*@no-transaction\s*$/m.test(
      content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "",
    );
    logger.info({ file, noTransaction }, "Data migration: applying");

    if (noTransaction) {
      // CONCURRENTLY-style statements can't run in a transaction. We
      // execute outside a tx and rely on the migration body being made
      // up of statements that are themselves idempotent — the directive
      // contract states this. Bookkeeping is a separate insert; a crash
      // between the two re-runs the migration on the next boot, which
      // the idempotent statements will tolerate.
      await db.execute(sql.raw(content));
      await db.execute(sql`INSERT INTO data_migrations (filename) VALUES (${file})`);
    } else {
      // Run the SQL and the bookkeeping insert in a single transaction so
      // a partial apply can't leave us thinking a migration ran when it
      // didn't.
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(content));
        await tx.execute(sql`INSERT INTO data_migrations (filename) VALUES (${file})`);
      });
    }
    logger.info({ file }, "Data migration: applied");
  }
}
