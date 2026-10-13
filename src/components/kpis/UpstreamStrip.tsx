import type { UpstreamStation } from "@/lib/kpis";
import { fechaHoraArgentina } from "@/lib/time";

export function UpstreamStrip({ estaciones }: { estaciones: UpstreamStation[] }) {
  return <ol className="flex flex-col gap-3">{estaciones.map((estacion) => <li key={estacion.nombre} className="flex items-start justify-between gap-3 text-xs">
    <span className={estacion.esRosario ? "text-ink font-medium" : "text-ink-soft"}>{estacion.nombre}<span className="mt-1 block text-ink-faint">{fechaHoraArgentina(estacion.fecha)}</span></span>
    <span className="readout text-right text-ink">{estacion.metros.toFixed(2)} m · {estacion.tendencia || "sin tendencia"}<span className={`mt-1 block ${estacion.margenAlertaM !== null && estacion.margenAlertaM <= 0.5 ? "text-atencion" : "text-ink-soft"}`}>{estacion.margenAlertaM === null ? "Sin umbral válido" : `${estacion.margenAlertaM.toFixed(2)} m de margen a alerta`}</span></span>
  </li>)}</ol>;
}
