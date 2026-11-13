"use client";

import { useState, type FormEvent } from "react";
import { ACTION_TITLE, CLAIM_ACTIONS, STATUS_COLOR, type ClaimAction } from "@/components/ops/claimStatus";
import { BUTTON_PLAIN, BUTTON_PRIMARY, FIELD } from "@/components/ops/ui";
import { districtLabel, formatDuration } from "@/lib/opsClaims";
import { PRIVATE_NOTE_MAX_CHARS, PUBLIC_NOTE_MAX_CHARS, REPORT_STATUSES, REPORT_TYPES, isOpenStatus, type Report, type ReportHistoryEntry, type ReportStatus, type ReportTimelineStep } from "@/lib/reportTypes";
import { argentinaDateTime } from "@/lib/time";

export type Claim = Report & { history?: ReportHistoryEntry[] };

export interface ClaimChange {
  status: ReportStatus;
  note?: string;
  publicNote?: string;
}

interface ClaimRowProps {
  claim: Claim;
  now: number;
  canManage: boolean;
  saving: boolean;
  error: string | null;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onLocate: () => void;
  onChange: (change: ClaimChange) => void;
}

function Composer({ claim, target, saving, onCancel, onSubmit }: { claim: Claim; target: ReportStatus; saving: boolean; onCancel: () => void; onSubmit: (change: ClaimChange) => void }) {
  const [publicNote, setPublicNote] = useState(claim.publicNote ?? "");
  const [note, setNote] = useState("");
  const sameStatus = target === claim.status;
  const unchanged = sameStatus && !note.trim() && publicNote.trim() === (claim.publicNote ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ status: target, note: note.trim() || undefined, publicNote: publicNote.trim() === (claim.publicNote ?? "") ? undefined : publicNote.trim() });
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg border border-rule bg-panel/70 p-3">
      <p className="text-[0.8125rem] text-ink">{sameStatus ? "Editar notas" : ACTION_TITLE[target]}</p>
      <label className="flex flex-col gap-1.5 text-xs text-ink-soft">
        <span className="flex items-baseline justify-between gap-2">
          Respuesta para el vecino · pública
          <span className="readout text-ink-faint">
            {publicNote.length}/{PUBLIC_NOTE_MAX_CHARS}
          </span>
        </span>
        <textarea className={`${FIELD} resize-none`} rows={2} maxLength={PUBLIC_NOTE_MAX_CHARS} value={publicNote} onChange={(event) => setPublicNote(event.target.value)} placeholder="Opcional. Se muestra en el seguimiento del reclamo." />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-ink-soft">
        <span className="flex items-baseline justify-between gap-2">
          Nota interna · sólo operaciones
          <span className="readout text-ink-faint">
            {note.length}/{PRIVATE_NOTE_MAX_CHARS}
          </span>
        </span>
        <textarea className={`${FIELD} resize-none`} rows={2} maxLength={PRIVATE_NOTE_MAX_CHARS} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcional. Queda en el historial." />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BUTTON_PRIMARY} disabled={saving || unchanged}>
          {saving ? "Guardando…" : sameStatus ? "Guardar notas" : `Confirmar: ${REPORT_STATUSES[target].label.toLowerCase()}`}
        </button>
        <button type="button" className={BUTTON_PLAIN} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function ClaimRow({ claim, now, canManage, saving, error, selected, expanded, onToggle, onLocate, onChange }: ClaimRowProps) {
  const [composing, setComposing] = useState<ReportStatus | null>(null);
  const type = REPORT_TYPES[claim.type];
  const open = isOpenStatus(claim.status);
  const waited = open ? now - Date.parse(claim.createdAt) : Date.parse(claim.statusAt) - Date.parse(claim.createdAt);
  const color = STATUS_COLOR[claim.status];

  const run = (action: ClaimAction) => {
    if (action.quick) {
      setComposing(null);
      onChange({ status: action.to });
      return;
    }
    setComposing(action.to);
  };

  return (
    <li className={`relative border-b border-rule-soft px-5 py-4 transition-colors ${selected ? "bg-panel/80" : ""} ${saving ? "opacity-70" : ""}`} data-claim={claim.id} aria-busy={saving}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color, opacity: open ? 1 : 0.45 }} aria-hidden="true" />

      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full flex-col gap-1.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-water focus-visible:ring-offset-4 focus-visible:ring-offset-ground">
        <span className="flex w-full items-start justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium" style={{ borderColor: `${color}80`, color }}>
              <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
              {REPORT_STATUSES[claim.status].label}
            </span>
            <span className={`text-sm font-medium ${claim.type === "home" ? "text-critical" : "text-ink"}`}>{type.label}</span>
          </span>
          <span className="readout shrink-0 pt-0.5 text-right text-xs text-ink-soft" title={open ? "Tiempo desde que se cargó" : "Tiempo entre la carga y el cierre"}>
            {open ? "espera " : "en "}
            {formatDuration(waited)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-faint">
          <span className="text-ink-soft">{districtLabel(claim.district)}</span>
          <span aria-hidden="true">·</span>
          <span className="readout">{argentinaDateTime(claim.createdAt)}</span>
          {claim.confirmations ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="readout text-watch">
                +{claim.confirmations} {claim.confirmations === 1 ? "vecino confirma" : "vecinos confirman"}
              </span>
            </>
          ) : null}
        </span>
        {claim.description ? <span className="text-sm leading-relaxed text-ink-soft">{claim.description}</span> : <span className="text-xs italic text-ink-faint">{claim.status === "dismissed" && !canManage ? "Texto no publicado" : "Sin descripción"}</span>}
        {claim.publicNote ? (
          <span className="border-l-2 border-rule pl-2.5 text-xs leading-relaxed text-ink-soft">
            <span className="text-ink-faint">Respuesta al vecino: </span>
            {claim.publicNote}
          </span>
        ) : null}
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-xs leading-snug text-alert">
          {error}
        </p>
      ) : null}

      {canManage && composing === null ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {CLAIM_ACTIONS[claim.status].map((action) => (
            <button key={action.to} type="button" disabled={saving} onClick={() => run(action)} className={action.tone === "primary" ? BUTTON_PRIMARY : BUTTON_PLAIN}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {canManage && composing !== null ? (
        <Composer
          key={`${composing}-${claim.statusAt}`}
          claim={claim}
          target={composing}
          saving={saving}
          onCancel={() => setComposing(null)}
          onSubmit={(change) => {
            setComposing(null);
            onChange(change);
          }}
        />
      ) : null}

      {expanded ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-rule-soft pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BUTTON_PLAIN} onClick={onLocate}>
              Ver en el mapa
            </button>
            {canManage && composing === null ? (
              <button type="button" className={BUTTON_PLAIN} onClick={() => setComposing(claim.status)} disabled={saving}>
                Editar notas
              </button>
            ) : null}
            <span className="readout text-[0.6875rem] text-ink-faint">
              {claim.lat.toFixed(5)}, {claim.lon.toFixed(5)}
            </span>
          </div>
          <div>
            <h3 className="meta">{claim.history ? "Historial" : "Seguimiento público"}</h3>
            <ol className="relative mt-3 flex flex-col gap-3 border-l border-rule-soft pl-4">
              {(claim.history ?? claim.timeline).map((entry: ReportTimelineStep & Partial<ReportHistoryEntry>, index) => (
                <li key={`${entry.at}-${index}`} className="relative text-xs leading-relaxed">
                  <span className="absolute -left-[21px] top-1 size-2 rounded-full ring-4 ring-ground" style={{ background: STATUS_COLOR[entry.status] }} aria-hidden="true" />
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-ink">{REPORT_STATUSES[entry.status].label}</span>
                    <span className="readout text-ink-faint">{argentinaDateTime(entry.at)}</span>
                    {entry.by ? <span className="text-ink-soft">{entry.by}</span> : null}
                  </p>
                  {entry.note ? <p className="mt-0.5 text-ink-soft">{entry.note}</p> : null}
                </li>
              ))}
            </ol>
            {claim.history ? null : <p className="mt-3 text-xs text-ink-faint">Quién hizo cada cambio y las notas internas se ven al ingresar como operador.</p>}
          </div>
        </div>
      ) : null}
    </li>
  );
}
