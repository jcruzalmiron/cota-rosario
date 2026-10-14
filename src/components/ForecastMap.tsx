"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { DistrictExpectation } from "@/lib/forecast/poisson";

const CENTER: [number, number] = [-32.955, -60.66];
const ZOOM = 12;
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const DISTRICTS_URL = "/data/distritos.json";
const FILL_COLOR = "#db7c45";
const MIN_FILL_OPACITY = 0.08;
const MAX_FILL_OPACITY = 0.6;

type Districts = FeatureCollection<Polygon | MultiPolygon, { distrito: string }>;

interface ForecastMapProps {
  distritos: DistrictExpectation[];
  ventanaDias: number;
  esquina?: ReactNode;
}

function titulo(texto: string): string {
  return texto.charAt(0) + texto.slice(1).toLowerCase();
}

export function ForecastMap({ distritos, ventanaDias, esquina }: ForecastMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [collection, setCollection] = useState<Districts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(DISTRICTS_URL)
      .then((response) => response.json())
      .then((data: Districts) => !cancelled && setCollection(data))
      .catch(() => setError("No se pudieron cargar los distritos."));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!container.current || !collection) {
      return undefined;
    }
    let cancelled = false;
    const maximo = Math.max(...distritos.map((entry) => entry.esperados), 0.1);
    const porDistrito = new Map(distritos.map((entry) => [entry.distrito, entry]));

    import("leaflet").then((L) => {
      if (cancelled || !container.current) {
        return;
      }
      const map = L.map(container.current, { center: CENTER, zoom: ZOOM, zoomControl: false });
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);
      L.geoJSON(collection, {
        style: (feature) => {
          const nombre = (feature as Feature<Polygon, { distrito: string }>).properties.distrito;
          const esperados = porDistrito.get(nombre)?.esperados ?? 0;
          return { color: porDistrito.has(nombre) ? FILL_COLOR : "#98a2b3", weight: 1, dashArray: porDistrito.has(nombre) ? undefined : "4 4", fillColor: FILL_COLOR, fillOpacity: porDistrito.has(nombre) ? MIN_FILL_OPACITY + (MAX_FILL_OPACITY - MIN_FILL_OPACITY) * (esperados / maximo) : 0 };
        },
        onEachFeature: (feature, layer) => {
          const nombre = (feature as Feature<Polygon, { distrito: string }>).properties.distrito;
          const entry = porDistrito.get(nombre);
          const centro = (layer as import("leaflet").Polygon).getBounds().getCenter();
          L.marker(centro, {
            interactive: false,
            icon: L.divIcon({ className: "district-label", html: `<span>${titulo(nombre)}</span><strong>${entry ? entry.esperados.toFixed(1) : "—"}</strong>` }),
          }).addTo(map);
          layer.bindTooltip(
            entry
              ? `${titulo(nombre)} · ${entry.esperados.toFixed(1)} casos del escenario en ${ventanaDias} días · distribución histórica`
              : `${titulo(nombre)} · escenario no disponible`,
            { sticky: true },
          );
        },
      }).addTo(map);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [collection, distritos, ventanaDias]);

  return (
    <div className="relative isolate h-full w-full">
      <div ref={container} className="absolute inset-0" />
      {esquina ? <div className="pointer-events-none absolute right-0 top-0 z-[500] flex justify-end p-3 sm:p-4">{esquina}</div> : null}
      <div data-map-legend className="pointer-events-none absolute bottom-[calc(var(--sheet-peek)+0.75rem)] left-0 right-14 z-[500] p-3 sm:p-4 lg:bottom-0 lg:right-auto">
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-rule bg-panel/95 px-3 py-2 backdrop-blur">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="size-2.5 rounded-sm" style={{ background: FILL_COLOR }} aria-hidden="true" />
            {distritos.length ? `Distribución por distrito · ${ventanaDias} días` : "Escenario no disponible"}
          </span>
          <span className="meta">proyección orientativa · modelo mensual</span>
        </div>
      </div>
      {error ? <p className="absolute left-4 top-4 z-[500] rounded-md border border-rule bg-panel px-3 py-2 text-xs text-alerta">{error}</p> : null}
    </div>
  );
}
