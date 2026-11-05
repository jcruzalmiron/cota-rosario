"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { LookupResult } from "@/components/LookupResult";
import { SourceSignals } from "@/components/SourceSignals";
import type { SourceSignal } from "@/lib/placeSignals";
import { AddressSearch } from "@/components/AddressSearch";
import { MapLegend, type LegendOverlay } from "@/components/MapLegend";
import { MobileReportPanel, ReportFab } from "@/components/reports/MobileReports";
import { NearbyReports } from "@/components/reports/NearbyReports";
import { ReportPanel } from "@/components/reports/ReportPanel";
import { useReports } from "@/components/reports/useReports";
import { useSimulation } from "@/components/SimulationContext";
import { RISK_FILL, zoneColor } from "@/components/status";
import { GRADE_LABEL } from "@/lib/zoneAlert";
import type { ClimateMeta, Finding, TerrainMeta } from "@/lib/lookup";
import { createPlaceReader, geocode, type GeocodedPlace, type PlaceReader } from "@/lib/placeReader";
import type { AddressSuggestion } from "@/lib/addressSuggestions";
import { RISK_LABEL, riskLabel, zoneReading, type RiskLevel, type ZoneView } from "@/lib/risk";
import { escapeHtml } from "@/lib/html";
import { loadLeaflet } from "@/lib/leaflet";
import { RainLayer } from "@/components/rain/RainLayer";

const CENTER: [number, number] = [-32.955, -60.66];
const ZOOM = 12;
const FOUND_ZOOM = 15;
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TERRAIN_OPACITY = 0.8;
const TERRAIN_COLOR = "#d6a04a";
const CLIMATE_OPACITY = 0.75;
const CLIMATE_COLOR = "#d65c54";
const ZONE_FILL_OPACITY = 0.18;
const ZONE_FILL_OPACITY_SIMULATED = 0.32;
const DATA = {
  floodZones: "/data/flood-zones.json",
  terrain: "/data/terrain.json",
  terrainPng: "/data/terrain.png",
  climateRisk: "/data/climate-risk.json",
  climatePng: "/data/climate-risk.png",
} as const;

type FloodZones = FeatureCollection<Polygon | MultiPolygon, Record<string, string>>;
type ZoneFeature = Feature<Polygon, { zone: string; sector: string }>;

interface FloodMapProps {
  zones: ZoneView[];
  searcher?: boolean;
  reports?: boolean;
  report?: boolean;
  corner?: ReactNode;
  /** Señales por fuente para la ficha del lugar buscado. */
  signals?: SourceSignal[];
}

const CLIMATE_SWATCHES = [
  { label: "bajo", opacity: 0.25 },
  { label: "medio", opacity: 0.55 },
  { label: "alto", opacity: 0.9 },
];
const TERRAIN_SWATCHES = [
  { label: "1 m bajo el entorno", opacity: 0.35 },
  { label: "3 m o más", opacity: 1 },
];

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export function FloodMap({ zones, searcher = false, reports = false, report = false, corner, signals }: FloodMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const zonesLayerRef = useRef<import("leaflet").GeoJSON | null>(null);
  const markerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const terrainLayerRef = useRef<import("leaflet").ImageOverlay | null>(null);
  const climateLayerRef = useRef<import("leaflet").ImageOverlay | null>(null);
  const readerRef = useRef<PlaceReader>(createPlaceReader());
  const { scenario, reset } = useSimulation();
  const [collection, setCollection] = useState<FloodZones | null>(null);
  const [terrain, setTerrain] = useState<TerrainMeta | null>(null);
  const [climateRisk, setClimateRisk] = useState<ClimateMeta | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [showClimate, setShowClimate] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [searchedPoint, setSearchedPoint] = useState<GeocodedPlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMobileReportsOpen, setMobileReportsOpen] = useState(false);
  const reportsState = useReports(mapRef, mapReady && reports);
  const toggleMobileReports = () => setMobileReportsOpen(!isMobileReportsOpen);

  const effectiveZones = scenario?.zones ?? zones;
  const zoneOf = useCallback((zone: string) => zoneReading(effectiveZones, zone, Boolean(scenario)), [effectiveZones, scenario]);
  const zoneLevel = useCallback((zone: string): RiskLevel | null => zoneOf(zone).level, [zoneOf]);
  const zoneRef = useRef(zoneOf);
  useEffect(() => {
    zoneRef.current = zoneOf;
  }, [zoneOf]);

  const zoneStyle = useCallback(
    (feature: ZoneFeature | undefined) => {
      const reading = zoneOf(feature?.properties?.zone ?? "");
      const level = reading.level;
      const fill = zoneColor(reading.grade, level);
      return { color: fill, weight: 1, fillColor: fill, fillOpacity: scenario ? ZONE_FILL_OPACITY_SIMULATED : ZONE_FILL_OPACITY, dashArray: level === null ? "4 4" : undefined };
    },
    [scenario, zoneOf],
  );
  const zoneStyleRef = useRef(zoneStyle);
  useEffect(() => {
    zoneStyleRef.current = zoneStyle;
  }, [zoneStyle]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().catch(() => !cancelled && setError("No se pudo cargar el mapa."));
    fetchJson<FloodZones>(DATA.floodZones).then((data) => {
      if (cancelled) {
        return;
      }
      if (data) {
        setCollection(data);
      } else {
        setError("No se pudieron cargar las áreas inundables.");
      }
    });
    fetchJson<TerrainMeta>(DATA.terrain).then((data) => !cancelled && data && setTerrain(data));
    fetchJson<ClimateMeta>(DATA.climateRisk).then((data) => !cancelled && data && setClimateRisk(data));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!container.current || !collection) {
      return undefined;
    }
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !container.current) {
        return;
      }
      const map = L.map(container.current, { center: CENTER, zoom: ZOOM, zoomControl: false, attributionControl: true });
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);
      zonesLayerRef.current = L.geoJSON(collection, {
        style: (feature) => zoneStyleRef.current(feature as ZoneFeature | undefined),
        onEachFeature: (feature, layer) => {
          const properties = (feature as ZoneFeature).properties;
          layer.bindPopup(() => {
            const reading = zoneRef.current(properties?.zone ?? "");
            const basis = reading.basis ? `<br/><span style="opacity:.75">${escapeHtml(reading.basis)}</span>` : "";
            const label = reading.grade !== null ? `${GRADE_LABEL[reading.grade]} · ${reading.grade}/5` : riskLabel(reading.level);
            const why = reading.contributions.length
              ? `<ul style="margin:.35em 0 0;padding-left:1.1em;opacity:.85">${reading.contributions.map((item) => `<li>${escapeHtml(item.points > 0 ? `+${item.points} · ` : "")}${escapeHtml(item.text)}</li>`).join("")}</ul>`
              : "";
            return `Zona ${escapeHtml(properties?.zone ?? "?")} · sector ${escapeHtml(properties?.sector || "—")}<br/><strong>${escapeHtml(label)}</strong>${basis}${why}`;
          });
        },
      }).addTo(map);
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      zonesLayerRef.current = null;
      markerRef.current = null;
      terrainLayerRef.current = null;
      climateLayerRef.current = null;
      setMapReady(false);
    };
  }, [collection]);

  useEffect(() => {
    zonesLayerRef.current?.setStyle((feature) => zoneStyle(feature as ZoneFeature | undefined));
  }, [zoneStyle, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) {
      return;
    }
    loadLeaflet().then((L) => {
      const overlays: [typeof terrainLayerRef, TerrainMeta | ClimateMeta | null, string, number, boolean][] = [
        [terrainLayerRef, terrain, DATA.terrainPng, TERRAIN_OPACITY, showTerrain],
        [climateLayerRef, climateRisk, DATA.climatePng, CLIMATE_OPACITY, showClimate],
      ];
      for (const [ref, meta, src, opacity, visible] of overlays) {
        if (!meta) {
          continue;
        }
        if (!ref.current) {
          const { bounds } = meta;
          ref.current = L.imageOverlay(
            src,
            [
              [bounds.south, bounds.west],
              [bounds.north, bounds.east],
            ],
            { opacity, interactive: false },
          );
        }
        if (visible && !map.hasLayer(ref.current)) {
          ref.current.addTo(map);
        } else if (!visible && map.hasLayer(ref.current)) {
          ref.current.remove();
        }
      }
    });
  }, [mapReady, terrain, climateRisk, showTerrain, showClimate]);

  const showPlace = async (place: GeocodedPlace) => {
    const { lat, lon } = place;
    const reading = await readerRef.current.read(lat, lon);
    const map = mapRef.current;
    if (map) {
      const L = await loadLeaflet();
      markerRef.current?.remove();
      markerRef.current = L.circleMarker([lat, lon], {
        radius: 7,
        color: "#ececee",
        weight: 2,
        fillColor: reading.zone ? zoneColor(zoneOf(reading.zone).grade, zoneLevel(reading.zone)) : zoneColor(null, null),
        fillOpacity: 1,
      }).addTo(map);
      map.setView([lat, lon], FOUND_ZOOM);
    }
    const zoneState = reading.zone ? zoneOf(reading.zone) : undefined;
    setFinding({ ...reading, label: place.label, level: zoneState?.level, basis: zoneState?.basis, grade: zoneState?.grade, contributions: zoneState?.contributions });
    setSearchedPoint(place);
  };

  const locate = async (findPlace: () => Promise<GeocodedPlace | null>) => {
    setSearching(true);
    setError(null);
    setFinding(null);
    setSearchedPoint(null);
    try {
      const found = await findPlace();
      if (!found) {
        setError("No encontramos esa dirección dentro de Rosario.");
        return;
      }
      await showPlace(found);
    } catch {
      setError("El buscador de direcciones no respondió. Probá de nuevo en un momento.");
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    markerRef.current?.remove();
    markerRef.current = null;
    setFinding(null);
    setSearchedPoint(null);
    setSearchText("");
    setError(null);
  };

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    const term = searchText.trim();
    if (term) {
      void locate(async () => {
        const found = await geocode(term);
        return found ? { ...found, label: term } : null;
      });
    }
  };

  const pickSuggestion = (suggestion: AddressSuggestion) => {
    setSearchText(suggestion.label);
    void locate(async () => ({ lat: suggestion.lat, lon: suggestion.lon, label: `${suggestion.label}, ${suggestion.detail}` }));
  };

  const overlays: LegendOverlay[] = [
    ...(climateRisk
      ? [
          {
            id: "climateRisk",
            label: "Riesgo por lluvias torrenciales · mapa municipal",
            color: CLIMATE_COLOR,
            visible: showClimate,
            onToggle: () => setShowClimate((current) => !current),
            swatches: CLIMATE_SWATCHES,
            note: "Cuánto se vería afectada la vivienda por una lluvia extrema, por radio censal. No cambia con el pronóstico.",
          },
        ]
      : []),
    ...(terrain
      ? [
          {
            id: "terreno",
            label: "Puntos bajos del terreno · modelo",
            color: TERRAIN_COLOR,
            visible: showTerrain,
            onToggle: () => setShowTerrain((current) => !current),
            swatches: TERRAIN_SWATCHES,
            note: "Dónde el suelo está más hundido que su entorno y el agua tiende a juntarse. Sin lectura en manzanas densas.",
          },
        ]
      : []),
  ];

  return (
    <div className="relative isolate h-full w-full">
      <div ref={container} className="absolute inset-0" />
      <RainLayer />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
          {searcher ? (
            <div className="pointer-events-auto flex max-h-[calc(100dvh-var(--sheet-peek)-10rem)] w-full max-w-lg flex-col overflow-y-auto overscroll-contain rounded-md border border-rule bg-panel shadow-xl lg:max-h-[calc(100dvh-12rem)]">
              <form onSubmit={search} className="flex items-center">
                <div className="min-w-0 flex-1">
                  <AddressSearch
                    id="map-address"
                    value={searchText}
                    onValueChange={setSearchText}
                    onPick={pickSuggestion}
                    label="Dirección a consultar"
                    placeholder="Buscá tu dirección"
                    inputClassName="w-full bg-transparent px-4 py-3 text-sm outline-none placeholder:text-ink-faint"
                  />
                </div>
                {finding ? (
                  <button type="button" onClick={clearSearch} aria-label="Cerrar la consulta" className="flex size-10 shrink-0 items-center justify-center text-ink-faint transition-colors hover:text-ink">
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={searching}
                  className="shrink-0 px-4 py-3 text-sm text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
                >
                  {searching ? "Buscando" : "Consultar"}
                </button>
              </form>
              {finding ? <LookupResult finding={finding} terrain={terrain} /> : null}
              {finding && signals ? <SourceSignals signals={signals} finding={finding} simulated={Boolean(scenario)} /> : null}
              {finding && searchedPoint && reports ? <NearbyReports point={searchedPoint} reports={reportsState.reports} available={reportsState.available} canReport={report} /> : null}
              {error ? <p className="border-t border-rule px-4 py-3 text-sm text-alert">{error}</p> : null}
            </div>
          ) : reports ? (
            <div className="hidden w-full max-w-xs lg:block">
              <ReportPanel status={reportsState} readOnly={!report || finding !== null} />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {corner ? <div className="hidden shrink-0 justify-end lg:ml-auto lg:flex">{corner}</div> : null}
        </div>

        <div className="flex flex-col items-start gap-2 sm:flex-row">
          {searcher && reports ? (
            <div className="hidden w-full max-w-xs lg:block">
              <ReportPanel status={reportsState} readOnly={!report || finding !== null} />
            </div>
          ) : null}
          {scenario ? (
            <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-watch/60 bg-panel/95 px-3 py-2 text-xs shadow-xl backdrop-blur sm:mx-auto">
              <span className="size-2 rounded-full" style={{ background: RISK_FILL[scenario.level] }} aria-hidden="true" />
              <span className="text-ink">
                Escenario simulado · <span className="text-ink-soft">{RISK_LABEL[scenario.level]}</span>
              </span>
              <button type="button" onClick={reset} className="border-l border-rule pl-3 text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                Restablecer
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        data-map-legend
        className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--sheet-peek)+0.75rem)] z-[600] p-3 sm:p-4 lg:bottom-0 lg:right-auto"
      >
        <div className="flex items-end gap-3">
          <div className={`min-w-0 flex-1 lg:flex-none ${isMobileReportsOpen || finding ? "max-lg:hidden" : ""}`}>
            <MapLegend officialZones={collection?.features.length ?? 0} overlays={overlays} withReports={reports} />
          </div>
          {reports && isMobileReportsOpen && !finding ? <MobileReportPanel status={reportsState} readOnly={!report || finding !== null} /> : null}
          {reports && !finding ? <ReportFab status={reportsState} readOnly={!report} open={isMobileReportsOpen} onToggle={toggleMobileReports} /> : null}
        </div>
      </div>
    </div>
  );
}
