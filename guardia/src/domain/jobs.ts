import type { Db, Queryable } from "../db/db";
import type { Clock } from "./clock";

export interface JobRow {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  run_at: Date;
  attempts: number;
  max_attempts: number;
}

/** Encola de forma idempotente: la misma clave nunca crea dos jobs. */
export async function enqueue(q: Queryable, kind: string, payload: Record<string, unknown>, key: string, runAt: Date) {
  await q.query(
    `INSERT INTO job (kind, payload, idempotency_key, run_at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [kind, JSON.stringify(payload), key, runAt],
  );
}

/** Cancela jobs pendientes por prefijo de clave, salvo la clave que se conserva. */
export async function cancelJobs(q: Queryable, keyPrefix: string, exceptKey: string | null = null) {
  await q.query(
    `UPDATE job SET status='cancelado'
     WHERE status='pendiente' AND idempotency_key LIKE $1 AND ($2::text IS NULL OR idempotency_key <> $2)`,
    [`${keyPrefix.replace(/[%_\\]/g, "\\$&")}%`, exceptKey],
  );
}

export class PermanentJobError extends Error {}

export type JobHandler = (job: JobRow, ctx: { db: Db; clock: Clock }) => Promise<void>;

export class JobRunner {
  constructor(
    private db: Db,
    private clock: Clock,
    private handlers: Record<string, JobHandler>,
    private leaseMs = 60_000,
  ) {}

  /** Reserva jobs vencidos (incluye reservas expiradas de un worker caído). */
  async claim(limit = 10): Promise<JobRow[]> {
    const now = this.clock.now();
    const { rows } = await this.db.query<JobRow>(
      `UPDATE job SET status='en_curso', attempts=attempts+1, locked_until=$2
       WHERE id IN (
         SELECT id FROM job
         WHERE run_at <= $1 AND (status='pendiente' OR (status='en_curso' AND locked_until < $1))
         ORDER BY run_at LIMIT $3 FOR UPDATE SKIP LOCKED)
       RETURNING id, kind, payload, idempotency_key, run_at, attempts, max_attempts`,
      [now, new Date(now.getTime() + this.leaseMs), limit],
    );
    return rows;
  }

  async runOnce(limit = 10): Promise<{ done: number; failed: number }> {
    const jobs = await this.claim(limit);
    let done = 0;
    let failed = 0;
    for (const job of jobs) {
      const handler = this.handlers[job.kind];
      try {
        if (!handler) throw new PermanentJobError(`Sin handler para ${job.kind}`);
        await handler(job, { db: this.db, clock: this.clock });
        await this.db.query("UPDATE job SET status='hecho', locked_until=NULL WHERE id=$1", [job.id]);
        done++;
      } catch (error) {
        failed++;
        const permanent = error instanceof PermanentJobError || job.attempts >= job.max_attempts;
        const backoffMs = Math.min(2 ** job.attempts * 5_000, 15 * 60_000);
        await this.db.query(
          `UPDATE job SET status=$2, locked_until=NULL, run_at=$3, last_error=$4 WHERE id=$1`,
          [
            job.id,
            permanent ? "fallido" : "pendiente",
            new Date(this.clock.now().getTime() + backoffMs),
            String((error as Error).message ?? error).slice(0, 300),
          ],
        );
      }
    }
    return { done, failed };
  }
}
