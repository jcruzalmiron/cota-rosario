"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { REPORT_TYPES, type Report, type ReportType } from "@/lib/reportTypes";
import { escapeHtml } from "@/lib/html";
import { loadLeaflet } from "@/lib/leaflet";

const API = "/api/reports";
const REFRESH_MS = 60_000;
const MARKER_SIZE = 26;

export interface ReportsState {
  reports: Report[];
  error: string | null;
  available: boolean | null;
  confirmed: string[];
  confirming: string | null;
  confirm: (id: string) => Promise<void>;
}

export function howLongAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) {
    return "recién";
  }
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  return `hace ${hours} h`;
}

export async function fetchReports(): Promise<Report[]> {
  const response = await fetch(`${API}?window=active`, { cache: "no-store" });
  const data = (await response.json()) as { ok: boolean; reports?: Report[] };
  if (!response.ok || !data.ok || !Array.isArray(data.reports)) throw new Error("Reportes no disponibles");
  return data.reports;
}

function markerHtml(type: ReportType): string {
  const color = REPORT_TYPES[type].color;
  return `<svg viewBox="0 0 24 24" width="${MARKER_SIZE}" height="${MARKER_SIZE}" aria-hidden="true"><path d="M12 2.5c3.6 4.6 6.5 8.3 6.5 12a6.5 6.5 0 1 1-13 0c0-3.7 2.9-7.4 6.5-12Z" fill="${color}" stroke="#0b0c0e" stroke-width="1.5"/></svg>`;
}

export function useReports(mapRef: RefObject<import("leaflet").Map | null>, mapReady: boolean): ReportsState {
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmationPending = useRef(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchReports()
        .then((list) => {
          if (active) {
            setReports(list);
            setAvailable(true);
            setError((current) => current === "No se pudieron cargar los reportes de vecinos." ? null : current);
          }
        })
        .catch(() => {
          if (active) {
            setError("No se pudieron cargar los reportes de vecinos.");
            setAvailable(false);
            setReports([]);
          }
        });
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) {
      return;
    }
    loadLeaflet().then((L) => {
      if (!layerRef.current) {
        layerRef.current = L.layerGroup().addTo(map);
      }
      layerRef.current.clearLayers();
      for (const report of reports) {
        const icon = L.divIcon({ className: "report-marker", html: markerHtml(report.type), iconSize: [MARKER_SIZE, MARKER_SIZE], iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE] });
        const detail = report.description ? `<br/><span class="report-desc">${escapeHtml(report.description)}</span>` : "";
        const confirmations = report.confirmations > 0 ? ` · ${report.confirmations} confirm.` : "";
        L.marker([report.lat, report.lon], { icon })
          .bindTooltip(`<strong>${REPORT_TYPES[report.type].label}</strong> · ${howLongAgo(report.createdAt)}${confirmations}${detail}`, { direction: "top", offset: [0, -MARKER_SIZE] })
          .addTo(layerRef.current);
      }
    });
  }, [mapRef, mapReady, reports]);

  const confirm = useCallback(async (id: string) => {
    if (confirmationPending.current || confirmed.includes(id)) return;
    confirmationPending.current = true;
    setConfirming(id);
    try {
      const response = await fetch(`${API}/${id}/confirm`, { method: "POST" });
      const data = (await response.json()) as { ok: boolean; error?: string; report?: Report };
      if (!data.ok || !data.report) {
        setError(data.error ?? "No se pudo confirmar.");
        return;
      }
      setReports((current) => current.map((report) => (report.id === id ? (data.report as Report) : report)));
      setConfirmed((current) => [...current, id]);
    } catch {
      setError("No se pudo confirmar. Probá de nuevo.");
    } finally {
      confirmationPending.current = false;
      setConfirming(null);
    }
  }, [confirmed]);

  return { reports, error, available, confirmed, confirming, confirm };
}
