"use client";

import { useState } from "react";
import { RISK_FILL } from "@/components/status";
import { REPORT_TYPES } from "@/lib/reportTypes";
import { RISK_LABEL, RISK_ORDER } from "@/lib/risk";

export interface LegendOverlay {
  clave: string;
  etiqueta: string;
  color: string;
  visible: boolean;
  onToggle: () => void;
  muestras: { etiqueta: string; opacidad: number }[];
  nota: string;
}

interface MapLegendProps {
  zonasOficiales: number;
  overlays: LegendOverlay[];
  conReportes: boolean;
}

export function MapLegend({ zonasOficiales, overlays, conReportes }: MapLegendProps) {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="pointer-events-auto flex max-w-sm flex-col overflow-hidden rounded-md border border-rule bg-panel/95 text-xs backdrop-blur">
      <button
        type="button"
        onClick={() => setAbierta((current) => !current)}
        aria-expanded={abierta}
        className="flex items-center gap-3 px-3 py-2 text-left text-ink-soft transition-colors hover:text-ink"
      >
        <span className="flex items-center gap-1">
          {RISK_ORDER.map((nivel) => (
            <span key={nivel} className="h-0.5 w-3" style={{ background: RISK_FILL[nivel] }} aria-hidden="true" />
          ))}
        </span>
        <span className="text-ink">Capas y significado de los colores</span>
        <span className="ml-auto" aria-hidden="true">
          {abierta ? "▾" : "▸"}
        </span>
      </button>

      <p className="border-t border-rule px-3 py-2 text-xs text-ink-soft">Clima municipal 2024: capa fija. Contornos: señal orientativa de esta consulta. Gris: evaluación incompleta.</p>
      {abierta ? (
        <div className="flex flex-col gap-3 border-t border-rule px-3 py-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-ink">Zonas oficiales de inundación por arroyo ({zonasOficiales})</p>
            <p className="text-ink-faint">Contorno y relleno del color del nivel de hoy en esa zona.</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {RISK_ORDER.map((nivel) => (
                <span key={nivel} className="flex items-center gap-1.5 text-ink-soft">
                  <span className="h-2.5 w-4 rounded-sm border" style={{ borderColor: RISK_FILL[nivel], background: `${RISK_FILL[nivel]}40` }} aria-hidden="true" />
                  {RISK_LABEL[nivel]}
                </span>
              ))}
            </div>
          </div>

          {overlays.map((overlay) => (
            <div key={overlay.clave} className="flex flex-col gap-1.5">
              <button type="button" onClick={overlay.onToggle} aria-pressed={overlay.visible} className="flex items-center gap-2 text-left text-ink hover:text-ink-soft">
                <span className={`size-3 rounded-sm border border-rule ${overlay.visible ? "" : "opacity-30"}`} style={{ background: overlay.color }} aria-hidden="true" />
                {overlay.etiqueta}
                <span className="meta ml-auto">{overlay.visible ? "ocultar" : "mostrar"}</span>
              </button>
              <p className="text-ink-faint">{overlay.nota}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {overlay.muestras.map((muestra) => (
                  <span key={muestra.etiqueta} className="flex items-center gap-1.5 text-ink-soft">
                    <span className="h-2.5 w-4 rounded-sm" style={{ background: overlay.color, opacity: muestra.opacidad }} aria-hidden="true" />
                    {muestra.etiqueta}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {conReportes ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-ink">Reportes de vecinos (últimas 24 h)</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.values(REPORT_TYPES).map((tipo) => (
                  <span key={tipo.etiqueta} className="flex items-center gap-1.5 text-ink-soft">
                    <span className="size-2.5 rounded-full border border-ground" style={{ background: tipo.color }} aria-hidden="true" />
                    {tipo.etiqueta}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
