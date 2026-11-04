"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDateTime, type ApiError } from "../ui/api";

type Status = "nuevo" | "en_revision" | "asignado" | "derivacion_pendiente" | "derivado" | "cerrado";
interface Item {
  id: string; status: Status; category: string | null; priority_confirmed: number | null; location_text: string | null;
  location_precision: string | null; description: string | null; intake_complete: boolean; created_at: string;
  version: number; reopened: boolean; assigned_to: string | null;
}
interface Detail {
  incident: Item;
  contact?: { caller_name: string | null; phone: string | null; anonymous: boolean };
  events: { id: number; kind: string; from_status: string | null; to_status: string | null; at: string; actor: string; reason: string | null }[];
}
interface Summary {
  received: number; closed: number; reopened: number; pendingAtCut: number; pendingWithoutLocation: number;
  oldestPendingMin: number | null; byCategory: { category: string; received: number }[];
}

const STATUS_LABEL: Record<Status, string> = {
  nuevo: "Nuevo", en_revision: "En revisión", asignado: "Asignado",
  derivacion_pendiente: "Derivación pendiente", derivado: "Derivado", cerrado: "Cerrado",
};
/** Espejo de la máquina de estados del servidor (§2.4); el servidor valida igual. */
const NEXT: Record<Status, Status[]> = {
  nuevo: ["en_revision"],
  en_revision: ["asignado", "cerrado"],
  asignado: ["derivacion_pendiente", "cerrado"],
  derivacion_pendiente: ["derivado", "en_revision"],
  derivado: ["cerrado"],
  cerrado: ["en_revision"],
};
const needsReason = (from: Status, to: Status) => to === "cerrado" || (to === "en_revision" && from !== "nuevo");
const PAGE = 25;

/** Fecha de hoy en Rosario (AAAA-MM-DD). */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

export default function BandejaPage() {
  const [filters, setFilters] = useState({ estado: "abiertos", categoria: "", prioridad: "", sin_ubicacion: false });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: Item[]; total: number } | null>(null);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limite: String(PAGE), offset: String(offset) });
    if (filters.estado) qs.set("estado", filters.estado);
    if (filters.categoria) qs.set("categoria", filters.categoria);
    if (filters.prioridad) qs.set("prioridad", filters.prioridad);
    if (filters.sin_ubicacion) qs.set("sin_ubicacion", "1");
    try {
      setData(await api(`/api/incidents?${qs}`));
      setError(null);
    } catch (e) {
      setError((e as ApiError).error);
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    try {
      setSelected(await api<Detail>(`/api/incidents/${id}`));
    } catch (e) {
      setError((e as ApiError).error);
    }
  };

  async function move(to: Status) {
    if (!selected) return;
    let reason: string | undefined;
    if (needsReason(selected.incident.status, to)) {
      reason = prompt(to === "cerrado" ? "Motivo del cierre:" : "Motivo de la reapertura o revisión:") ?? undefined;
      if (!reason?.trim()) return;
    }
    try {
      await api(`/api/incidents/${selected.incident.id}/transition`, { body: { version: selected.incident.version, to, reason } });
      await open(selected.incident.id);
      await load();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        setError("Otro operador modificó el caso. Se recargó con los datos actuales.");
        await open(selected.incident.id);
      } else setError(err.error);
    }
  }

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setOffset(0);
    setFilters({ ...filters, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  };

  return (
    <>
      <div className="grid2">
        <section className="card">
          <h1>Bandeja de incidentes</h1>
          <div className="row filters">
            <div className="field">
              <label htmlFor="f-estado">Estado</label>
              <select id="f-estado" value={filters.estado} onChange={set("estado")}>
                <option value="abiertos">Abiertos</option>
                <option value="">Todos</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-cat">Tipo</label>
              <input id="f-cat" value={filters.categoria} onChange={set("categoria")} placeholder="ej. rescate" />
            </div>
            <div className="field">
              <label htmlFor="f-prio">Prioridad</label>
              <select id="f-prio" value={filters.prioridad} onChange={set("prioridad")}>
                <option value="">Todas</option>
                {[1, 2, 3, 4].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <label className="inline"><input type="checkbox" checked={filters.sin_ubicacion} onChange={set("sin_ubicacion")} /> Sólo sin ubicación utilizable</label>
          {error && <p className="err" role="alert">{error}</p>}
          {loading && !data && <p className="hint">Cargando…</p>}
          {data && !data.items.length && <p className="hint">No hay casos que coincidan.</p>}
          <ul className="inbox">
            {data?.items.map((i) => (
              <li key={i.id}>
                <button className={`row-btn ${selected?.incident.id === i.id ? "active" : ""}`} onClick={() => open(i.id)}>
                  <span className="prio" aria-label={`Prioridad ${i.priority_confirmed ?? "sin definir"}`}>{i.priority_confirmed ?? "–"}</span>
                  <span className="main">
                    <strong>{i.location_text ?? "Sin ubicación"}</strong>
                    <span className="meta">{i.category?.replaceAll("_", " ") ?? "sin tipo"} · {fmtDateTime(i.created_at)}</span>
                  </span>
                  <span className="tags">
                    <span className="tag">{STATUS_LABEL[i.status]}</span>
                    {!i.intake_complete && <span className="tag warn">datos incompletos</span>}
                    {!i.location_precision && <span className="tag warn">sin ubicación</span>}
                    {i.reopened && <span className="tag">reabierto</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {data && data.total > PAGE && (
            <div className="actions pager">
              <button className="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anteriores</button>
              <span className="meta">{offset + 1}–{Math.min(offset + PAGE, data.total)} de {data.total}</span>
              <button className="ghost" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Siguientes</button>
            </div>
          )}
        </section>

        <section className="card">
          <h1>Detalle</h1>
          {!selected ? (
            <p className="hint">Elegí un caso de la bandeja.</p>
          ) : (
            <>
              <p className="meta">
                {STATUS_LABEL[selected.incident.status]} · versión {selected.incident.version}
                {selected.incident.assigned_to && ` · asignado a ${selected.incident.assigned_to}`}
              </p>
              <dl className="facts">
                <dt>Lugar</dt><dd>{selected.incident.location_text ?? "—"} {selected.incident.location_precision && <span className="meta">({selected.incident.location_precision})</span>}</dd>
                <dt>Tipo</dt><dd>{selected.incident.category?.replaceAll("_", " ") ?? "—"}</dd>
                <dt>Descripción</dt><dd>{selected.incident.description ?? "—"}</dd>
                <dt>Denunciante</dt><dd>{selected.contact?.anonymous ? "Anónimo" : selected.contact?.caller_name ?? "—"}</dd>
                <dt>Teléfono</dt><dd>{selected.contact?.phone ?? "—"}</dd>
              </dl>
              <div className="actions">
                {NEXT[selected.incident.status].map((to) => (
                  <button key={to} className={to === "cerrado" ? "ghost" : ""} onClick={() => move(to)}>
                    {to === "en_revision" && selected.incident.status === "cerrado" ? "Reabrir (jefatura)" : `Pasar a ${STATUS_LABEL[to].toLowerCase()}`}
                  </button>
                ))}
              </div>
              <h2>Historial</h2>
              <ol className="history">
                {selected.events.map((e) => (
                  <li key={e.id}>
                    <span className="mono">{fmtDateTime(e.at)}</span> · {e.kind.replaceAll("_", " ")}
                    {e.from_status !== e.to_status && e.to_status && ` → ${STATUS_LABEL[e.to_status as Status] ?? e.to_status}`}
                    {" "}<span className="meta">por {e.actor}{e.reason ? ` · «${e.reason}»` : ""}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
      <SummaryPanel />
    </>
  );
}

function SummaryPanel() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Días completos en hora de Rosario (UTC-3): desde 00:00 hasta 23:59:59 local, sin pasar del momento actual.
  const range = useCallback(() => {
    const start = new Date(`${from}T00:00:00-03:00`);
    const end = new Date(Math.min(new Date(`${to}T23:59:59.999-03:00`).getTime(), Date.now()));
    return new URLSearchParams({ desde: start.toISOString(), hasta: end.toISOString() });
  }, [from, to]);

  const load = useCallback(async () => {
    try {
      setSummary(await api(`/api/incidents/summary?${range()}`));
      setError(null);
    } catch (e) {
      setError((e as ApiError).error);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card summary">
      <div className="summary-head">
        <h1>Resumen</h1>
        <div className="row">
          <div className="field"><label htmlFor="s-from">Desde</label><input id="s-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label htmlFor="s-to">Hasta (corte)</label><input id="s-to" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /></div>
          {/* El corte se calcula al hacer clic (no en el render) para no desfasar servidor y cliente. */}
          <button className="csv" onClick={() => { location.href = `/api/incidents/summary?${range()}&formato=csv`; }}>Descargar CSV</button>
        </div>
      </div>
      {error && <p className="err">{error}</p>}
      {summary && (
        <>
          <dl className="stats six">
            <div><dt>Recibidos</dt><dd>{summary.received}</dd></div>
            <div><dt>Cerrados</dt><dd>{summary.closed}</dd></div>
            <div><dt>Reabiertos</dt><dd>{summary.reopened}</dd></div>
            <div><dt>Pendientes al corte</dt><dd>{summary.pendingAtCut}</dd></div>
            <div><dt>Pendientes sin ubicación</dt><dd>{summary.pendingWithoutLocation}</dd></div>
            <div><dt>Pendiente más antiguo</dt><dd>{summary.oldestPendingMin == null ? "—" : `${summary.oldestPendingMin} min`}</dd></div>
          </dl>
          {summary.byCategory.length > 0 && (
            <p className="meta">Por tipo: {summary.byCategory.map((c) => `${c.category.replaceAll("_", " ")} ${c.received}`).join(" · ")}</p>
          )}
          <p className="hint">Sin SLA acordado todavía: no se calculan vencidos.</p>
        </>
      )}
    </section>
  );
}
