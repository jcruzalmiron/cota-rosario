"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDuration, type ApiError } from "../ui/api";

interface Metric {
  key: string; title: string; start: string; end: string; unit: "min" | "casos"; universe: string; exclusions: string;
  n?: number; excluded?: number; median?: number | null; p90?: number | null; max?: number | null;
  value?: number; of?: number | null;
}

const PERIODS = [
  { label: "Últimas 24 h", hours: 24 },
  { label: "Últimos 7 días", hours: 24 * 7 },
  { label: "Últimos 30 días", hours: 24 * 30 },
];

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtDuration(v));

export default function MetricasPage() {
  const [hours, setHours] = useState(24 * 7);
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - hours * 3_600_000);
    try {
      const r = await api<{ metrics: Metric[] }>(`/api/metrics?${new URLSearchParams({ desde: from.toISOString(), hasta: to.toISOString() })}`);
      setMetrics(r.metrics);
      setError(null);
    } catch (e) {
      setError((e as ApiError).error);
    }
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card">
      <div className="summary-head">
        <h1>Indicadores</h1>
        <div className="field">
          <label htmlFor="period">Período</label>
          <select id="period" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {PERIODS.map((p) => <option key={p.hours} value={p.hours}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <p className="hint">Definiciones propuestas: validarlas con jefes de guardia antes de usarlas para evaluar desempeño. Sin umbrales acordados no se generan alertas.</p>
      {error && <p className="err">{error}</p>}
      <div className="metrics">
        {metrics?.map((m) => (
          <article key={m.key} className="metric">
            <h2>{m.title}</h2>
            {m.unit === "min" ? (
              <>
                <p className="big">{fmt(m.median)} <span className="meta">mediana</span></p>
                <p className="meta">p90 {fmt(m.p90)} · máx. {fmt(m.max)}</p>
                <p className="meta">{m.n} casos medidos{m.excluded ? ` · ${m.excluded} excluidos (${m.exclusions})` : ""}</p>
              </>
            ) : (
              <>
                <p className="big">{m.value}<span className="meta">{m.of !== null && m.of !== undefined ? ` de ${m.of}` : ""}</span></p>
                <p className="meta">Universo: {m.universe}</p>
              </>
            )}
            <details>
              <summary>Definición</summary>
              <p className="meta">Desde: {m.start}. Hasta: {m.end}. Universo: {m.universe}. Exclusiones: {m.exclusions}.</p>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
