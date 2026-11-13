"use client";

import { useState } from "react";
import { FIELD, chipClass } from "@/components/ops/ui";
import { DEFAULT_STAFFING_PARAMS, STAFFING_ASSUMED_LABEL, staffing, type DemandRange, type StaffingParams, type StaffingResult } from "@/lib/forecast/demand";

type Horizon = DemandRange & { horizonHours: 24 | 48; rainMm: number };

interface StaffingPlannerProps {
  h24: Horizon;
  h48: Horizon;
}

const FIELDS: { key: keyof StaffingParams; label: string; hint: string; step: string; max: number }[] = [
  { key: "interventionsPerCrewPerShift", label: "Intervenciones por cuadrilla y turno", hint: "cuántas resuelve una cuadrilla en un turno", step: "0.5", max: 100 },
  { key: "shiftHours", label: "Horas por turno", hint: "duración de cada turno", step: "1", max: 24 },
  { key: "peoplePerCrew", label: "Personas por cuadrilla", hint: "integrantes de cada cuadrilla", step: "1", max: 50 },
];

const SCENARIOS = [
  { key: "high", label: "Alto", note: "techo del rango" },
  { key: "expected", label: "Esperado", note: "valor central" },
  { key: "low", label: "Bajo", note: "piso del rango" },
] as const;

function parse(text: string, max: number): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function StaffingPlanner({ h24, h48 }: StaffingPlannerProps) {
  const [hours, setHours] = useState<24 | 48>(24);
  const [inputs, setInputs] = useState<Record<keyof StaffingParams, string>>({
    interventionsPerCrewPerShift: String(DEFAULT_STAFFING_PARAMS.interventionsPerCrewPerShift),
    shiftHours: String(DEFAULT_STAFFING_PARAMS.shiftHours),
    peoplePerCrew: String(DEFAULT_STAFFING_PARAMS.peoplePerCrew),
  });

  const horizon = hours === 24 ? h24 : h48;
  const parsed = Object.fromEntries(FIELDS.map((field) => [field.key, parse(inputs[field.key], field.max)])) as Record<keyof StaffingParams, number | null>;
  const invalid = FIELDS.filter((field) => parsed[field.key] === null);
  // Sólo se pasan los valores que la persona cambió: el resto queda marcado como supuesto por la biblioteca.
  const custom: Partial<StaffingParams> = Object.fromEntries(FIELDS.filter((field) => parsed[field.key] !== null && parsed[field.key] !== DEFAULT_STAFFING_PARAMS[field.key]).map((field) => [field.key, parsed[field.key]]));
  let result: StaffingResult | null = null;
  if (invalid.length === 0) {
    try {
      result = staffing(horizon, custom);
    } catch {
      result = null;
    }
  }
  const edited = Object.keys(custom).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Horizonte" className="flex gap-2">
          {([24, 48] as const).map((option) => (
            <button key={option} type="button" aria-pressed={hours === option} onClick={() => setHours(option)} className={chipClass(hours === option)}>
              Próximas {option} h
            </button>
          ))}
        </div>
        {edited ? (
          <button
            type="button"
            className="min-h-11 text-xs text-ink-soft underline decoration-rule underline-offset-4 transition-colors hover:text-ink lg:min-h-0"
            onClick={() => setInputs({ interventionsPerCrewPerShift: String(DEFAULT_STAFFING_PARAMS.interventionsPerCrewPerShift), shiftHours: String(DEFAULT_STAFFING_PARAMS.shiftHours), peoplePerCrew: String(DEFAULT_STAFFING_PARAMS.peoplePerCrew) })}
          >
            Volver a los supuestos iniciales
          </button>
        ) : null}
      </div>

      {result ? (
        <div aria-live="polite">
          <p className="meta">Para cubrir el escenario alto · {horizon.high} intervenciones en {hours} h</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="readout text-5xl font-medium tabular-nums text-ink">{result.crews.high}</span>
            <span className="text-base text-ink-soft">{result.crews.high === 1 ? "cuadrilla por turno" : "cuadrillas por turno"}</span>
            <span className="readout text-2xl tabular-nums text-ink">· {result.people.high}</span>
            <span className="text-base text-ink-soft">{result.people.high === 1 ? "persona" : "personas"}</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            {plural(result.shifts, "turno", "turnos")} de {result.params.shiftHours.value} h en el horizonte · {plural(result.personShifts.high, "persona-turno", "personas-turno")} en total.
            {result.crews.high === 0 ? " El modelo no espera intervenciones adicionales por lluvia: es la dotación extra estimada, no reemplaza la guardia habitual." : ""}
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-rule text-ink-faint">
                  <th scope="col" className="py-2 pr-3 font-normal">Escenario</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Intervenciones</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Cuadrillas / turno</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Personas / turno</th>
                  <th scope="col" className="py-2 text-right font-normal">Personas-turno</th>
                </tr>
              </thead>
              <tbody>
                {SCENARIOS.map((scenario) => (
                  <tr key={scenario.key} className="border-b border-rule-soft">
                    <th scope="row" className="py-2.5 pr-3 font-normal">
                      <span className={scenario.key === "high" ? "text-ink" : "text-ink-soft"}>{scenario.label}</span>
                      <span className="block text-[0.6875rem] text-ink-faint">{scenario.note}</span>
                    </th>
                    <td className="readout py-2.5 pr-3 text-right text-ink-soft">{horizon[scenario.key]}</td>
                    <td className={`readout py-2.5 pr-3 text-right ${scenario.key === "high" ? "text-ink" : "text-ink-soft"}`}>{result.crews[scenario.key]}</td>
                    <td className={`readout py-2.5 pr-3 text-right ${scenario.key === "high" ? "text-ink" : "text-ink-soft"}`}>{result.people[scenario.key]}</td>
                    <td className="readout py-2.5 text-right text-ink-soft">{result.personShifts[scenario.key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p role="alert" className="border-l-2 border-watch pl-3 text-xs leading-relaxed text-watch">
          Revisá los supuestos: {invalid.map((field) => field.label.toLowerCase()).join(", ")} {invalid.length === 1 ? "tiene" : "tienen"} que ser un número mayor que cero.
        </p>
      )}

      <fieldset className="rounded-lg border border-rule bg-panel/50 p-4">
        <legend className="meta px-1.5">Supuestos editables</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {FIELDS.map((field) => {
            const value = parsed[field.key];
            const assumed = value === DEFAULT_STAFFING_PARAMS[field.key];
            return (
              <label key={field.key} className="flex flex-col gap-1.5 text-xs text-ink-soft">
                {field.label}
                <input
                  className={`${FIELD} readout ${value === null ? "border-alert" : ""}`}
                  type="number"
                  inputMode="decimal"
                  min={field.step === "1" ? 1 : 0.5}
                  max={field.max}
                  step={field.step}
                  value={inputs[field.key]}
                  aria-invalid={value === null}
                  onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}
                />
                <span className={`text-[0.6875rem] leading-snug ${value === null ? "text-alert" : assumed ? "text-watch" : "text-ink-faint"}`}>
                  {value === null ? `entre ${field.step === "1" ? 1 : 0.5} y ${field.max}` : assumed ? STAFFING_ASSUMED_LABEL : "valor ingresado en esta sesión"}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Los valores iniciales son de trabajo, no cifras oficiales. Lo que cambies se recalcula en el momento y no se guarda.
        </p>
      </fieldset>

      {result ? (
        <details className="group text-xs leading-relaxed text-ink-soft">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-ink-soft transition-colors hover:text-ink lg:min-h-0 [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
            Cómo se calcula la dotación
          </summary>
          <p className="readout mt-3 text-[0.6875rem] text-ink-faint">{result.formula}</p>
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-4">
            {result.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
