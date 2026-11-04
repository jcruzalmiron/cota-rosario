import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db";

// Las migraciones se leen en runtime desde el directorio del proyecto (no se empaquetan).
const MIGRATIONS_DIR = join(/* turbopackIgnore: true */ process.cwd(), "migrations");

/** Aplica migraciones SQL versionadas en orden; cada una en su transacción. */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const applied = new Set(
    (await db.query<{ name: string }>("SELECT name FROM schema_migration")).rows.map((r) => r.name),
  );
  const files = readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.endsWith(".sql")).sort();
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(/* turbopackIgnore: true */ dir, file), "utf8");
    await db.tx(async (q) => {
      for (const statement of splitStatements(sql)) await q.query(statement);
      await q.query("INSERT INTO schema_migration (name) VALUES ($1)", [file]);
    });
    newlyApplied.push(file);
  }
  return newlyApplied;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}
