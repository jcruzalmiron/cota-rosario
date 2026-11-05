import { PlaceFactsGrid } from "@/components/residents/PlaceFactsGrid";
import { SourceSignals } from "@/components/SourceSignals";
import type { SourceSignal } from "@/lib/placeSignals";
import type { ReadingState } from "@/components/residents/usePlaceReadings";
import { zoneColor } from "@/components/status";
import { CLIMATE_CATEGORY_LABEL, type Finding, type TerrainMeta } from "@/lib/lookup";
import type { Place } from "@/lib/places";
import { riskLabel, type ZoneReadingResult } from "@/lib/risk";
import { GRADE_LABEL } from "@/lib/zoneAlert";

export type ZoneOf = (zone: string) => ZoneReadingResult;

const OUTSIDE_COLOR = "#74ACDF";
const LOADING_COLOR = "var(--ink-faint)";

export function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

export function findingFor(place: Place, state: ReadingState, zoneOf: ZoneOf): Finding | null {
  if (state.status !== "ready") {
    return null;
  }
  const { reading } = state;
  const zone = reading.zone ? zoneOf(reading.zone) : undefined;
  return { ...reading, label: place.name, level: zone?.level, basis: zone?.basis, grade: zone?.grade, contributions: zone?.contributions };
}

export function placeColor(finding: Finding | null): string {
  if (!finding) {
    return LOADING_COLOR;
  }
  return finding.inside ? zoneColor(finding.grade, finding.level ?? null) : OUTSIDE_COLOR;
}

function summary(finding: Finding | null, state: ReadingState): string {
  if (state.status === "failed") {
    return "No pudimos leer las capas de este lugar";
  }
  if (!finding) {
    return "Leyendo las capas…";
  }
  const today = finding.grade !== null && finding.grade !== undefined ? GRADE_LABEL[finding.grade] : riskLabel(finding.level ?? null);
  const official = finding.inside ? `Zona ${finding.zone ?? "—"} · hoy ${today.toLowerCase()}` : "Fuera del área inundable oficial";
  const climate = finding.climateRisk ? `lluvias torrenciales ${CLIMATE_CATEGORY_LABEL[finding.climateRisk]}` : null;
  return [official, climate].filter(Boolean).join(" · ");
}

interface PlaceRowProps {
  place: Place;
  state: ReadingState;
  finding: Finding | null;
  terrain: TerrainMeta | null;
  signals?: SourceSignal[];
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

export function PlaceRow({ place, state, finding, terrain, signals, selected, onSelect, onRemove }: PlaceRowProps) {
  const color = placeColor(finding);
  const location = [finding?.neighbourhood ? titleCase(finding.neighbourhood) : null, finding?.district ? `distrito ${titleCase(finding.district.district)}` : null].filter(Boolean).join(" · ");
  return (
    <li className={`relative border-b border-rule-soft transition-colors last:border-b-0 ${selected ? "bg-panel-soft/70" : "hover:bg-panel-soft/40"}`}>
      <span className={`absolute inset-y-0 left-0 w-[3px] transition-opacity ${selected ? "opacity-100" : "opacity-0"}`} style={{ background: color }} aria-hidden="true" />
      <button type="button" onClick={onSelect} aria-expanded={selected} className="flex w-full items-start gap-3 px-4 py-4 text-left">
        <span className="mt-1.5 size-3 shrink-0 rounded-full ring-2 ring-ground" style={{ background: color }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-base font-medium text-ink">{place.name}</span>
            <span className="shrink-0 text-[0.6875rem] text-ink-faint">{location || "Rosario"}</span>
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{summary(finding, state)}</span>
        </span>
      </button>
      {selected ? (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {finding ? <PlaceFactsGrid finding={finding} terrain={terrain} /> : null}
          {finding && signals ? <SourceSignals signals={signals} finding={finding} simulated={false} className="rounded-lg border border-rule-soft px-3 py-3" /> : null}
          <button type="button" onClick={onRemove} className="self-end rounded-md px-2 py-1 text-xs text-ink-faint underline decoration-rule underline-offset-4 hover:text-ink">
            Quitar {place.name}
          </button>
        </div>
      ) : null}
    </li>
  );
}
