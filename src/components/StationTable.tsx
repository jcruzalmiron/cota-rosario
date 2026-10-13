"use client";

import { useId, useMemo, useState } from "react";
import type { RiverStation } from "@/lib/river";
import { hasUsableThresholds } from "@/lib/risk";
import { fechaHoraArgentina } from "@/lib/time";

const PAGE_SIZE = 25;

interface StationTableProps {
  estaciones: RiverStation[];
}

type Filtro = "todas" | "con-umbral" | "sobre-alerta";

const FILTROS: { clave: Filtro; etiqueta: string }[] = [
  { clave: "todas", etiqueta: "Todas" },
  { clave: "con-umbral", etiqueta: "Con umbral válido" },
  { clave: "sobre-alerta", etiqueta: "Sobre alerta" },
];

export function StationTable({ estaciones }: StationTableProps) {
  const [filtro, setFiltro] = useState<Filtro>("con-umbral");
  const [busqueda, setBusqueda] = useState("");
  const [visibles, setVisibles] = useState(PAGE_SIZE);
  const inputId = useId();

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return estaciones.filter((estacion) => {
      const usable = hasUsableThresholds(estacion);
      if (filtro === "con-umbral" && !usable) {
        return false;
      }
      if (filtro === "sobre-alerta" && (!usable || estacion.metros < (estacion.alerta as number))) {
        return false;
      }
      if (termino && !`${estacion.nombre} ${estacion.rio}`.toLowerCase().includes(termino)) {
        return false;
      }
      return true;
    });
  }, [estaciones, filtro, busqueda]);

  const conUmbral = estaciones.filter(hasUsableThresholds).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((opcion) => (
          <button
            key={opcion.clave}
            type="button"
            onClick={() => {
              setFiltro(opcion.clave);
              setVisibles(PAGE_SIZE);
            }}
            aria-pressed={filtro === opcion.clave}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              filtro === opcion.clave ? "border-ink-soft text-ink" : "border-rule text-ink-soft hover:text-ink"
            }`}
          >
            {opcion.etiqueta}
          </button>
        ))}
        <input
          id={inputId}
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value);
            setVisibles(PAGE_SIZE);
          }}
          placeholder="Buscar estación o río"
          aria-label="Buscar estación o río"
          className="ml-auto min-w-0 flex-1 rounded-lg border border-rule bg-panel-soft px-3 py-1.5 text-xs outline-none placeholder:text-ink-faint focus:border-ink-soft sm:max-w-56 sm:flex-none"
        />
      </div>

      <p className="text-xs leading-relaxed text-ink-soft">
        Esta consulta devuelve {estaciones.length} estaciones; {conUmbral} tienen un umbral de alerta positivo y utilizable.
        Las restantes no se comparan con alerta. La tabla conserva sus lecturas con fecha; los indicadores de red usan sólo las de hasta 48 horas.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="meta px-2 pb-2">Estación</th>
              <th className="meta px-2 pb-2">Río</th>
              <th className="meta px-2 pb-2 text-right">Altura</th>
              <th className="meta px-2 pb-2 text-right">Alerta</th>
              <th className="meta px-2 pb-2 text-right">Evacuación</th>
              <th className="meta px-2 pb-2">Tendencia</th>
              <th className="meta px-2 pb-2">Medición</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, visibles).map((estacion) => {
              const usable = hasUsableThresholds(estacion);
              const sobre = usable && estacion.metros >= (estacion.alerta as number);
              return (
                <tr key={`${estacion.nombre}-${estacion.rio}`} className="border-b border-rule-soft">
                  <td className="px-2 py-2 text-ink">{estacion.nombre}</td>
                  <td className="px-2 py-2 text-xs text-ink-soft">{estacion.rio}</td>
                  <td className={`readout px-2 py-2 text-right ${sobre ? "text-alerta" : "text-ink"}`}>{estacion.metros.toFixed(2)}</td>
                  <td className="readout px-2 py-2 text-right text-ink-soft">{usable ? (estacion.alerta as number).toFixed(2) : "—"}</td>
                  <td className="readout px-2 py-2 text-right text-ink-soft">
                    {estacion.evacuacion !== null && estacion.evacuacion > 0 ? estacion.evacuacion.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-soft">{estacion.tendencia}</td>
                  <td className="readout whitespace-nowrap px-2 py-2 text-xs text-ink-soft">{Number.isFinite(Date.parse(estacion.fecha)) ? fechaHoraArgentina(estacion.fecha) : "Sin fecha válida"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="meta">
          {Math.min(visibles, filtradas.length)} de {filtradas.length}
        </span>
        {visibles < filtradas.length ? (
          <button type="button" onClick={() => setVisibles((current) => current + PAGE_SIZE)} className="text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
            Ver más
          </button>
        ) : null}
      </div>
    </div>
  );
}
