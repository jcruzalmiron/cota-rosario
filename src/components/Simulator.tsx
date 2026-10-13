"use client";

import { useEffect, useState } from "react";
import { useSimulation } from "@/components/SimulationContext";
import { RISK_FILL } from "@/components/status";
import { RAIN_THRESHOLDS, RISK_LABEL, simulate, type RiskLevel } from "@/lib/risk";

const MAX_METERS = 7;
const MAX_RAIN_MM = 60;
const STEP_METERS = 0.01;
const STEP_MM = 0.1;

interface SimulatorProps {
  metrosActuales: number;
  alerta: number;
  evacuacion: number | null;
  picoActualMm: number;
}

function Estado({ nivel, grande = false }: { nivel: RiskLevel; grande?: boolean }) {
  return (
    <span className={`flex items-center gap-2 ${grande ? "text-base" : "text-sm"}`}>
      <span className={`${grande ? "size-2.5" : "size-1.5"} rounded-full`} style={{ background: RISK_FILL[nivel] }} aria-hidden="true" />
      <span className="text-ink">{RISK_LABEL[nivel]}</span>
    </span>
  );
}

function SimulatorPanel({ metrosActuales, alerta, evacuacion, picoActualMm }: SimulatorProps) {
  const { setEscenario, reset } = useSimulation();
  const [metros, setMetros] = useState(metrosActuales);
  const [lluvia, setLluvia] = useState(picoActualMm);
  const resultado = simulate({ metros, alerta, evacuacion, picoLluviaMm: lluvia });
  const modificado = metros !== metrosActuales || lluvia !== picoActualMm;

  const aplicar = (nuevosMetros: number, nuevaLluvia: number) => {
    setMetros(nuevosMetros);
    setLluvia(nuevaLluvia);
    const cambia = nuevosMetros !== metrosActuales || nuevaLluvia !== picoActualMm;
    setEscenario(cambia ? simulate({ metros: nuevosMetros, alerta, evacuacion, picoLluviaMm: nuevaLluvia }) : null);
  };

  useEffect(() => () => setEscenario(null), [setEscenario]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Estado nivel={resultado.nivel} grande />
        {modificado ? <span className="text-xs text-atencion">escenario simulado · el mapa lo refleja</span> : <span className="meta">valores iniciales de la consulta</span>}
        <button
          type="button"
          onClick={reset}
          disabled={!modificado}
          className="ml-auto rounded-md border border-rule px-3 py-1 text-xs text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
        >
          Restablecer
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label htmlFor="sim-rio" className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between">
            <span className="text-sm text-ink">Altura del río</span>
            <span className="readout text-sm text-ink">{metros.toFixed(2)} m</span>
          </span>
          <input
            id="sim-rio"
            type="range"
            min={Math.min(0, metrosActuales)}
            max={Math.max(MAX_METERS, metrosActuales)}
            step={STEP_METERS}
            value={metros}
            onChange={(event) => aplicar(Number(event.target.value), lluvia)}
            className="accent-ink-soft"
          />
          <span className="meta">
            alerta {alerta.toFixed(2)} · evacuación {evacuacion === null ? "no publicada" : evacuacion.toFixed(2)}
          </span>
        </label>

        <label htmlFor="sim-lluvia" className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between">
            <span className="text-sm text-ink">Lluvia en 2 h</span>
            <span className="readout text-sm text-ink">{lluvia.toFixed(1)} mm</span>
          </span>
          <input
            id="sim-lluvia"
            type="range"
            min={0}
            max={Math.max(MAX_RAIN_MM, picoActualMm)}
            step={STEP_MM}
            value={lluvia}
            onChange={(event) => aplicar(metros, Number(event.target.value))}
            className="accent-ink-soft"
          />
          <span className="meta">
            atención {RAIN_THRESHOLDS.atencion} · alerta {RAIN_THRESHOLDS.alerta} · crítico {RAIN_THRESHOLDS.critico} mm
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-ink-soft">Por altura del río</span>
          <Estado nivel={resultado.rio} />
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-ink-soft">Por lluvia concentrada</span>
          <Estado nivel={resultado.lluvia} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="meta">Zonas oficiales bajo este escenario</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {resultado.zonas.map((zona) => (
            <span key={zona.zona} className="flex items-center gap-1.5 text-xs">
              <span className="size-1.5 rounded-full" style={{ background: RISK_FILL[zona.nivel] }} aria-hidden="true" />
              <span className="readout text-ink-soft">Zona {zona.zona}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Simulator(props: SimulatorProps) {
  const { version } = useSimulation();
  // A changed real baseline starts a new scenario and clears the previous map overlay.
  const baseline = JSON.stringify([version, props.metrosActuales, props.alerta, props.evacuacion, props.picoActualMm]);
  return <SimulatorPanel key={baseline} {...props} />;
}
