import "server-only";
import { createDbFromEnv, type Db } from "../db/db";
import { migrate } from "../db/migrate";
import { systemClock } from "../domain/clock";
import { CrmService } from "../domain/crm";
import { GateService } from "../domain/gate";
import { MetricsService } from "../domain/metrics";
import { GuardService } from "../domain/guard";
import { IncidentService } from "../domain/incidents";
import { JobRunner } from "../domain/jobs";
import { LogbookService } from "../domain/logbook";
import { ReportService } from "../domain/reports";
import { PROVISIONAL_TEMPLATE } from "../domain/report-template";
import { loadConfig } from "./config";

export interface Services {
  db: Db;
  incidents: IncidentService;
  guard: GuardService;
  logbook: LogbookService;
  reports: ReportService;
  crm: CrmService;
  gate: GateService;
  metrics: MetricsService;
}

const g = globalThis as unknown as { __services?: Promise<Services>; __inlineWorker?: NodeJS.Timeout };

export function services(): Promise<Services> {
  // Si el arranque falla (base caída, config inválida) no se cachea el error: el próximo request reintenta.
  g.__services ??= build().catch((error) => {
    g.__services = undefined;
    throw error;
  });
  return g.__services;
}

async function build(): Promise<Services> {
  const config = loadConfig();
  const db = await createDbFromEnv();
  await migrate(db);
  const clock = systemClock;
  const s: Services = {
    db,
    incidents: new IncidentService(db, clock),
    guard: new GuardService(db, clock, config.alertRule),
    logbook: new LogbookService(db, clock),
    reports: new ReportService(db, clock),
    crm: new CrmService(db, clock),
    gate: new GateService(db, clock, config.qrSecret),
    metrics: new MetricsService(db),
  };
  if (process.env.AUTH_MODE === "dev-local" && process.env.NODE_ENV !== "production") {
    await db.query("INSERT INTO organization (id, name) VALUES ('cuartel-local','Cuartel local de prueba') ON CONFLICT DO NOTHING");
    // Inventario ficticio para probar el portón en local.
    const jefeLocal = { id: "sistema", organizationId: "cuartel-local", roles: ["jefe_guardia" as const] };
    for (const [code, label] of [["M-1", "Autobomba (ficticia)"], ["M-2", "Cisterna (ficticia)"], ["M-3", "Rescate (ficticio)"]]) {
      await s.gate.addVehicle(jefeLocal, code, label);
    }
    await s.gate.addGate(jefeLocal, "P1", "Portón principal");
  }
  await s.reports.ensureTemplate(PROVISIONAL_TEMPLATE.kind, PROVISIONAL_TEMPLATE.version, PROVISIONAL_TEMPLATE.schema, "pendiente_validacion");
  // Sin Postgres (PGlite local) la base no admite otro proceso: el worker corre en el mismo proceso.
  if (!process.env.DATABASE_URL && !g.__inlineWorker) {
    const runner = new JobRunner(db, clock, buildHandlers(s));
    g.__inlineWorker = setInterval(() => void runner.runOnce().catch((e) => console.error("[worker-inline]", e.message)), 5_000);
  }
  return s;
}

export function buildHandlers(s: Pick<Services, "guard" | "crm">) {
  return {
    guard_alert_check: s.guard.alertHandler(),
    crm_reminder: s.crm.reminderHandler(),
  };
}
