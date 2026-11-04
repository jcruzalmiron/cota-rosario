import type { Db } from "../db/db";
import { requireRole, type Actor } from "./auth";

/**
 * O5 · Métricas operativas. Cada una declara evento inicial y final, unidad,
 * universo y exclusiones, y devuelve el denominador y los casos excluidos.
 * Las definiciones son propuestas para validar con jefes de guardia.
 */
export interface MetricDefinition {
  key: string;
  title: string;
  start: string;
  end: string;
  unit: "min" | "casos";
  universe: string;
  exclusions: string;
}

export interface DurationMetric extends MetricDefinition {
  unit: "min";
  n: number;
  excluded: number;
  median: number | null;
  p90: number | null;
  max: number | null;
}

export interface CountMetric extends MetricDefinition {
  unit: "casos";
  value: number;
  of: number | null;
}

export const DEFINITIONS = {
  despachoArribo: {
    key: "despacho_arribo", title: "Despacho → arribo", start: "despacho del móvil", end: "primer arribo registrado (hora observada)",
    unit: "min", universe: "despachos del período, no cancelados", exclusions: "despachos sin arribo registrado (se cuentan aparte)",
  },
  primeraNovedad: {
    key: "primera_novedad", title: "Demora de la primera novedad", start: "despacho del móvil", end: "primera novedad válida de cualquier tipo",
    unit: "min", universe: "despachos del período, no cancelados", exclusions: "despachos sin ninguna novedad",
  },
  avisosAcuse: {
    key: "avisos_acuse", title: "Demora de acuse de avisos", start: "emisión del aviso por falta de novedad", end: "acuse del operador",
    unit: "min", universe: "avisos emitidos en el período", exclusions: "avisos sin acuse",
  },
  panoramasPendientes: {
    key: "panoramas_pendientes", title: "Panoramas pendientes", start: "arribo sin panorama", end: "carga del panorama",
    unit: "casos", universe: "móviles en servicio al corte que registraron arribo", exclusions: "—",
  },
  movimientosSinConfirmar: {
    key: "movimientos_sin_confirmar", title: "Movimientos de portón sin confirmar", start: "detección o carga", end: "confirmación o descarte",
    unit: "casos", universe: "movimientos del período", exclusions: "duplicados y corregidos",
  },
  salidasSinDespacho: {
    key: "salidas_sin_despacho", title: "Salidas de portón sin despacho vinculado", start: "salida confirmada", end: "vínculo con despacho",
    unit: "casos", universe: "salidas confirmadas del período", exclusions: "—",
  },
} as const satisfies Record<string, MetricDefinition>;

/** Percentil por rango más cercano sobre valores ordenados (sin interpolar). */
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

export function durationStats(def: MetricDefinition, values: (number | null)[]): DurationMetric {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  return {
    ...def, unit: "min",
    n: valid.length,
    excluded: values.length - valid.length,
    median: percentile(valid, 50),
    p90: percentile(valid, 90),
    max: valid.at(-1) ?? null,
  };
}

const mins = (a: Date | string, b: Date | string | null) =>
  b === null ? null : Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 60_000) * 10) / 10;

export interface Threshold {
  key: string;
  field: "median" | "p90" | "value";
  above: number;
}

/** Evalúa umbrales configurados; sin umbrales acordados no hay alertas. */
export function breaches(metrics: (DurationMetric | CountMetric)[], thresholds: Threshold[]) {
  return thresholds.flatMap((t) => {
    const m = metrics.find((x) => x.key === t.key);
    if (!m) return [];
    const v = (m as unknown as Record<string, number | null | undefined>)[t.field];
    return typeof v === "number" && v > t.above ? [{ key: t.key, field: t.field, value: v, above: t.above, title: m.title }] : [];
  });
}

export class MetricsService {
  constructor(private db: Db) {}

  async compute(actor: Actor, from: Date, to: Date) {
    requireRole(actor, "jefe_guardia", "operador");
    const org = actor.organizationId;
    const dispatches = (await this.db.query<{ dispatched_at: Date; arrived_at: Date | null; first_update: Date | null }>(
      `SELECT d.dispatched_at, d.arrived_at,
         (SELECT min(u.observed_at) FROM mobile_update u WHERE u.dispatch_id=d.id) AS first_update
       FROM dispatch d WHERE d.organization_id=$1 AND d.status <> 'cancelado' AND d.dispatched_at BETWEEN $2 AND $3`,
      [org, from, to])).rows;
    const alerts = (await this.db.query<{ fired_at: Date; acked_at: Date | null }>(
      `SELECT a.fired_at, a.acked_at FROM guard_alert a JOIN dispatch d ON d.id=a.dispatch_id
       WHERE d.organization_id=$1 AND a.fired_at BETWEEN $2 AND $3`, [org, from, to])).rows;
    const counts = (await this.db.query<{ panoramas: string; arrived_active: string; pending_moves: string; moves: string; exits: string; exits_unlinked: string }>(
      `SELECT
         (SELECT count(*) FROM dispatch WHERE organization_id=$1 AND status IN ('activo','en_lugar') AND panorama_pending) AS panoramas,
         (SELECT count(*) FROM dispatch WHERE organization_id=$1 AND status IN ('activo','en_lugar') AND arrived_at IS NOT NULL) AS arrived_active,
         (SELECT count(*) FROM vehicle_movement WHERE organization_id=$1 AND status='pendiente_revision' AND occurred_at BETWEEN $2 AND $3) AS pending_moves,
         (SELECT count(*) FROM vehicle_movement WHERE organization_id=$1 AND status IN ('confirmado','pendiente_revision') AND occurred_at BETWEEN $2 AND $3) AS moves,
         (SELECT count(*) FROM vehicle_movement WHERE organization_id=$1 AND status='confirmado' AND direction='salida' AND occurred_at BETWEEN $2 AND $3) AS exits,
         (SELECT count(*) FROM vehicle_movement WHERE organization_id=$1 AND status='confirmado' AND direction='salida' AND dispatch_id IS NULL AND occurred_at BETWEEN $2 AND $3) AS exits_unlinked`,
      [org, from, to])).rows[0];

    const metrics: (DurationMetric | CountMetric)[] = [
      durationStats(DEFINITIONS.despachoArribo, dispatches.map((d) => mins(d.dispatched_at, d.arrived_at))),
      durationStats(DEFINITIONS.primeraNovedad, dispatches.map((d) => mins(d.dispatched_at, d.first_update))),
      durationStats(DEFINITIONS.avisosAcuse, alerts.map((a) => mins(a.fired_at, a.acked_at))),
      { ...DEFINITIONS.panoramasPendientes, unit: "casos", value: Number(counts.panoramas), of: Number(counts.arrived_active) },
      { ...DEFINITIONS.movimientosSinConfirmar, unit: "casos", value: Number(counts.pending_moves), of: Number(counts.moves) },
      { ...DEFINITIONS.salidasSinDespacho, unit: "casos", value: Number(counts.exits_unlinked), of: Number(counts.exits) },
    ];
    return { from, to, metrics };
  }
}
