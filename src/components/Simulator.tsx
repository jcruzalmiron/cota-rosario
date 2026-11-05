"use client";

import { useEffect, useState } from "react";
import { useSimulation } from "@/components/SimulationContext";
import { GRADE_FILL, RISK_FILL } from "@/components/status";
import { GRADE_LABEL } from "@/lib/zoneAlert";
import { RAIN_THRESHOLDS, RISK_LABEL, simulate, type RiskLevel } from "@/lib/risk";

const MAX_METERS = 7;
const MAX_RAIN_MM = 60;
const STEP_METERS = 0.01;
const STEP_MM = 0.1;

interface SimulatorProps {
  currentMeters: number;
  alert: number;
  evacuation: number | null;
  currentPeakMm: number;
}

function Status({ level, large = false }: { level: RiskLevel; large?: boolean }) {
  return (
    <span className={`flex items-center gap-2 ${large ? "text-base" : "text-sm"}`}>
      <span className={`${large ? "size-2.5" : "size-1.5"} rounded-full`} style={{ background: RISK_FILL[level] }} aria-hidden="true" />
      <span className="text-ink">{RISK_LABEL[level]}</span>
    </span>
  );
}

function SimulatorPanel({ currentMeters, alert, evacuation, currentPeakMm }: SimulatorProps) {
  const { setScenario, reset } = useSimulation();
  const [meters, setMeters] = useState(currentMeters);
  const [rain, setRain] = useState(currentPeakMm);
  const result = simulate({ meters, alert, evacuation, rainPeakMm: rain });
  const modified = meters !== currentMeters || rain !== currentPeakMm;

  const apply = (nextMeters: number, nextRain: number) => {
    setMeters(nextMeters);
    setRain(nextRain);
    const changes = nextMeters !== currentMeters || nextRain !== currentPeakMm;
    setScenario(changes ? simulate({ meters: nextMeters, alert, evacuation, rainPeakMm: nextRain }) : null);
  };

  useEffect(() => () => setScenario(null), [setScenario]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Status level={result.level} large />
        {modified ? <span className="text-xs text-watch">escenario simulado · el mapa lo refleja</span> : <span className="meta">valores iniciales de la consulta</span>}
        <button
          type="button"
          onClick={reset}
          disabled={!modified}
          className="ml-auto rounded-md border border-rule px-3 py-1 text-xs text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
        >
          Restablecer
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label htmlFor="sim-rio" className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between">
            <span className="text-sm text-ink">Altura del río</span>
            <span className="readout text-sm text-ink">{meters.toFixed(2)} m</span>
          </span>
          <input
            id="sim-rio"
            type="range"
            min={Math.min(0, currentMeters)}
            max={Math.max(MAX_METERS, currentMeters)}
            step={STEP_METERS}
            value={meters}
            onChange={(event) => apply(Number(event.target.value), rain)}
            className="accent-ink-soft"
          />
          <span className="meta">
            alerta {alert.toFixed(2)} · evacuación {evacuation === null ? "no publicada" : evacuation.toFixed(2)}
          </span>
        </label>

        <label htmlFor="sim-lluvia" className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between">
            <span className="text-sm text-ink">Lluvia en 2 h</span>
            <span className="readout text-sm text-ink">{rain.toFixed(1)} mm</span>
          </span>
          <input
            id="sim-lluvia"
            type="range"
            min={0}
            max={Math.max(MAX_RAIN_MM, currentPeakMm)}
            step={STEP_MM}
            value={rain}
            onChange={(event) => apply(meters, Number(event.target.value))}
            className="accent-ink-soft"
          />
          <span className="meta">
            atención {RAIN_THRESHOLDS.watch} · alerta {RAIN_THRESHOLDS.alert} · crítico {RAIN_THRESHOLDS.critical} mm
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-ink-soft">Por altura del río</span>
          <Status level={result.river} />
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-ink-soft">Por lluvia concentrada</span>
          <Status level={result.rain} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="meta">Zonas oficiales bajo este escenario</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {result.zones.map((zone) => (
            <span key={zone.zone} className="flex items-center gap-1.5 text-xs" title={zone.contributions.map((item) => item.text).join(" ")}>
              <span className="size-1.5 rounded-full" style={{ background: GRADE_FILL[zone.grade] }} aria-hidden="true" />
              <span className="readout text-ink-soft">Zona {zone.zone}</span>
              <span className="text-ink-faint">{GRADE_LABEL[zone.grade].toLowerCase()}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Simulator(props: SimulatorProps) {
  const { version } = useSimulation();
  const baseline = JSON.stringify([version, props.currentMeters, props.alert, props.evacuation, props.currentPeakMm]);
  return <SimulatorPanel key={baseline} {...props} />;
}
