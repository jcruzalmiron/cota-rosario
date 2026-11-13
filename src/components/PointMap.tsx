"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { escapeHtml } from "@/lib/html";
import { loadLeaflet } from "@/lib/leaflet";
import { RainLayer } from "@/components/rain/RainLayer";

type Leaflet = typeof import("leaflet");

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const CITY_CENTER: [number, number] = [-32.9468, -60.6393];
const CITY_ZOOM = 12;
const FOCUS_ZOOM = 16;
const FIT_PADDING_PX = 64;
const MAX_FIT_ZOOM = 15;
const FLOOD_ZONES_URL = "/data/flood-zones.json";
const ZONE_STYLE = { color: "#5f9bb8", weight: 1, fillColor: "#5f9bb8", fillOpacity: 0.08, dashArray: "3 4" };
const PIN_SIZE = 44;
const DOT_SIZE = 18;
const DROP_SIZE = 24;

export type MapPointKind = "place" | "report";

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  color: string;
  label: string;
  kind: MapPointKind;
  selected?: boolean;
}

export interface MapPin {
  lat: number;
  lon: number;
  color: string;
}

interface PointMapProps {
  points: readonly MapPoint[];
  pin?: MapPin | null;
  focus?: { lat: number; lon: number } | null;
  fitPoints?: boolean;
  onMapClick?: (lat: number, lon: number) => void;
  onPinMove?: (lat: number, lon: number) => void;
  onPointSelect?: (id: string) => void;
  overlay?: ReactNode;
  crosshair?: boolean;
}

function whenSized(map: import("leaflet").Map, action: () => void) {
  const size = map.invalidateSize(false).getSize();
  if (size.x > 0 && size.y > 0) {
    action();
    return;
  }
  map.once("resize", action);
}

function pointIcon(L: Leaflet, point: MapPoint) {
  if (point.kind === "report") {
    const html = `<svg viewBox="0 0 24 24" width="${DROP_SIZE}" height="${DROP_SIZE}" aria-hidden="true"><path d="M12 2.5c3.6 4.6 6.5 8.3 6.5 12a6.5 6.5 0 1 1-13 0c0-3.7 2.9-7.4 6.5-12Z" fill="${escapeHtml(point.color)}" fill-opacity="0.85" stroke="#0b0c0e" stroke-width="1.5"/></svg>`;
    return L.divIcon({ className: "map-point", html, iconSize: [DROP_SIZE, DROP_SIZE], iconAnchor: [DROP_SIZE / 2, DROP_SIZE] });
  }
  const ring = point.selected ? `box-shadow:0 0 0 6px ${escapeHtml(point.color)}40;` : "";
  const label = point.selected ? `<span class="map-point-label">${escapeHtml(point.label)}</span>` : "";
  const html = `<span class="map-point-dot" style="background:${escapeHtml(point.color)};${ring}"></span>${label}`;
  return L.divIcon({ className: "map-point", html, iconSize: [DOT_SIZE, DOT_SIZE], iconAnchor: [DOT_SIZE / 2, DOT_SIZE / 2] });
}

function pinIcon(L: Leaflet, color: string) {
  const html = `<svg viewBox="0 0 32 44" width="${(PIN_SIZE * 32) / 44}" height="${PIN_SIZE}" aria-hidden="true"><path d="M16 1C8 1 2 7 2 15c0 10.5 14 27 14 27s14-16.5 14-27C30 7 24 1 16 1Z" fill="${escapeHtml(color)}" stroke="#0b0c0e" stroke-width="2"/><circle cx="16" cy="15" r="5.5" fill="#0b0c0e"/></svg>`;
  return L.divIcon({ className: "map-pin", html, iconSize: [(PIN_SIZE * 32) / 44, PIN_SIZE], iconAnchor: [(PIN_SIZE * 32) / 88, PIN_SIZE] });
}

export function PointMap({ points, pin, focus, fitPoints = false, onMapClick, onPinMove, onPointSelect, overlay, crosshair = false }: PointMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const pointsLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const pinRef = useRef<import("leaflet").Marker | null>(null);
  const handlers = useRef({ onMapClick, onPinMove, onPointSelect });
  const [leaflet, setLeaflet] = useState<Leaflet | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    handlers.current = { onMapClick, onPinMove, onPointSelect };
  }, [onMapClick, onPinMove, onPointSelect]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadLeaflet(), fetch(FLOOD_ZONES_URL).then((response) => (response.ok ? (response.json() as Promise<FeatureCollection<Polygon | MultiPolygon>>) : null))])
      .then(([L, zones]) => {
        if (cancelled || !container.current) {
          return;
        }
        const map = L.map(container.current, { center: CITY_CENTER, zoom: CITY_ZOOM, zoomControl: false, attributionControl: true });
        L.control.zoom({ position: "bottomright" }).addTo(map);
        L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);
        if (zones) {
          L.geoJSON(zones, { style: () => ZONE_STYLE, interactive: false }).addTo(map);
        }
        pointsLayerRef.current = L.layerGroup().addTo(map);
        map.on("click", (event) => handlers.current.onMapClick?.(event.latlng.lat, event.latlng.lng));
        mapRef.current = map;
        setLeaflet(L);
      })
      .catch((error: unknown) => {
        console.warn("Map could not load:", error);
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pointsLayerRef.current = null;
      pinRef.current = null;
    };
  }, []);

  const pointsKey = JSON.stringify(points);
  useEffect(() => {
    const layer = pointsLayerRef.current;
    if (!leaflet || !layer) {
      return;
    }
    layer.clearLayers();
    for (const point of (JSON.parse(pointsKey) as MapPoint[]).filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))) {
      const marker = leaflet.marker([point.lat, point.lon], { icon: pointIcon(leaflet, point), keyboard: false, zIndexOffset: point.selected ? 500 : 0 });
      marker.bindTooltip(escapeHtml(point.label), { direction: "top", offset: [0, point.kind === "report" ? -DROP_SIZE : -DOT_SIZE / 2] });
      marker.on("click", () => handlers.current.onPointSelect?.(point.id));
      marker.addTo(layer);
    }
  }, [leaflet, pointsKey]);

  const fitKey = fitPoints ? points.map((point) => `${point.lat},${point.lon}`).join("|") : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!leaflet || !map || !fitKey) {
      return;
    }
    const corners = fitKey
      .split("|")
      .map((pair) => pair.split(",").map(Number) as [number, number])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
    if (corners.length === 0) {
      return;
    }
    const fit = () => map.fitBounds(leaflet.latLngBounds(corners), { padding: [FIT_PADDING_PX, FIT_PADDING_PX], maxZoom: MAX_FIT_ZOOM });
    whenSized(map, fit);
  }, [leaflet, fitKey]);

  const pinLat = pin?.lat;
  const pinLon = pin?.lon;
  const pinColor = pin?.color;
  useEffect(() => {
    const map = mapRef.current;
    if (!leaflet || !map) {
      return;
    }
    if (pinLat === undefined || pinLon === undefined || !pinColor) {
      pinRef.current?.remove();
      pinRef.current = null;
      return;
    }
    if (!pinRef.current) {
      pinRef.current = leaflet.marker([pinLat, pinLon], { icon: pinIcon(leaflet, pinColor), draggable: true, autoPan: true, zIndexOffset: 1000 }).addTo(map);
      pinRef.current.on("dragend", () => {
        const position = pinRef.current?.getLatLng();
        if (position) {
          handlers.current.onPinMove?.(position.lat, position.lng);
        }
      });
    } else {
      pinRef.current.setLatLng([pinLat, pinLon]);
      pinRef.current.setIcon(pinIcon(leaflet, pinColor));
    }
  }, [leaflet, pinLat, pinLon, pinColor]);

  const focusLat = focus?.lat;
  const focusLon = focus?.lon;
  useEffect(() => {
    const map = mapRef.current;
    if (!leaflet || !map || focusLat === undefined || focusLon === undefined) {
      return;
    }
    if (!Number.isFinite(focusLat) || !Number.isFinite(focusLon)) {
      return;
    }
    whenSized(map, () => map.flyTo([focusLat, focusLon], Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.6 }));
  }, [leaflet, focusLat, focusLon]);

  return (
    <div className={`absolute inset-0 isolate ${crosshair ? "[&_.leaflet-grab]:cursor-crosshair [&_.leaflet-interactive]:cursor-pointer" : ""}`}>
      <div ref={container} className="absolute inset-0 bg-ground!" />
      <RainLayer />
      {!leaflet && !failed ? (
        <p role="status" className="pointer-events-none absolute inset-x-6 top-[28%] z-[400] mx-auto w-fit rounded-full border border-rule bg-panel/90 px-4 py-2 text-sm text-ink-soft shadow-lg backdrop-blur lg:top-1/2 [html[data-sheet-open=true]_&]:max-lg:hidden">
          Cargando el mapa…
        </p>
      ) : null}
      {failed ? <p className="absolute inset-x-4 top-4 z-[500] rounded-lg border border-rule bg-panel px-4 py-3 text-sm text-ink-soft">No se pudo cargar el mapa. Podés seguir usando el buscador.</p> : null}
      {overlay ? <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex justify-center p-3 sm:p-4 [html[data-sheet-open=true]_&]:max-lg:hidden">{overlay}</div> : null}
    </div>
  );
}
