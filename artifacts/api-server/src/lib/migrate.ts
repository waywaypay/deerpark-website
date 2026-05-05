// Minimal data-migration runner. Runs SQL files from lib/db/migrations/ in
// filename order, tracking applied filenames in a `data_migrations` table so
// each migration only runs once.
//
// Use this for one-off corrective updates (data backfills, name fixes) where
// the change is intentional and tied to a single deploy. Schema changes that
// must apply to live data on every boot belong in the existing self-healing
// `ensureSchema()` patterns — those are idempotent and cheap to re-run, while
// migrations here are explicitly one-shot.

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger";

// In dev, __dirname is artifacts/api-server/src/lib. After esbuild the bundle
// lives at artifacts/api-server/dist/index.mjs (the build banner aliases
// __dirname there too). lib/db/migrations is three levels up from either
// location: ../.. (api-server root) → .. (artifacts) → lib/db/migrations.
function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "..", "lib", "db", "migrations"), // src/lib
    path.resolve(__dirname, "..", "..", "..", "lib", "db", "migrations"),       // dist
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
    logger.info({ file }, "Data migration: applying");

    // Run the SQL and the bookkeeping insert in a single transaction so a
    // partial apply can't leave us thinking a migration ran when it didn't.
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(content));
      await tx.execute(sql`INSERT INTO data_migrations (filename) VALUES (${file})`);
    });
    logger.info({ file }, "Data migration: applied");
  }
}
