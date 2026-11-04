"use client";

import { useState } from "react";
import { api, type ApiError } from "../ui/api";

const KIND = "informe_intervencion_fiscalia";

interface Question { field: string; question: string; canMarkUnknown: boolean; options?: string[]; list?: boolean }
interface View {
  revision: { id: number; revision_no: number; status: string; field_values: Record<string, { value?: string | string[]; source: string; evidence?: string }> };
  template: { kind: string; version: number; status: string };
  questions: Question[];
  contradictions: { fields: string[]; message: string }[];
  suggestions: { field: string; question: string }[];
  draft: string;
}

export default function InformesPage() {
  const [title, setTitle] = useState("");
  const [freeText, setFreeText] = useState("");
  const [interventionId, setInterventionId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [answers, setAnswers] = useState<Record<string, { value?: string; unknownReason?: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setMsg(null);
    try {
      return await fn();
    } catch (e) {
      const err = e as ApiError;
      setMsg([err.error, ...(err.fields ?? []).map((f) => `${f.field}: ${f.message}`)].join(" · "));
    } finally {
      setBusy(false);
    }
  }

  const load = async (id: number) => setView(await api<View>(`/api/reports/${id}`));

  const start = () => run(async () => {
    let iv = interventionId;
    if (!iv) {
      iv = (await api<{ id: string }>("/api/interventions", { body: { title: title || "Intervención sin título" } })).id;
      setInterventionId(iv);
      await api(`/api/interventions/${iv}/entries`, { body: { text: freeText } });
    }
    const r = await api<{ revision: { id: number } }>("/api/reports", { body: { interventionId: iv, templateKind: KIND, freeText } });
    setAnswers({});
    await load(r.revision.id);
  });

  const submitAnswers = () => run(async () => {
    if (!view) return;
    const payload = Object.fromEntries(
      Object.entries(answers)
        .filter(([, a]) => a.value?.trim() || a.unknownReason?.trim())
        .map(([k, a]) => {
          const listField = view.questions.find((q) => q.field === k)?.list ?? false;
          return [k, a.unknownReason?.trim()
            ? { unknownReason: a.unknownReason.trim(), source: "operador" }
            : { value: listField ? a.value!.split(/\n|;/).map((x) => x.trim()).filter(Boolean) : a.value!.trim(), source: "operador" }];
        }),
    );
    const r = await api<{ revision: { id: number } }>(`/api/reports/${view.revision.id}/answer`, { body: payload });
    setAnswers({});
    await load(r.revision.id);
  });

  const approve = () => run(async () => {
    await api(`/api/reports/${view!.revision.id}/approve`, { body: {} });
    await load(view!.revision.id);
    setMsg("Informe aprobado.");
  });

  const observe = () => run(async () => {
    const note = prompt("Observación para quien redactó:");
    if (!note) return;
    await api(`/api/reports/${view!.revision.id}/approve`, { body: { observe: note } });
    await load(view!.revision.id);
  });

  const exportReport = () => run(async () => {
    const text = await api<string>(`/api/reports/${view!.revision.id}/export`, { method: "POST" });
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `informe-rev-${view!.revision.id}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  });

  return (
    <div className="grid2">
      <section className="card">
        <h1>Relato de la intervención</h1>
        <p className="hint">Escribí como lo contarías por radio. El asistente toma horas, lugar y móviles, y pregunta sólo lo que falta.</p>
        <div className="field">
          <label htmlFor="t">Intervención</label>
          <input id="t" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!!interventionId} placeholder="Ej.: Incendio en vivienda" />
        </div>
        <div className="field">
          <label htmlFor="ft">Descripción libre</label>
          <textarea id="ft" rows={8} value={freeText} onChange={(e) => setFreeText(e.target.value)} />
        </div>
        <div className="actions">
          <button className="primary" disabled={busy || !freeText.trim()} onClick={start}>Armar informe</button>
        </div>

        {view && view.questions.length > 0 && (
          <div className="questions">
            <h2>Faltan estos datos</h2>
            {view.questions.map((q) => (
              <div className="field" key={q.field}>
                <label htmlFor={`q-${q.field}`}>{q.question}</label>
                {q.options ? (
                  <select id={`q-${q.field}`} value={answers[q.field]?.value ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.field]: { value: e.target.value } })}>
                    <option value="">Elegí una opción</option>
                    {q.options.map((o) => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}
                  </select>
                ) : (
                  <textarea id={`q-${q.field}`} rows={2} value={answers[q.field]?.value ?? ""}
                    placeholder={q.list ? "Uno por renglón" : undefined}
                    onChange={(e) => setAnswers({ ...answers, [q.field]: { value: e.target.value } })} />
                )}
                {q.canMarkUnknown && (
                  <input placeholder="No se sabe porque…" value={answers[q.field]?.unknownReason ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.field]: { unknownReason: e.target.value } })} />
                )}
              </div>
            ))}
            {view.suggestions.map((s) => <p key={s.field} className="hint">Sugerencia: {s.question}</p>)}
            <div className="actions"><button disabled={busy} onClick={submitAnswers}>Guardar respuestas</button></div>
          </div>
        )}
        {msg && <p className="status" role="status">{msg}</p>}
      </section>

      <section className="card">
        <h1>Borrador</h1>
        {!view && <p className="hint">Todavía no hay informe.</p>}
        {view && (
          <>
            <p className="meta">
              Revisión {view.revision.revision_no} · {view.revision.status.replaceAll("_", " ")} · plantilla v{view.template.version}
              {view.template.status !== "aprobada" && <span className="tag warn">plantilla provisoria: sólo borradores</span>}
            </p>
            {view.contradictions.map((c, i) => <p key={i} className="err">{c.message}</p>)}
            <pre className="draft">{view.draft}</pre>
            <details>
              <summary>Fuente de cada dato</summary>
              <ul className="sources">
                {Object.entries(view.revision.field_values).map(([k, v]) => (
                  <li key={k}><strong>{k}</strong> ({v.source}){v.evidence ? `: «${v.evidence}»` : ""}</li>
                ))}
              </ul>
            </details>
            <div className="actions">
              <button onClick={approve} disabled={busy || view.revision.status !== "listo_para_revisar"}>Aprobar (revisor)</button>
              <button className="ghost" onClick={observe} disabled={busy}>Observar</button>
              <button onClick={exportReport} disabled={busy || !["aprobado", "exportado"].includes(view.revision.status)}>Exportar</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
