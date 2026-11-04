/**
 * Worker separado (Docker / producción con Postgres). Procesa avisos de guardia
 * y recordatorios del CRM desde la cola durable. Al reiniciar retoma los vencidos.
 */
import { createDbFromEnv } from "../db/db";
import { migrate } from "../db/migrate";
import { systemClock } from "../domain/clock";
import { CrmService } from "../domain/crm";
import { GuardService } from "../domain/guard";
import { JobRunner } from "../domain/jobs";
import { loadConfig } from "../server/config";

if (!process.env.DATABASE_URL) {
  console.error("El worker separado requiere DATABASE_URL (Postgres). Con PGlite local corre dentro de la web.");
  process.exit(1);
}
const config = loadConfig();
const db = await createDbFromEnv();
await migrate(db);
const guard = new GuardService(db, systemClock, config.alertRule);
const crm = new CrmService(db, systemClock);
const runner = new JobRunner(db, systemClock, {
  guard_alert_check: guard.alertHandler(),
  crm_reminder: crm.reminderHandler(),
});

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
console.log("[worker] listo");
while (!stopping) {
  try {
    const { done, failed } = await runner.runOnce(20);
    if (done || failed) console.log(`[worker] hechos=${done} fallidos=${failed}`);
  } catch (e) {
    console.error("[worker]", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 2_000));
}
await db.close();
