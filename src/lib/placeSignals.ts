import type { RainSnapshot } from "@/lib/rain";
import type { RiverSnapshot } from "@/lib/river";
import type { RiskAssessment, RiskLevel, SignalStatus } from "@/lib/risk";

/**
 * Señales por fuente para Mi zona y la búsqueda: cada una con su ámbito, su hora
 * y si colorea las zonas. Se mantienen separadas de la exposición del lugar.
 */
export type SourceStatus = SignalStatus | "no_conectada";

export interface SourceSignal {
  id: "rain" | "river" | "ludueña";
  title: string;
  value: string;
  status: SourceStatus;
  level: RiskLevel | null;
  /** Hora del dato (no de la consulta), ISO o texto de la fuente. */
  at: string | null;
  scope: string;
  /** Si esta señal define el color de las zonas oficiales. */
  colorsZones: boolean;
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  elevada: "Elevada",
  sin_senales_elevadas: "Sin señales elevadas",
  ausente: "Sin dato",
  vencida: "Dato vencido",
  no_conectada: "No conectada",
};

export function sourceSignals(risk: RiskAssessment, river: RiverSnapshot | null, rain: RainSnapshot | null): SourceSignal[] {
  const rainFactor = risk.factors.find((f) => f.id === "rain");
  const riverFactor = risk.factors.find((f) => f.id === "river");
  const zoneSignal = risk.zones[0]?.signal;

  const rainStatus: SourceStatus = zoneSignal?.status ?? (rainFactor?.available ? "sin_senales_elevadas" : "ausente");
  const riverStatus: SourceStatus = !riverFactor?.available
    ? "ausente"
    : riverFactor.level === "normal"
      ? "sin_senales_elevadas"
      : "elevada";

  return [
    {
      id: "rain",
      title: "Lluvia prevista",
      value: rainFactor?.available ? rainFactor.measured : "—",
      status: rainStatus,
      level: rainFactor?.available ? rainFactor.level : null,
      at: rain?.fetchedAt ?? null,
      scope: "Pronóstico regional de Open-Meteo para toda la ciudad. No es una medición en este lugar.",
      colorsZones: true,
    },
    {
      id: "river",
      title: "Altura del Paraná",
      value: riverFactor && riverFactor.measured !== "sin dato" ? riverFactor.measured : "—",
      status: riverStatus,
      level: riverFactor?.available ? riverFactor.level : null,
      at: river?.station.date ?? null,
      scope: "Estación Rosario del INA. Indica el estado del río; no colorea las cuencas del Ludueña ni del Saladillo.",
      colorsZones: false,
    },
    {
      id: "ludueña",
      title: "Medición en el arroyo Ludueña",
      value: "—",
      status: "no_conectada",
      level: null,
      at: null,
      scope: "Todavía no hay una estación del arroyo integrada. Cuando la haya, se mostrará con su cobertura.",
      colorsZones: false,
    },
  ];
}
