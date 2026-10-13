"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { REPORT_TYPES, type Report, type ReportType } from "@/lib/reportTypes";

const API = "/api/reportes";
const REFRESH_MS = 60_000;
const MARKER_SIZE = 26;

export interface ReportDraft {
  lat: number;
  lon: number;
  tipo: ReportType;
  descripcion: string;
}

export interface ReportsState {
  reportes: Report[];
  colocando: boolean;
  borrador: ReportDraft | null;
  enviando: boolean;
  error: string | null;
  disponible: boolean | null;
  confirmados: string[];
  confirmando: string | null;
  colocarCentro: () => void;
  empezarColocacion: () => void;
  cancelar: () => void;
  actualizarBorrador: (cambios: Partial<ReportDraft>) => void;
  enviar: () => Promise<void>;
  confirmar: (id: string) => Promise<void>;
}

function escapeHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export function haceCuanto(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) {
    return "recién";
  }
  if (minutos < 60) {
    return `hace ${minutos} min`;
  }
  const horas = Math.round(minutos / 60);
  return `hace ${horas} h`;
}

async function fetchReports(): Promise<Report[]> {
  const response = await fetch(API, { cache: "no-store" });
  const data = (await response.json()) as { ok: boolean; reportes?: Report[] };
  if (!response.ok || !data.ok || !Array.isArray(data.reportes)) throw new Error("Reportes no disponibles");
  return data.reportes;
}

function markerHtml(tipo: ReportType): string {
  const color = REPORT_TYPES[tipo].color;
  return `<svg viewBox="0 0 24 24" width="${MARKER_SIZE}" height="${MARKER_SIZE}" aria-hidden="true"><path d="M12 2.5c3.6 4.6 6.5 8.3 6.5 12a6.5 6.5 0 1 1-13 0c0-3.7 2.9-7.4 6.5-12Z" fill="${color}" stroke="#0b0c0e" stroke-width="1.5"/></svg>`;
}

export function useReports(mapRef: RefObject<import("leaflet").Map | null>, mapReady: boolean): ReportsState {
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const draftMarkerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const [reportes, setReportes] = useState<Report[]>([]);
  const [colocando, setColocando] = useState(false);
  const [borrador, setBorrador] = useState<ReportDraft | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [confirmados, setConfirmados] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const confirmationPending = useRef(false);

  useEffect(() => {
    let activo = true;
    const cargar = () =>
      fetchReports()
        .then((lista) => {
          if (activo) {
            setReportes(lista);
            setDisponible(true);
            setError((current) => current === "No se pudieron cargar los reportes de vecinos." ? null : current);
          }
        })
        .catch(() => {
          if (activo) {
            setError("No se pudieron cargar los reportes de vecinos.");
            setDisponible(false);
            setReportes([]);
          }
        });
    cargar();
    const interval = window.setInterval(cargar, REFRESH_MS);
    return () => {
      activo = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) {
      return;
    }
    import("leaflet").then((L) => {
      if (!layerRef.current) {
        layerRef.current = L.layerGroup().addTo(map);
      }
      layerRef.current.clearLayers();
      for (const reporte of reportes) {
        const icon = L.divIcon({ className: "report-marker", html: markerHtml(reporte.tipo), iconSize: [MARKER_SIZE, MARKER_SIZE], iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE] });
        const detalle = reporte.descripcion ? `<br/><span class="report-desc">${escapeHtml(reporte.descripcion)}</span>` : "";
        const confirmaciones = reporte.confirmaciones > 0 ? ` · ${reporte.confirmaciones} confirm.` : "";
        L.marker([reporte.lat, reporte.lon], { icon })
          .bindTooltip(`<strong>${REPORT_TYPES[reporte.tipo].etiqueta}</strong> · ${haceCuanto(reporte.creadoEn)}${confirmaciones}${detalle}`, { direction: "top", offset: [0, -MARKER_SIZE] })
          .addTo(layerRef.current);
      }
    });
  }, [mapRef, mapReady, reportes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !colocando) {
      return undefined;
    }
    const container = map.getContainer();
    container.style.cursor = "crosshair";
    const onClick = (event: import("leaflet").LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      setBorrador((current) => ({ lat, lon: lng, tipo: current?.tipo ?? "calle", descripcion: current?.descripcion ?? "" }));
      import("leaflet").then((L) => {
        draftMarkerRef.current?.remove();
        draftMarkerRef.current = L.circleMarker([lat, lng], { radius: 9, color: "#eceef1", weight: 2, fillColor: "#5f9bb8", fillOpacity: 0.9 }).addTo(map);
      });
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      container.style.cursor = "";
    };
  }, [mapRef, mapReady, colocando]);

  const limpiarBorrador = useCallback(() => {
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    setBorrador(null);
  }, []);

  const empezarColocacion = useCallback(() => {
    setError(null);
    setColocando(true);
  }, []);

  const cancelar = useCallback(() => {
    setColocando(false);
    limpiarBorrador();
  }, [limpiarBorrador]);

  const colocarCentro = useCallback(() => {
    const map = mapRef.current;
    if (map) map.fire("click", { latlng: map.getCenter() });
  }, [mapRef]);

  const actualizarBorrador = useCallback((cambios: Partial<ReportDraft>) => {
    setBorrador((current) => (current ? { ...current, ...cambios } : current));
  }, []);

  const enviar = useCallback(async () => {
    if (!borrador) {
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const response = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...borrador, web: "" }) });
      const data = (await response.json()) as { ok: boolean; error?: string; reporte?: Report };
      if (!data.ok || !data.reporte) {
        setError(data.error ?? "No se pudo enviar el reporte.");
        return;
      }
      setReportes((current) => [data.reporte as Report, ...current]);
      setColocando(false);
      limpiarBorrador();
    } catch {
      setError("No se pudo enviar el reporte. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }, [borrador, limpiarBorrador]);

  const confirmar = useCallback(async (id: string) => {
    if (confirmationPending.current || confirmados.includes(id)) return;
    confirmationPending.current = true;
    setConfirmando(id);
    try {
      const response = await fetch(`${API}/${id}/confirmar`, { method: "POST" });
      const data = (await response.json()) as { ok: boolean; error?: string; reporte?: Report };
      if (!data.ok || !data.reporte) {
        setError(data.error ?? "No se pudo confirmar.");
        return;
      }
      setReportes((current) => current.map((reporte) => (reporte.id === id ? (data.reporte as Report) : reporte)));
      setConfirmados((current) => [...current, id]);
    } catch {
      setError("No se pudo confirmar. Probá de nuevo.");
    } finally {
      confirmationPending.current = false;
      setConfirmando(null);
    }
  }, [confirmados]);

  return { reportes, colocando, borrador, enviando, error, disponible, confirmados, confirmando, colocarCentro, empezarColocacion, cancelar, actualizarBorrador, enviar, confirmar };
}
