import { CLIMATE_CATEGORY_LABEL, formatDistance, type ClimateCategory, type Finding, type TerrainMeta } from "@/lib/lookup";
import { riskLabel } from "@/lib/risk";

const CLIMATE_TEXT: Record<ClimateCategory, string> = {
  "very low": "text-ink",
  "low": "text-ink",
  "medium": "text-watch",
  "high": "text-alert",
};

function title(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

interface LookupResultProps {
  finding: Finding;
  terrain: TerrainMeta | null;
}

export function LookupResult({ finding, terrain }: LookupResultProps) {
  const locationLabel = [finding.label, finding.neighbourhood ? `barrio ${title(finding.neighbourhood)}` : null, finding.district ? `distrito ${title(finding.district.district)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-2.5 border-t border-rule px-4 py-3 text-sm">
      <p className="text-xs text-ink-faint">{locationLabel}</p>

      {finding.inside ? (
        <p className="text-ink">
          Dentro del área inundable oficial zona {finding.zone}. Hoy:{" "}
          <span className={finding.level === "normal" ? "text-normal" : "text-alert"}>{riskLabel(finding.level).toLowerCase()}</span>.
          {finding.basis ? <span className="mt-1 block text-xs leading-snug text-ink-soft">{finding.basis}</span> : null}
        </p>
      ) : (
        <p className="leading-relaxed text-ink">
          Fuera de los polígonos oficiales del Ludueña y el Saladillo
          {finding.nearest ? (
            <>
              ; el más cercano es la zona {finding.nearest.zone}, a <span className="readout">{formatDistance(finding.nearest.meters)}</span>
            </>
          ) : null}
          .
        </p>
      )}

      {finding.climateRisk ? (
        <p className="leading-relaxed text-ink">
          Riesgo por lluvias torrenciales <span className={`${CLIMATE_TEXT[finding.climateRisk]} readout`}>{CLIMATE_CATEGORY_LABEL[finding.climateRisk]}</span>
          <span className="text-ink-soft"> según el mapa municipal de riesgo climático de 2024.</span>
        </p>
      ) : null}

      {finding.district ? (
        <p className="leading-relaxed text-ink-soft">
          En el registro incorporado (2021–enero de 2024), este distrito concentra el <span className="readout text-ink">{finding.district.share} %</span> de las intervenciones por anegamientos registradas. Esta proporción no indica el riesgo de esta dirección.
          {finding.district.peakMonth ? (
            <>
              {" "}
              Su mes más cargado registrado tuvo {finding.district.peakMonth.cases} casos con{" "}
              <span className="readout text-ink">{Math.round(finding.district.peakMonth.rainMm)} mm</span> de lluvia.
            </>
          ) : null}
        </p>
      ) : null}

      {finding.terrain ? (
        <p className="leading-relaxed text-ink-soft">
          {finding.terrain.status === "low" ? (
            <>
              Según el modelo de terreno está{" "}
              <span className="readout text-ink">
                {terrain && finding.terrain.meters >= terrain.maxScaleMeters ? `más de ${terrain.maxScaleMeters} m` : `${finding.terrain.meters.toFixed(1)} m`}
              </span>{" "}
              por debajo de la mediana de su entorno de {terrain?.windowMeters} m: ahí el agua tiende a juntarse.
            </>
          ) : finding.terrain.status === "flat" ? (
            <>Según el modelo de terreno no es un punto bajo respecto de la mediana de su entorno de {terrain?.windowMeters} m.</>
          ) : (
            <>En manzanas densas el relieve no aporta lectura; acá pesan el mapa oficial y el historial.</>
          )}
        </p>
      ) : null}
    </div>
  );
}
