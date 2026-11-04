"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtTime, type ApiError } from "../ui/api";

type Issue = { field: string; message: string };
interface Incident { id: string; version: number; status: string; location_text: string | null }
interface BoardItem {
  id: string; mobile_code: string; location_text: string | null; category: string | null; status: string;
  dispatched_at: string; arrived_at: string | null; panorama_pending: boolean; external_ref: string | null;
  elapsedMin: number; sinceLastUpdateMin: number | null; open_alert_id: number | null; alert_acked: boolean | null;
}

const EMPTY = { callerName: "", anonymous: false, phone: "", locationText: "", category: "", description: "" };
const CATEGORIES = ["incendio_estructural", "incendio_vehicular", "incendio_pastizal", "rescate", "materiales_peligrosos", "accidente_transito", "fuga_gas", "electrico", "otro"];

export default function GuardiaPage() {
  return (
    <div className="grid2 lead-first">
      <RadioBoard />
      <IntakePanel />
    </div>
  );
}

function IntakePanel() {
  const [form, setForm] = useState(EMPTY);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [mobile, setMobile] = useState("");
  const [bravoRef, setBravoRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attemptKey = useRef<string>(crypto.randomUUID());

  const issueFor = (f: string) => issues.find((i) => i.field === f)?.message;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = incident
        ? await api<{ incident: Incident; issues: Issue[] }>(`/api/incidents/${incident.id}/intake`, { method: "PATCH", body: { ...form, version: incident.version } })
        : await api<{ incident: Incident; issues: Issue[] }>("/api/incidents", { body: { ...form, origin: "llamada" } });
      setIncident(r.incident);
      setIssues(r.issues);
      setMsg(r.issues.length ? "Borrador guardado. Faltan datos para despachar." : "Datos completos.");
    } catch (e) {
      const err = e as ApiError;
      setMsg(err.status === 409 ? "Otro operador modificó la llamada. Recargá antes de seguir." : err.error);
    } finally {
      setBusy(false);
    }
  }

  async function dispatch() {
    if (!incident) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/dispatch", { body: { incidentId: incident.id, mobileCode: mobile, idempotencyKey: attemptKey.current, externalRef: bravoRef || undefined } });
      setMsg(`Móvil ${mobile} despachado. El aviso por falta de novedad corre desde ahora.`);
      setForm(EMPTY);
      setIncident(null);
      setIssues([]);
      setMobile("");
      setBravoRef("");
      attemptKey.current = crypto.randomUUID();
    } catch (e) {
      const err = e as ApiError;
      if (err.fields?.length) setIssues(err.fields);
      setMsg(err.error);
    } finally {
      setBusy(false);
    }
  }

  async function exception() {
    if (!incident) return;
    const reason = prompt("Motivo de la excepción (queda auditado):");
    if (!reason) return;
    try {
      await api(`/api/incidents/${incident.id}/exception`, { body: { reason } });
      setMsg("Excepción registrada. Los datos faltantes quedan como tarea pendiente.");
    } catch (e) {
      setMsg((e as ApiError).error);
    }
  }

  return (
    <section className="card">
      <h1>Nueva llamada</h1>
      <p className="hint">Se guarda todo lo que ingreses. Para despachar se exigen denunciante, teléfono y lugar.</p>
      <div className="field">
        <label htmlFor="caller">Denunciante</label>
        <input id="caller" value={form.callerName} onChange={set("callerName")} disabled={form.anonymous} aria-invalid={!!issueFor("denunciante")} />
        <label className="inline"><input type="checkbox" checked={form.anonymous} onChange={set("anonymous")} /> No quiere dar su nombre</label>
        {issueFor("denunciante") && <p className="err">{issueFor("denunciante")}</p>}
      </div>
      <div className="field">
        <label htmlFor="phone">Teléfono</label>
        <input id="phone" inputMode="tel" value={form.phone} onChange={set("phone")} aria-invalid={!!issueFor("telefono")} />
        {issueFor("telefono") && <p className="err">{issueFor("telefono")}</p>}
      </div>
      <div className="field">
        <label htmlFor="loc">Lugar</label>
        <input id="loc" placeholder="Dirección con altura, intersección o referencia" value={form.locationText} onChange={set("locationText")} aria-invalid={!!issueFor("lugar")} />
        {issueFor("lugar") && <p className="err">{issueFor("lugar")}</p>}
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="cat">Tipo</label>
          <select id="cat" value={form.category} onChange={set("category")}>
            <option value="">Sin definir</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="desc">Descripción</label>
        <textarea id="desc" rows={3} value={form.description} onChange={set("description")} />
      </div>
      <div className="actions">
        <button onClick={save} disabled={busy}>{incident ? "Actualizar datos" : "Guardar llamada"}</button>
      </div>

      {incident && (
        <div className="dispatch">
          <h2>Despacho</h2>
          <div className="row">
            <div className="field">
              <label htmlFor="mob">Móvil</label>
              <input id="mob" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="bravo">N.º en Bravo/Brau (opcional)</label>
              <input id="bravo" value={bravoRef} onChange={(e) => setBravoRef(e.target.value)} />
            </div>
          </div>
          <div className="actions">
            <button className="primary" onClick={dispatch} disabled={busy || !mobile.trim()}>Despachar</button>
            {issues.length > 0 && <button className="ghost" onClick={exception}>Excepción de jefatura</button>}
          </div>
        </div>
      )}
      {msg && <p className="status" role="status">{msg}</p>}
    </section>
  );
}

function RadioBoard() {
  const [items, setItems] = useState<BoardItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<BoardItem[]>("/api/guard/board"));
      setError(null);
    } catch (e) {
      setError((e as ApiError).error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function update(d: BoardItem, kind: "novedad" | "arribo" | "panorama" | "retorno") {
    let body: string | undefined;
    if (kind === "arribo" || kind === "panorama") {
      body = prompt(kind === "arribo" ? "Panorama de arribo (si todavía no lo dieron, dejalo vacío y queda pendiente):" : "Panorama:") ?? undefined;
      if (kind === "panorama" && !body) return;
    } else if (kind === "novedad") {
      body = prompt("Novedad del móvil:") ?? undefined;
      if (body === undefined) return;
    }
    try {
      await api(`/api/dispatch/${d.id}/updates`, { body: { kind, channel: "radio", body, sourceKey: crypto.randomUUID() } });
      await load();
    } catch (e) {
      setError((e as ApiError).error);
    }
  }

  async function ack(alertId: number) {
    await api(`/api/guard/alerts/${alertId}/ack`, { method: "POST" });
    await load();
  }

  return (
    <section className="card">
      <h1>Móviles en servicio</h1>
      {error && <p className="err">{error}</p>}
      {loaded && !items.length && !error && <p className="hint">No hay móviles en servicio.</p>}
      <ul className="board">
        {items.map((d) => (
          <li key={d.id} className={d.open_alert_id && !d.alert_acked ? "alert" : ""}>
            <div className="mob">
              <strong>{d.mobile_code}</strong>
              <span className="tag">{d.status === "en_lugar" ? "en el lugar" : "en camino"}</span>
              {d.panorama_pending && <span className="tag warn">panorama pendiente</span>}
            </div>
            <div className="where">{d.location_text ?? "Sin lugar"} · {d.category?.replaceAll("_", " ") ?? "sin tipo"}</div>
            <div className="times">
              <span>Despacho {fmtTime(d.dispatched_at)}</span>
              <span className="mono">{d.elapsedMin} min</span>
              <span>Última novedad: {d.sinceLastUpdateMin == null ? "ninguna" : `hace ${d.sinceLastUpdateMin} min`}</span>
              <span>ETA: sin base validada</span>
            </div>
            {d.open_alert_id && (
              <div className="alertbox">
                Sin novedad del móvil. {d.alert_acked ? "Aviso acusado: pedí novedad por radio." : <button onClick={() => ack(d.open_alert_id!)}>Acusar aviso</button>}
              </div>
            )}
            <div className="actions">
              <button onClick={() => update(d, "novedad")}>Novedad</button>
              {d.status !== "en_lugar" && <button onClick={() => update(d, "arribo")}>Arribo</button>}
              {d.panorama_pending && <button onClick={() => update(d, "panorama")}>Cargar panorama</button>}
              <button className="ghost" onClick={() => confirm(`¿Registrar retorno de ${d.mobile_code}?`) && update(d, "retorno")}>Retorno</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
