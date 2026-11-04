/**
 * Acceso a base. Producción y Docker usan PostgreSQL vía `pg` (DATABASE_URL).
 * Pruebas y arranque local sin Docker usan PGlite (Postgres en WASM) con el
 * mismo SQL. El dominio sólo conoce `Db` y `Queryable`.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class ConflictError extends Error {
  readonly status = 409;
  constructor(message: string, readonly currentVersion?: number) {
    super(message);
  }
}

export class ValidationError extends Error {
  readonly status = 422;
  constructor(message: string, readonly fields: { field: string; message: string }[] = []) {
    super(message);
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
}

export class NotFoundError extends Error {
  readonly status = 404;
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) (await import("node:fs")).mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  // PGlite ejecuta una consulta por vez; serializamos transacciones para
  // reproducir el aislamiento que daría un pool real.
  let chain: Promise<unknown> = Promise.resolve();
  const db: Db = {
    query: (sql, params) => pg.query(sql, params as unknown[]) as never,
    tx<T>(fn: (q: Queryable) => Promise<T>) {
      const run = chain.then(() =>
        pg.transaction(async (t) => fn({ query: (s, p) => t.query(s, p as unknown[]) as never })),
      );
      chain = run.catch(() => undefined);
      return run as Promise<T>;
    },
    close: () => pg.close(),
  };
  return db;
}

export async function createPgDb(connectionString: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString, max: 10 });
  return {
    query: (sql, params) => pool.query(sql, params as unknown[]) as never,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (s, p) => client.query(s, p as unknown[]) as never });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function createDbFromEnv(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return createPgDb(url);
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL es obligatorio en producción.");
  }
  return createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite");
}
