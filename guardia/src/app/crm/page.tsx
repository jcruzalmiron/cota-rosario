"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDateTime, type ApiError } from "../ui/api";
import { ask } from "../ui/ask";

interface Task { id: string; title: string; company: string; due_at: string; version: number; reminded: boolean; owner: string }
interface Summary { capacidad: number; provisoria: number; confirmada: number; disponible: number }

export default function CrmPage() {
  const [board, setBoard] = useState<{ vencidas: Task[]; proximas: Task[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [company, setCompany] = useState({ name: "", followUpDays: "7", followUpTitle: "Volver a llamar" });
  const [eventForm, setEventForm] = useState({ name: "", venue: "", tableCapacity: "" });
  const [eventId, setEventId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [res, setRes] = useState({ holderLabel: "", tables: "1", provisionalHours: "48" });

  const report = (e: unknown) => setMsg((e as ApiError).error);

  const load = useCallback(async () => {
    try {
      setBoard(await api("/api/crm/board"));
    } catch (e) {
      report(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCompany() {
    try {
      await api("/api/crm/companies", { body: { name: company.name, followUpDays: Number(company.followUpDays) || undefined, followUpTitle: company.followUpTitle } });
      setCompany({ ...company, name: "" });
      await load();
    } catch (e) { report(e); }
  }

  async function taskAction(t: Task, action: "hecha" | "reprogramar") {
    const answer = await ask(
      action === "hecha"
        ? { title: "Marcar la gestión como hecha", fields: [{ name: "result", label: "Resultado de la gestión", type: "textarea", required: true }], confirmLabel: "Marcar hecha" }
        : { title: "Reprogramar la gestión", fields: [{ name: "days", label: "¿En cuántos días?", type: "number", initial: "7", required: true, min: 1, max: 365 }], confirmLabel: "Reprogramar" },
    );
    if (!answer) return;
    const payload = action === "hecha" ? { action, version: t.version, result: answer.result } : { action, version: t.version, days: Number(answer.days) || 7 };
    try {
      await api(`/api/crm/tasks/${t.id}`, { body: payload });
      await load();
    } catch (e) { report(e); }
  }

  async function createEvent() {
    try {
      const { id } = await api<{ id: string }>("/api/crm/events", { body: { name: eventForm.name, venue: eventForm.venue, tableCapacity: Number(eventForm.tableCapacity) } });
      setEventId(id);
      setSummary(await api(`/api/crm/events/${id}`));
    } catch (e) { report(e); }
  }

  async function reserve() {
    if (!eventId) return;
    try {
      await api(`/api/crm/events/${eventId}`, { body: { holderLabel: res.holderLabel, tables: Number(res.tables), provisionalHours: Number(res.provisionalHours) || undefined } });
      setSummary(await api(`/api/crm/events/${eventId}`));
      setRes({ ...res, holderLabel: "" });
    } catch (e) { report(e); }
  }

  const TaskList = ({ items, empty }: { items: Task[]; empty: string }) =>
    items.length ? (
      <ul className="tasks">
        {items.map((t) => (
          <li key={t.id}>
            <div><strong>{t.company}</strong> · {t.title}</div>
            <div className="meta">{fmtDateTime(t.due_at)} {t.reminded && <span className="tag">aviso emitido</span>}</div>
            <div className="actions">
              <button onClick={() => taskAction(t, "hecha")}>Hecha</button>
              <button className="ghost" onClick={() => taskAction(t, "reprogramar")}>Reprogramar</button>
            </div>
          </li>
        ))}
      </ul>
    ) : <p className="hint">{empty}</p>;

  return (
    <div className="grid2">
      <section className="card">
        <h1>Seguimientos</h1>
        {msg && <p className="err">{msg}</p>}
        <h2>Vencidos</h2>
        <TaskList items={board?.vencidas ?? []} empty="Nada vencido." />
        <h2>Próximos 7 días</h2>
        <TaskList items={board?.proximas ?? []} empty="Sin seguimientos próximos." />
        <h2>Nueva empresa</h2>
        <div className="row">
          <div className="field"><label htmlFor="cn">Empresa</label><input id="cn" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="cd">Seguimiento en (días)</label><input id="cd" inputMode="numeric" value={company.followUpDays} onChange={(e) => setCompany({ ...company, followUpDays: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="ct">Tarea</label><input id="ct" value={company.followUpTitle} onChange={(e) => setCompany({ ...company, followUpTitle: e.target.value })} /></div>
        <div className="actions"><button onClick={addCompany} disabled={!company.name.trim()}>Agregar</button></div>
      </section>

      <section className="card">
        <h1>Eventos y mesas</h1>
        {!eventId ? (
          <>
            <p className="hint">Cargá fecha, lugar y capacidad confirmados por administración.</p>
            <div className="field"><label htmlFor="en">Evento</label><input id="en" value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} /></div>
            <div className="row">
              <div className="field"><label htmlFor="ev">Lugar</label><input id="ev" value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} /></div>
              <div className="field"><label htmlFor="ec">Mesas disponibles</label><input id="ec" inputMode="numeric" value={eventForm.tableCapacity} onChange={(e) => setEventForm({ ...eventForm, tableCapacity: e.target.value })} /></div>
            </div>
            <div className="actions"><button onClick={createEvent} disabled={!eventForm.name.trim() || !eventForm.tableCapacity}>Crear evento</button></div>
          </>
        ) : (
          <>
            {summary && (
              <dl className="stats">
                <div><dt>Capacidad</dt><dd>{summary.capacidad}</dd></div>
                <div><dt>Confirmadas</dt><dd>{summary.confirmada}</dd></div>
                <div><dt>Provisorias</dt><dd>{summary.provisoria}</dd></div>
                <div><dt>Disponibles</dt><dd>{summary.disponible}</dd></div>
              </dl>
            )}
            <div className="row">
              <div className="field"><label htmlFor="rh">Reserva a nombre de</label><input id="rh" value={res.holderLabel} onChange={(e) => setRes({ ...res, holderLabel: e.target.value })} /></div>
              <div className="field"><label htmlFor="rt">Mesas</label><input id="rt" inputMode="numeric" value={res.tables} onChange={(e) => setRes({ ...res, tables: e.target.value })} /></div>
              <div className="field"><label htmlFor="rp">Vence en (h, vacío = confirmada)</label><input id="rp" inputMode="numeric" value={res.provisionalHours} onChange={(e) => setRes({ ...res, provisionalHours: e.target.value })} /></div>
            </div>
            <div className="actions"><button onClick={reserve} disabled={!res.holderLabel.trim()}>Reservar</button></div>
          </>
        )}
      </section>
    </div>
  );
}
