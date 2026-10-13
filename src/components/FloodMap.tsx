"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { LookupResult } from "@/components/LookupResult";
import { MapLegend, type LegendOverlay } from "@/components/MapLegend";
import { ReportPanel } from "@/components/reports/ReportPanel";
import { useReports } from "@/components/reports/useReports";
import { useSimulation } from "@/components/SimulationContext";
import { RISK_FILL, riskColor } from "@/components/status";
import {
  categoriaDesdeGris,
  featureAt,
  lecturaDistrito,
  nearestFeature,
  type ClimaMeta,
  type DefensaCivil,
  type Hallazgo,
  type LecturaTerreno,
  type TerrainMeta,
} from "@/lib/lookup";
import { loadPixels, rasterOffset } from "@/lib/rasters";
import { RISK_LABEL, riskLabel, type RiskLevel } from "@/lib/risk";

const CENTER: [number, number] = [-32.955, -60.66];
const ZOOM = 12;
const FOUND_ZOOM = 15;
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const ROSARIO_VIEWBOX = "-60.79,-32.83,-60.58,-33.06";
const TERRAIN_OPACITY = 0.8;
const TERRAIN_COLOR = "#d6a04a";
const CLIMA_OPACITY = 0.75;
const CLIMA_COLOR = "#d65c54";
const LOW_POINT_MIN_M = 1;
const MASK_THRESHOLD = 127;
const ZONE_FILL_OPACITY = 0.18;
const ZONE_FILL_OPACITY_SIMULATED = 0.32;
const DATA = {
  areas: "/data/areas-inundables.json",
  terreno: "/data/terreno.json",
  terrenoPng: "/data/terreno.png",
  clima: "/data/riesgo-clima.json",
  climaPng: "/data/riesgo-clima.png",
  defensaCivil: "/data/defensa-civil.json",
  distritos: "/data/distritos.json",
  barrios: "/data/barrios.json",
} as const;

type Areas = FeatureCollection<Polygon | MultiPolygon, Record<string, string>>;
type ZoneFeature = Feature<Polygon, { zona: string; sector: string }>;

interface FloodMapProps {
  zonas: { zona: string; nivel: RiskLevel | null }[];
  buscador?: boolean;
  reportes?: boolean;
  reportar?: boolean;
  esquina?: ReactNode;
}

const CLIMA_MUESTRAS = [
  { etiqueta: "bajo", opacidad: 0.25 },
  { etiqueta: "medio", opacidad: 0.55 },
  { etiqueta: "alto", opacidad: 0.9 },
];
const TERRENO_MUESTRAS = [
  { etiqueta: "1 m bajo el entorno", opacidad: 0.35 },
  { etiqueta: "3 m o más", opacidad: 1 },
];

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export function FloodMap({ zonas, buscador = false, reportes = false, reportar = false, esquina }: FloodMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const zonesLayerRef = useRef<import("leaflet").GeoJSON | null>(null);
  const markerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const terrainLayerRef = useRef<import("leaflet").ImageOverlay | null>(null);
  const climaLayerRef = useRef<import("leaflet").ImageOverlay | null>(null);
  const terrainPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const maskPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const climaPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const { escenario, reset } = useSimulation();
  const [collection, setCollection] = useState<Areas | null>(null);
  const [terrain, setTerrain] = useState<TerrainMeta | null>(null);
  const [clima, setClima] = useState<ClimaMeta | null>(null);
  const [defensaCivil, setDefensaCivil] = useState<DefensaCivil | null>(null);
  const [distritos, setDistritos] = useState<Areas | null>(null);
  const [barrios, setBarrios] = useState<Areas | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mostrarTerreno, setMostrarTerreno] = useState(false);
  const [mostrarClima, setMostrarClima] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [hallazgo, setHallazgo] = useState<Hallazgo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const estadoReportes = useReports(mapRef, mapReady && reportes);

  const zonasEfectivas = escenario?.zonas ?? zonas;
  const nivelDeZona = useCallback(
    (zona: string): RiskLevel | null => zonasEfectivas.find((entry) => entry.zona === zona.trim())?.nivel ?? null,
    [zonasEfectivas],
  );
  const nivelRef = useRef(nivelDeZona);
  useEffect(() => {
    nivelRef.current = nivelDeZona;
  }, [nivelDeZona]);

  const estiloDeZona = useCallback(
    (feature: ZoneFeature | undefined) => {
      const level = nivelDeZona(feature?.properties?.zona ?? "");
      const fill = riskColor(level);
      return { color: fill, weight: 1, fillColor: fill, fillOpacity: escenario ? ZONE_FILL_OPACITY_SIMULATED : ZONE_FILL_OPACITY, dashArray: level === null ? "4 4" : undefined };
    },
    [escenario, nivelDeZona],
  );

  useEffect(() => {
    let cancelled = false;
    fetchJson<Areas>(DATA.areas).then((data) => {
      if (cancelled) {
        return;
      }
      if (data) {
        setCollection(data);
      } else {
        setError("No se pudieron cargar las áreas inundables.");
      }
    });
    fetchJson<TerrainMeta>(DATA.terreno).then((data) => !cancelled && data && setTerrain(data));
    fetchJson<ClimaMeta>(DATA.clima).then((data) => !cancelled && data && setClima(data));
    fetchJson<DefensaCivil>(DATA.defensaCivil).then((data) => !cancelled && data && setDefensaCivil(data));
    fetchJson<Areas>(DATA.distritos).then((data) => !cancelled && data && setDistritos(data));
    fetchJson<Areas>(DATA.barrios).then((data) => !cancelled && data && setBarrios(data));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!container.current || !collection) {
      return undefined;
    }
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !container.current) {
        return;
      }
      const map = L.map(container.current, { center: CENTER, zoom: ZOOM, zoomControl: false, attributionControl: true });
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);
      zonesLayerRef.current = L.geoJSON(collection, {
        style: (feature) => estiloDeZona(feature as ZoneFeature | undefined),
        onEachFeature: (feature, layer) => {
          const properties = (feature as ZoneFeature).properties;
          layer.bindPopup(() => `Zona ${properties?.zona ?? "?"} · sector ${properties?.sector || "—"}<br/>${riskLabel(nivelRef.current(properties?.zona ?? ""))}`);
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
      climaLayerRef.current = null;
      setMapReady(false);
    };
    // estiloDeZona sólo se usa para el estilo inicial; los cambios posteriores los aplica el efecto de abajo sin recrear el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);

  useEffect(() => {
    zonesLayerRef.current?.setStyle((feature) => estiloDeZona(feature as ZoneFeature | undefined));
  }, [estiloDeZona, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) {
      return;
    }
    import("leaflet").then((L) => {
      const overlays: [typeof terrainLayerRef, TerrainMeta | ClimaMeta | null, string, number, boolean][] = [
        [terrainLayerRef, terrain, DATA.terrenoPng, TERRAIN_OPACITY, mostrarTerreno],
        [climaLayerRef, clima, DATA.climaPng, CLIMA_OPACITY, mostrarClima],
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
  }, [mapReady, terrain, clima, mostrarTerreno, mostrarClima]);

  const lecturaTerrenoEn = async (lat: number, lon: number): Promise<LecturaTerreno> => {
    if (!terrain) {
      return null;
    }
    if (!terrainPixelsRef.current || !maskPixelsRef.current) {
      [terrainPixelsRef.current, maskPixelsRef.current] = await Promise.all([
        loadPixels(DATA.terrenoPng, terrain),
        loadPixels(`/data/${terrain.mascaraEdificado}`, terrain),
      ]);
    }
    const offset = rasterOffset(terrain, lat, lon);
    if (offset === null) {
      return null;
    }
    if (maskPixelsRef.current[offset] > MASK_THRESHOLD) {
      return { estado: "edificado", metros: 0 };
    }
    const metros = (terrainPixelsRef.current[offset + 3] / 255) * terrain.escalaMaximaMetros;
    return { estado: metros >= LOW_POINT_MIN_M ? "bajo" : "plano", metros };
  };

  const lecturaClimaEn = async (lat: number, lon: number) => {
    if (!clima) {
      return null;
    }
    if (!climaPixelsRef.current) {
      climaPixelsRef.current = await loadPixels(`/data/${clima.archivoCategorias}`, clima);
    }
    const offset = rasterOffset(clima, lat, lon);
    return offset === null ? null : categoriaDesdeGris(clima, climaPixelsRef.current[offset]);
  };

  const buscar = async (event: React.FormEvent) => {
    event.preventDefault();
    const termino = consulta.trim();
    if (!termino || !collection) {
      return;
    }
    setBuscando(true);
    setError(null);
    setHallazgo(null);
    try {
      const params = new URLSearchParams({
        q: `${termino}, Rosario, Santa Fe, Argentina`,
        format: "json",
        limit: "1",
        viewbox: ROSARIO_VIEWBOX,
        bounded: "1",
      });
      const response = await fetch(`${NOMINATIM}?${params}`, { headers: { accept: "application/json" } });
      const results = (await response.json()) as { lat: string; lon: string; display_name: string }[];
      if (results.length === 0) {
        setError("No encontramos esa dirección dentro de Rosario.");
        return;
      }
      const lat = Number(results[0].lat);
      const lon = Number(results[0].lon);
      const match = featureAt(collection, lat, lon);
      const zona = match?.properties.zona?.trim();
      const cercano = match ? null : nearestFeature(collection, lat, lon);
      const distrito = distritos ? featureAt(distritos, lat, lon)?.properties.distrito : undefined;
      const [terreno, categoriaClima] = await Promise.all([lecturaTerrenoEn(lat, lon).catch(() => null), lecturaClimaEn(lat, lon).catch(() => null)]);

      const map = mapRef.current;
      if (map) {
        const L = await import("leaflet");
        markerRef.current?.remove();
        markerRef.current = L.circleMarker([lat, lon], {
          radius: 7,
          color: "#ececee",
          weight: 2,
          fillColor: riskColor(zona ? nivelDeZona(zona) : null),
          fillOpacity: 1,
        }).addTo(map);
        map.setView([lat, lon], FOUND_ZOOM);
      }

      setHallazgo({
        etiqueta: results[0].display_name.split(",").slice(0, 3).join(", "),
        zona,
        nivel: zona ? nivelDeZona(zona) : undefined,
        dentro: Boolean(match),
        cercano: cercano ? { zona: cercano.feature.properties.zona?.trim() ?? "?", metros: cercano.metros } : null,
        terreno,
        clima: categoriaClima,
        distrito: defensaCivil && distrito ? lecturaDistrito(defensaCivil, distrito) : null,
        barrio: barrios ? (featureAt(barrios, lat, lon)?.properties.barrio ?? null) : null,
      });
    } catch {
      setError("El buscador de direcciones no respondió. Probá de nuevo en un momento.");
    } finally {
      setBuscando(false);
    }
  };

  const overlays: LegendOverlay[] = [
    ...(clima
      ? [
          {
            clave: "clima",
            etiqueta: "Riesgo por lluvias torrenciales · mapa municipal",
            color: CLIMA_COLOR,
            visible: mostrarClima,
            onToggle: () => setMostrarClima((current) => !current),
            muestras: CLIMA_MUESTRAS,
            nota: "Cuánto se vería afectada la vivienda por una lluvia extrema, por radio censal. No cambia con el pronóstico.",
          },
        ]
      : []),
    ...(terrain
      ? [
          {
            clave: "terreno",
            etiqueta: "Puntos bajos del terreno · modelo",
            color: TERRAIN_COLOR,
            visible: mostrarTerreno,
            onToggle: () => setMostrarTerreno((current) => !current),
            muestras: TERRENO_MUESTRAS,
            nota: "Dónde el suelo está más hundido que su entorno y el agua tiende a juntarse. Sin lectura en manzanas densas.",
          },
        ]
      : []),
  ];

  return (
    <div className="relative isolate h-full w-full">
      <div ref={container} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
          {buscador ? (
            <div className="pointer-events-auto flex w-full max-w-lg flex-col overflow-hidden rounded-md border border-rule bg-panel shadow-xl">
              <form onSubmit={buscar} className="flex items-center">
                <input
                  id="direccion"
                  value={consulta}
                  onChange={(event) => setConsulta(event.target.value)}
                  placeholder="Buscá tu dirección"
                  aria-label="Dirección a consultar"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-ink-faint"
                />
                <button
                  type="submit"
                  disabled={buscando}
                  className="shrink-0 px-4 py-3 text-sm text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
                >
                  {buscando ? "Buscando" : "Consultar"}
                </button>
              </form>
              {hallazgo ? <LookupResult hallazgo={hallazgo} terrain={terrain} /> : null}
              {error ? <p className="border-t border-rule px-4 py-3 text-sm text-alerta">{error}</p> : null}
            </div>
          ) : reportes ? (
            <ReportPanel estado={estadoReportes} soloLectura={!reportar} />
          ) : (
            <div className="flex-1" />
          )}
          {esquina ? <div className="flex shrink-0 justify-end sm:ml-auto">{esquina}</div> : null}
        </div>

        <div className="flex flex-col items-start gap-2 sm:flex-row">
          {buscador && reportes ? <ReportPanel estado={estadoReportes} soloLectura={!reportar} /> : null}
          {escenario ? (
            <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-atencion/60 bg-panel/95 px-3 py-2 text-xs shadow-xl backdrop-blur sm:mx-auto">
              <span className="size-2 rounded-full" style={{ background: RISK_FILL[escenario.nivel] }} aria-hidden="true" />
              <span className="text-ink">
                Escenario simulado · <span className="text-ink-soft">{RISK_LABEL[escenario.nivel]}</span>
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
        className="pointer-events-none absolute bottom-[calc(var(--sheet-peek)+0.75rem)] left-0 right-14 z-[500] p-3 sm:p-4 lg:bottom-0 lg:right-auto"
      >
        <MapLegend zonasOficiales={collection?.features.length ?? 0} overlays={overlays} conReportes={reportes} />
      </div>
    </div>
  );
}
