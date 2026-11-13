"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CLAIMS_API, MY_REPORTS_KEY, claimsUrl, forgetReport, parseMyReports, rememberReport, type ClaimRange } from "@/lib/claims";
import type { Report, ReportPage } from "@/lib/reportTypes";

const REFRESH_MS = 60_000;

export type ClaimsState = { status: "loading" } | { status: "error" } | { status: "ready"; page: ReportPage };

function isPage(data: unknown): data is ReportPage & { ok: true } {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const page = data as Partial<ReportPage> & { ok?: unknown };
  return page.ok === true && Array.isArray(page.reports) && typeof page.counts === "object" && page.counts !== null;
}

interface Loaded {
  key: string;
  page: ReportPage | null;
}

/** Reclamos del rango pedido. Se vuelven a consultar cada minuto y cuando la pestaña vuelve a estar a la vista. */
export function useClaims(range: ClaimRange): { state: ClaimsState; reload: () => void; replace: (report: Report) => void } {
  const key = `${range.from}|${range.to}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const [from, to] = key.split("|");
    const load = () =>
      fetch(claimsUrl({ from, to }), { cache: "no-store", signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => setLoaded({ key, page: isPage(data) ? data : null }))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setLoaded({ key, page: null });
          }
        });
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [key, attempt]);

  const reload = useCallback(() => {
    setLoaded(null);
    setAttempt((current) => current + 1);
  }, []);

  const replace = useCallback((report: Report) => {
    setLoaded((current) => (current?.page ? { ...current, page: { ...current.page, reports: current.page.reports.map((entry) => (entry.id === report.id ? report : entry)) } } : current));
  }, []);

  const state: ClaimsState = loaded?.key !== key ? { status: "loading" } : loaded.page ? { status: "ready", page: loaded.page } : { status: "error" };
  return { state, reload, replace };
}

/* «Mis reportes»: identificadores guardados en este dispositivo. */

const CHANGE_EVENT = "cota:my-reports";

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(MY_REPORTS_KEY);
  } catch {
    return null;
  }
}

function writeIds(ids: readonly string[]): boolean {
  try {
    window.localStorage.setItem(MY_REPORTS_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Guarda el reporte recién enviado para seguir su estado. Devuelve `false` si el navegador no deja guardar. */
export function saveMyReport(id: string): boolean {
  return writeIds(rememberReport(parseMyReports(readRaw()), id));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === MY_REPORTS_KEY) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export type MyReport = { id: string; status: "loading" } | { id: string; status: "ready"; report: Report } | { id: string; status: "gone" } | { id: string; status: "error" };

async function fetchOne(id: string, signal: AbortSignal): Promise<MyReport> {
  try {
    const response = await fetch(`${CLAIMS_API}/${id}`, { cache: "no-store", signal });
    if (response.status === 404) {
      return { id, status: "gone" };
    }
    const data = (await response.json()) as { ok?: boolean; report?: Report };
    return response.ok && data.ok && data.report ? { id, status: "ready", report: data.report } : { id, status: "error" };
  } catch {
    return { id, status: "error" };
  }
}

/** Estado en vivo de los reportes que este dispositivo envió. */
export function useMyReports(): { items: MyReport[]; forget: (id: string) => void } {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const [fetched, setFetched] = useState<Record<string, MyReport>>({});

  useEffect(() => {
    const ids = parseMyReports(raw);
    if (ids.length === 0) {
      return undefined;
    }
    const controller = new AbortController();
    const load = () =>
      Promise.all(ids.map((id) => fetchOne(id, controller.signal))).then((results) => {
        if (!controller.signal.aborted) {
          setFetched(Object.fromEntries(results.map((result) => [result.id, result])));
        }
      });
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [raw]);

  const forget = useCallback((id: string) => {
    writeIds(forgetReport(parseMyReports(readRaw()), id));
  }, []);

  const items = parseMyReports(raw).map((id): MyReport => fetched[id] ?? { id, status: "loading" });
  return { items, forget };
}
