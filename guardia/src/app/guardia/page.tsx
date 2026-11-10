"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDuration, fmtElapsed, fmtTime, type ApiError } from "../ui/api";
import { ask } from "../ui/ask";

type Issue = { field: string; message: string };
interface Incident { id: string; version: number; status: string; location_text: string | null }
interface BoardItem {
  id: string; mobile_code: string; location_text: string | null; category: string | null; status: string;
  dispatched_at: string; arrived_at: string | null; panorama_pending: boolean; external_ref: string | null;
  elapsedMin: number; sinceLastUpdateMin: number | null; open_alert_id: number | null; alert_acked: boolean | null;
}

const EMPTY = { callerName: "", anonymous: false, phone: "", locationText: "", category: "", description: "" };
const CATEGORIES = ["incendio_estructural", "incendio_vehicular", "incendio_pastizal", "rescate", "materiales_peligrosos", "accidente_transito", "fuga_gas", "electrico", "otro"];
const label = (category: string) => category.replaceAll("_", " ");

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

  // Lo que el despacho exige, visible mientras se carga la llamada (la validación final la hace el servidor).
  const ready = [
    { name: "Denunciante", ok: form.anonymous || form.callerName.trim().length > 0 },
    { name: "Teléfono", ok: form.phone.trim().length > 0 },
    { name: "Lugar", ok: form.locationText.trim().length > 0 },
  ];

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = incident
        ? await api<{ incident: Incident; issues: Issue[] }>(`/api/incidents/${incident.id}/intake`, { method: "PATCH", body: { ...form, version: incident.version } })
        : await api<{ incident: Incident; issues: Issue[] }>("/api/incidents", { body: { ...form, origin: "llamada" } });
      setIncident(r.incident);
      setIssues(r.issues);
      setMsg(r.issues.length ? "Borrador guardado. Faltan datos para despachar." : "Datos completos. Ya podés despachar.");
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
    const answer = await ask({
      title: "Excepción de jefatura",
      detail: "Permite despachar con datos faltantes. Queda auditada y los datos pendientes pasan a ser una tarea.",
      fields: [{ name: "reason", label: "Motivo", type: "textarea", required: true }],
      confirmLabel: "Registrar excepción",
      danger: true,
    });
    const reason = answer?.reason;
    if (!reason) return;
    try {
      await api(`/api/incidents/${incident.id}/exception`, { body: { reason } });
      setMsg("Excepción registrada. Los datos faltantes quedan como tarea pendiente.");
    } catch (e) {
      setMsg((e as ApiError).error);
    }
  }

  return (
    <section className="card intake" aria-labelledby="intake-title">
      <h1 id="intake-title">Nueva llamada</h1>
      <ul className="ready" aria-label="Datos que exige el despacho">
        {ready.map((item) => (
          <li key={item.name} className={item.ok ? "ok" : ""}>
            {item.name}
            <span className="sr">{item.ok ? " cargado" : " falta"}</span>
          </li>
        ))}
      </ul>
      <div className="field">
        <label htmlFor="loc">Lugar</label>
        <input id="loc" placeholder="Dirección con altura, intersección o referencia" value={form.locationText} onChange={set("locationText")} aria-invalid={!!issueFor("lugar")} />
        {issueFor("lugar") && <p className="err">{issueFor("lugar")}</p>}
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="caller">Denunciante</label>
          <input id="caller" value={form.callerName} onChange={set("callerName")} disabled={form.anonymous} aria-invalid={!!issueFor("denunciante")} />
          {issueFor("denunciante") && <p className="err">{issueFor("denunciante")}</p>}
        </div>
        <div className="field">
          <label htmlFor="phone">Teléfono</label>
          <input id="phone" inputMode="tel" value={form.phone} onChange={set("phone")} aria-invalid={!!issueFor("telefono")} />
          {issueFor("telefono") && <p className="err">{issueFor("telefono")}</p>}
        </div>
      </div>
      <label className="inline anon"><input type="checkbox" checked={form.anonymous} onChange={set("anonymous")} /> No quiere dar su nombre</label>
      <div className="field">
        <span className="lbl" id="cat-label">Tipo</span>
        <div className="chips" role="group" aria-labelledby="cat-label">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={form.category === c} onClick={() => setForm({ ...form, category: form.category === c ? "" : c })}>
              {label(c)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="desc">Descripción</label>
        <textarea id="desc" rows={3} value={form.description} onChange={set("description")} />
      </div>
      <div className="actions">
        <button className="big" onClick={save} disabled={busy}>{incident ? "Actualizar datos" : "Guardar llamada"}</button>
        <span className="hint">Se guarda todo lo que ingreses.</span>
      </div>

      {incident && (
        <div className="dispatch">
          <h2>Despacho</h2>
          <div className="row">
            <div className="field">
              <label htmlFor="mob">Móvil</label>
              <input id="mob" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="M-1" />
            </div>
            <div className="field">
              <label htmlFor="bravo">N.º en Bravo/Brau <span className="optional">· opcional</span></label>
              <input id="bravo" value={bravoRef} onChange={(e) => setBravoRef(e.target.value)} />
            </div>
          </div>
          <div className="actions">
            <button className="primary big" onClick={dispatch} disabled={busy || !mobile.trim()}>Despachar móvil</button>
            {issues.length > 0 && <button className="ghost" onClick={exception}>Excepción de jefatura</button>}
          </div>
        </div>
      )}
      {msg && <p className="status" role="status">{msg}</p>}
    </section>
  );
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function RadioBoard() {
  const [items, setItems] = useState<BoardItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const now = useNow(1000);

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
    const where = d.location_text ?? "sin lugar";
    const answer = await ask(
      kind === "arribo"
        ? {
            title: `Arribo de ${d.mobile_code}`,
            detail: where,
            fields: [{ name: "body", label: "Panorama de arribo", type: "textarea", hint: "Si todavía no lo dieron, dejalo vacío: queda como pendiente." }],
            confirmLabel: "Registrar arribo",
          }
        : kind === "panorama"
          ? { title: `Panorama de ${d.mobile_code}`, detail: where, fields: [{ name: "body", label: "Panorama", type: "textarea", required: true }], confirmLabel: "Cargar panorama" }
          : kind === "novedad"
            ? { title: `Novedad de ${d.mobile_code}`, detail: where, fields: [{ name: "body", label: "Novedad", type: "textarea", required: true }], confirmLabel: "Registrar novedad" }
            : { title: `¿Registrar el retorno de ${d.mobile_code}?`, detail: `${where}. El móvil deja de figurar en servicio.`, confirmLabel: "Registrar retorno", danger: true },
    );
    if (!answer) return;
    const body = answer.body || undefined;
    try {
      await api(`/api/dispatch/${d.id}/updates`, { body: { kind, channel: "radio", body, sourceKey: crypto.randomUUID() } });
      await load();
    } catch (e) {
      setError((e as ApiError).error);
    }
  }

  async function ack(alertId: number) {
    try {
      await api(`/api/guard/alerts/${alertId}/ack`, { method: "POST" });
      await load();
    } catch (e) {
      setError((e as ApiError).error);
    }
  }

  const silent = items.filter((d) => d.open_alert_id).length;
  const pending = items.filter((d) => d.panorama_pending).length;
  const onsite = items.filter((d) => d.status === "en_lugar").length;
  // Primero lo que pide atención: sin novedad sin acusar, después acusado, después el resto por antigüedad.
  const rank = (d: BoardItem) => (d.open_alert_id ? (d.alert_acked ? 1 : 0) : 2);
  const ordered = [...items].sort((a, b) => rank(a) - rank(b) || a.dispatched_at.localeCompare(b.dispatched_at));

  return (
    <section className="ops" aria-label="Móviles en servicio">
      <div className="kpis">
        <div className="kpi live"><span className="n">{loaded ? items.length : "–"}</span><span className="l">En servicio</span></div>
        <div className={`kpi alert${silent ? " on" : ""}`}><span className="n">{loaded ? silent : "–"}</span><span className="l">Sin novedad</span></div>
        <div className={`kpi warn${pending ? " on" : ""}`}><span className="n">{loaded ? pending : "–"}</span><span className="l">Panorama pendiente</span></div>
        <div className="kpi"><span className="n">{loaded ? onsite : "–"}</span><span className="l">En el lugar</span></div>
      </div>

      {error && <p className="err" role="status">{error}</p>}
      {loaded && !items.length && !error && (
        <div className="empty">
          <strong>Sin móviles en servicio</strong>
          <span>Cuando despaches un móvil va a aparecer acá con su cronómetro y sus avisos.</span>
        </div>
      )}

      <ul className="strips">
        {ordered.map((d) => {
          const onSite = d.status === "en_lugar";
          const alert = Boolean(d.open_alert_id);
          return (
            <li key={d.id} className={`strip${alert ? " alert" : ""}${alert && d.alert_acked ? " acked" : ""}${onSite ? " onsite" : ""}`}>
              <div className="plate">
                <strong>{d.mobile_code}</strong>
                <span>{onSite ? "En el lugar" : "En camino"}</span>
              </div>

              <div className="body">
                <p className="place">{d.location_text ?? "Sin lugar"}</p>
                <p className="kind">
                  <b>{d.category ? label(d.category) : "Sin tipo"}</b>
                  {d.external_ref && <span>Bravo {d.external_ref}</span>}
                  {d.panorama_pending && <span className="tag warn">Panorama pendiente</span>}
                </p>
                <ol className="track" aria-label="Recorrido">
                  <li className="done">Despacho<b>{fmtTime(d.dispatched_at)}</b></li>
                  <li className={onSite ? "done" : "now"}>En camino<b>{onSite ? " " : "ahora"}</b></li>
                  <li className={onSite ? (d.panorama_pending ? "wait" : "now") : ""}>En el lugar<b>{d.arrived_at ? fmtTime(d.arrived_at) : "—"}</b></li>
                </ol>
                {alert &&
                  (d.alert_acked ? (
                    <div className="alertbox acked">Aviso acusado: pedí novedad por radio.</div>
                  ) : (
                    <div className="alertbox">
                      <span>Sin novedad del móvil</span>
                      <button onClick={() => ack(d.open_alert_id!)}>Acusar aviso</button>
                    </div>
                  ))}
                <div className="actions">
                  <button onClick={() => update(d, "novedad")}>Novedad</button>
                  {!onSite && <button onClick={() => update(d, "arribo")}>Arribo</button>}
                  {d.panorama_pending && <button onClick={() => update(d, "panorama")}>Cargar panorama</button>}
                  <button className="ghost push" onClick={() => update(d, "retorno")}>Retorno</button>
                </div>
              </div>

              <div className="timer">
                <span className="t" title="Tiempo desde el despacho">{fmtElapsed(d.dispatched_at, now)}</span>
                <span className="l">desde el despacho</span>
                <span className={`u${d.sinceLastUpdateMin == null ? " none" : ""}`}>
                  {d.sinceLastUpdateMin == null ? "Sin novedades todavía" : `Última novedad hace ${fmtDuration(d.sinceLastUpdateMin)}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
