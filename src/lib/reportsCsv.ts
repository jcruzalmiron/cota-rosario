import { REPORT_STATUSES, REPORT_TYPES, type OpsReport } from "@/lib/reportTypes";
import { argentinaStamp } from "@/lib/time";

const HEADER = ["id", "creado", "tipo", "estado", "estado_desde", "resuelto", "distrito", "latitud", "longitud", "descripcion", "confirmaciones", "nota_publica", "ultimo_cambio_por", "ultima_nota_interna"];
const FORMULA_START = /^[=+\-@\t\r]/;

/** Celda CSV: antepone un apóstrofo a los textos que una planilla leería como fórmula y escapa comillas, separadores y saltos de línea. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV de reclamos para operaciones: separado por punto y coma (Excel en es-AR), UTF-8 con BOM, horas de Argentina (AAAA-MM-DD HH:mm). */
export function reportsCsv(reports: readonly OpsReport[]): string {
  const rows = reports.map((report) => {
    const last = report.history.at(-1);
    return [
      report.id,
      argentinaStamp(report.createdAt),
      REPORT_TYPES[report.type].label,
      REPORT_STATUSES[report.status].label,
      argentinaStamp(report.statusAt),
      report.resolvedAt ? argentinaStamp(report.resolvedAt) : "",
      report.district,
      report.lat,
      report.lon,
      report.description,
      report.confirmations,
      report.publicNote,
      last?.by,
      last?.note,
    ];
  });
  return `﻿${[HEADER, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
