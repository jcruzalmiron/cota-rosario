"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AddressSearch } from "@/components/AddressSearch";
import { PointMap, type MapPoint } from "@/components/PointMap";
import { ReportGlyph } from "@/components/reports/ReportGlyph";
import { ReportSent } from "@/components/reports/ReportSent";
import { ReportStepper } from "@/components/reports/ReportStepper";
import { useNearestAddress } from "@/components/reports/useNearestAddress";
import { ReportTypePicker } from "@/components/reports/ReportTypePicker";
import { fetchReports, howLongAgo } from "@/components/reports/useReports";
import { saveMyReport } from "@/components/residents/claims/useClaims";
import { Workspace } from "@/components/shell/Workspace";
import { EMERGENCY_PHONE } from "@/lib/navigation";
import { geocode } from "@/lib/placeReader";
import { isInsideRosario } from "@/lib/places";
import { EMPTY_DRAFT, QUICK_PHRASES, REPORT_STEPS, appendPhrase, canAdvance, isComplete, nextStep, previousStep, submissionBody, type ReportDraftFlow, type ReportStep } from "@/lib/reportFlow";
import { DESCRIPTION_MAX_CHARS, REPORT_TTL_HOURS, REPORT_TYPES, type Report } from "@/lib/reportTypes";

const API = "/api/reports";
const GEOLOCATION_TIMEOUT_MS = 10_000;
const CURRENT_LOCATION_LABEL = "Tu ubicación actual";
const MAP_POINT_LABEL = "Punto marcado en el mapa";
const PERCENT = 100;
const NEUTRAL_PIN = "#eceef1";

const TITLES: Record<ReportStep, string> = {
  type: "¿Qué estás viendo?",
  place: "¿Dónde?",
  detail: "Último paso",
};

const SUBTITLES: Record<ReportStep, string> = {
  type: "Elegí lo que más se parece. Tu aviso les llega a operaciones y a los vecinos, y después podés seguir cómo lo atienden.",
  place: "Movimos el pin a tu ubicación si la compartiste. Arrastralo, tocá el mapa o buscá la dirección.",
  detail: "Un detalle ayuda a quien lo lee. Es opcional.",
};

type Submission = { status: "editing" } | { status: "sending" } | { status: "sent"; tracked: boolean } | { status: "error"; message: string };

function ChangeLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-xs text-ink-faint underline decoration-rule underline-offset-4 hover:text-ink">
      Cambiar
    </button>
  );
}

export function ReportFlow({ initialDraft = EMPTY_DRAFT }: { initialDraft?: ReportDraftFlow }) {
  const [step, setStep] = useState<ReportStep>("type");
  const [draft, setDraft] = useState<ReportDraftFlow>(initialDraft);
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [placeNotice, setPlaceNotice] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission>({ status: "editing" });
  const [reports, setReports] = useState<Report[]>([]);
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(initialDraft.lat !== null && initialDraft.lon !== null ? { lat: initialDraft.lat, lon: initialDraft.lon } : null);

  useEffect(() => {
    let active = true;
    fetchReports()
      .then((list) => active && setReports(list))
      .catch((error: unknown) => console.warn("Nearby reports unavailable:", error));
    return () => {
      active = false;
    };
  }, [submission.status]);

  const update = (changes: Partial<ReportDraftFlow>) => setDraft((current) => ({ ...current, ...changes }));
  const number = REPORT_STEPS.indexOf(step) + 1;
  const selectedType = draft.type ? REPORT_TYPES[draft.type] : null;
  const hasPlace = draft.lat !== null && draft.lon !== null;
  const isPlaceValid = canAdvance("place", draft);
  const isApproximatePlace = draft.placeLabel === CURRENT_LOCATION_LABEL || draft.placeLabel === MAP_POINT_LABEL;
  const nearest = useNearestAddress(draft.lat, draft.lon, isApproximatePlace);
  const placeTitle = isApproximatePlace && nearest ? `Cerca de ${nearest.label}` : draft.placeLabel;

  const placeAt = (lat: number, lon: number, placeLabel: string, moveMap: boolean) => {
    setPlaceNotice(isInsideRosario(lat, lon) ? null : "Ese punto queda fuera de Rosario.");
    update({ lat, lon, placeLabel });
    if (moveMap) {
      setFocus({ lat, lon });
    }
  };

  const locateDevice = () => {
    if (!("geolocation" in navigator)) {
      setPlaceNotice("Este dispositivo no comparte su ubicación. Tocá el mapa o buscá la dirección.");
      return;
    }
    setSearching(true);
    setPlaceNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearching(false);
        placeAt(position.coords.latitude, position.coords.longitude, CURRENT_LOCATION_LABEL, true);
      },
      () => {
        setSearching(false);
        setPlaceNotice("No pudimos obtener tu ubicación. Tocá el mapa o buscá la dirección.");
      },
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS },
    );
  };

  const goTo = (target: ReportStep) => {
    setStep(target);
    if (target === "place" && !hasPlace) {
      locateDevice();
    }
  };

  const searchAddress = async (event: FormEvent) => {
    event.preventDefault();
    if (!address.trim()) {
      return;
    }
    setSearching(true);
    setPlaceNotice(null);
    try {
      const found = await geocode(address.trim());
      if (found) {
        placeAt(found.lat, found.lon, found.label, true);
      } else {
        setPlaceNotice("No encontramos esa dirección dentro de Rosario.");
      }
    } catch {
      setPlaceNotice("El buscador de direcciones no respondió. Probá de nuevo en un momento.");
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    const body = submissionBody(draft);
    if (!body) {
      return;
    }
    setSubmission({ status: "sending" });
    try {
      const response = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; report?: { id?: unknown } };
      if (response.ok && data.ok) {
        // El identificador queda sólo en este dispositivo: con él se sigue el estado en Reclamos.
        const id = data.report?.id;
        setSubmission({ status: "sent", tracked: typeof id === "string" && saveMyReport(id) });
      } else {
        setSubmission({ status: "error", message: data.error ?? "No se pudo enviar el reporte." });
      }
    } catch {
      setSubmission({ status: "error", message: navigator.onLine ? "No se pudo enviar el reporte. Probá de nuevo." : "Sin conexión: el reporte no se envió. Probá cuando vuelva la conexión." });
    }
  };

  const restart = () => {
    setDraft(EMPTY_DRAFT);
    setAddress("");
    setStep("type");
    setFocus(null);
    setSubmission({ status: "editing" });
  };

  const points: MapPoint[] = reports.map((report) => ({
    id: report.id,
    lat: report.lat,
    lon: report.lon,
    color: REPORT_TYPES[report.type].color,
    label: `${REPORT_TYPES[report.type].label} · ${howLongAgo(report.createdAt)}`,
    kind: "report",
  }));
  const pin = hasPlace && submission.status !== "sent" ? { lat: draft.lat as number, lon: draft.lon as number, color: selectedType?.color ?? NEUTRAL_PIN } : null;
  const canPlace = step === "place" && submission.status !== "sent";

  const mapOverlay =
    canPlace && !hasPlace ? (
      <p className="pointer-events-none rounded-full border border-rule bg-panel/90 px-4 py-2 text-sm text-ink shadow-lg backdrop-blur">Tocá el mapa donde está el agua</p>
    ) : reports.length && step === "type" ? (
      <p className="pointer-events-none rounded-full border border-rule bg-panel/90 px-4 py-2 text-xs text-ink-soft shadow-lg backdrop-blur">
        {reports.length} {reports.length === 1 ? "reporte sin resolver" : "reportes sin resolver"} en las últimas {REPORT_TTL_HOURS} h
      </p>
    ) : null;

  const rail =
    submission.status === "sent" ? (
      <ReportSent onAnother={restart} tracked={submission.tracked} />
    ) : (
      <div className="flex min-h-full flex-col">
        <header className="px-5 pb-2 pt-5">
          <p className="meta">
            Reportar · paso {number} de {REPORT_STEPS.length}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{TITLES[step]}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{SUBTITLES[step]}</p>
          <ReportStepper step={step} />
        </header>

        <section className="flex-1 px-5 py-5">
          {step === "type" ? <ReportTypePicker selected={draft.type} onSelect={(type) => update({ type })} /> : null}

          {step === "place" ? (
            <div className="flex flex-col gap-3">
              {selectedType && draft.type ? (
                <div className="flex items-center gap-3 rounded-xl border border-rule bg-panel/70 px-3 py-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-rule bg-ground" style={{ color: selectedType.color }}>
                    <ReportGlyph type={draft.type} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-ink">{selectedType.label}</span>
                  <ChangeLink onClick={() => setStep("type")} />
                </div>
              ) : null}
              <button type="button" onClick={locateDevice} disabled={searching} className="flex items-center gap-3 rounded-xl border border-rule px-4 py-3 text-left text-sm text-ink transition-colors hover:border-ink-soft disabled:opacity-50">
                <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-water" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M12 2v3 M12 19v3 M2 12h3 M19 12h3" />
                </svg>
                {searching ? "Buscando tu ubicación…" : "Usar mi ubicación actual"}
              </button>
              <form onSubmit={searchAddress} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <AddressSearch
                    id="report-address"
                    value={address}
                    onValueChange={setAddress}
                    onPick={(suggestion) => {
                      setAddress(suggestion.label);
                      placeAt(suggestion.lat, suggestion.lon, `${suggestion.label}, ${suggestion.detail}`, true);
                    }}
                    inline
                    label="Dirección"
                    placeholder="O escribí la dirección"
                    inputClassName="w-full rounded-lg border border-rule bg-ground px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-ink-soft focus:outline-none"
                  />
                </div>
                <button type="submit" disabled={searching || !address.trim()} className="rounded-lg border border-rule px-4 py-2.5 text-sm text-ink-soft hover:text-ink disabled:opacity-40">
                  Buscar
                </button>
              </form>
              {hasPlace ? (
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${isPlaceValid ? "border-normal/50 bg-normal/10" : "border-watch/50 bg-watch/10"}`}>
                  <span className={`mt-0.5 text-sm ${isPlaceValid ? "text-normal" : "text-watch"}`} aria-hidden="true">
                    {isPlaceValid ? "✓" : "!"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{placeTitle}</span>
                    <span className="block text-[0.6875rem] text-ink-faint">
                      {isApproximatePlace ? `${draft.placeLabel}${nearest ? ` · ${nearest.detail}` : nearest === undefined ? " · buscando la dirección…" : ""}` : "Dirección buscada"} · arrastrá el pin para ajustar
                    </span>
                  </span>
                </div>
              ) : null}
              {placeNotice ? (
                <p role="alert" className="text-xs text-watch">
                  {placeNotice}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "detail" ? (
            <div className="flex flex-col gap-4">
              <article className="overflow-hidden rounded-xl border border-rule bg-panel/70">
                {selectedType && draft.type ? (
                  <div className="flex items-center gap-3 border-b border-rule-soft px-4 py-3">
                    <span className="flex size-9 items-center justify-center rounded-lg border border-rule bg-ground" style={{ color: selectedType.color }}>
                      <ReportGlyph type={draft.type} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink">{selectedType.label}</span>
                    <ChangeLink onClick={() => setStep("type")} />
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <span className="min-w-0 text-sm text-ink-soft">{placeTitle || "Sin ubicación"}</span>
                  <ChangeLink onClick={() => setStep("place")} />
                </div>
              </article>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Frases rápidas">
                {QUICK_PHRASES.map((phrase) => {
                  const used = draft.description.toLowerCase().includes(phrase);
                  return (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => update({ description: appendPhrase(draft.description, phrase) })}
                      disabled={used}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${used ? "border-water/50 bg-water/10 text-ink-soft" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"}`}
                    >
                      {used ? "✓ " : "+ "}
                      {phrase}
                    </button>
                  );
                })}
              </div>
              <label className="flex flex-col gap-2">
                <span className="sr-only">Descripción (opcional)</span>
                <textarea
                  value={draft.description}
                  onChange={(event) => update({ description: event.target.value })}
                  maxLength={DESCRIPTION_MAX_CHARS}
                  rows={3}
                  placeholder="Contá con tus palabras (opcional)"
                  className="rounded-xl border border-rule bg-ground px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink-soft focus:outline-none"
                />
                <span className="flex items-center gap-2 self-end">
                  <span className="h-1 w-16 overflow-hidden rounded-full bg-rule-soft">
                    <span className="block h-full rounded-full bg-ink-soft" style={{ width: `${(draft.description.length / DESCRIPTION_MAX_CHARS) * PERCENT}%` }} />
                  </span>
                  <span className="readout text-[0.6875rem] text-ink-faint">
                    {draft.description.length}/{DESCRIPTION_MAX_CHARS}
                  </span>
                </span>
              </label>
              <p className="text-xs leading-relaxed text-ink-faint">
                Se publica sin tu nombre. Operaciones lo recibe, otros vecinos pueden confirmarlo y vos podés seguir cómo lo atienden en Reclamos. Si hay riesgo para personas, llamá a Defensa Civil al{" "}
                <a href={`tel:${EMERGENCY_PHONE}`} className="text-ink underline decoration-rule underline-offset-4">
                  {EMERGENCY_PHONE}
                </a>
                .
              </p>
              {submission.status === "error" ? (
                <p role="alert" className="rounded-lg border border-watch/50 bg-watch/10 px-3 py-2 text-xs text-watch">
                  {submission.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="sticky bottom-0 flex items-center gap-3 border-t border-rule-soft bg-ground/95 px-5 py-3 backdrop-blur">
          {step !== "type" ? (
            <button type="button" onClick={() => setStep(previousStep(step))} className="shrink-0 rounded-xl border border-rule px-4 py-3 text-sm text-ink-soft transition-colors hover:border-ink-soft hover:text-ink">
              Atrás
            </button>
          ) : null}
          {step === "detail" ? (
            <button type="button" onClick={submit} disabled={!isComplete(draft) || submission.status === "sending"} className="w-full flex-1 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-ground transition-opacity hover:opacity-90 disabled:opacity-30">
              {submission.status === "sending" ? "Enviando…" : "Enviar reporte"}
            </button>
          ) : (
            <button type="button" onClick={() => goTo(nextStep(step))} disabled={!canAdvance(step, draft)} className="w-full flex-1 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-ground transition-opacity hover:opacity-90 disabled:opacity-30">
              Siguiente
            </button>
          )}
        </div>
      </div>
    );

  return (
    <Workspace
      sheetOpen={step !== "place"}
      rail={rail}
      canvas={
        <>
          <PointMap
            points={points}
            pin={pin}
            focus={focus}
            onMapClick={canPlace ? (lat, lon) => placeAt(lat, lon, MAP_POINT_LABEL, false) : undefined}
            onPinMove={(lat, lon) => placeAt(lat, lon, MAP_POINT_LABEL, false)}
            crosshair={canPlace}
            overlay={mapOverlay}
          />
          {canPlace ? (
            <div className="absolute inset-x-4 bottom-[calc(var(--sheet-peek)+0.75rem)] z-[600] lg:hidden">
              <button
                type="button"
                onClick={() => goTo("detail")}
                disabled={!isPlaceValid}
                className="w-full rounded-xl bg-ink px-5 py-3 text-sm font-medium text-ground shadow-[0_12px_30px_-10px_rgb(0_0_0/0.8)] disabled:bg-panel disabled:text-ink-faint"
              >
                {hasPlace ? (isPlaceValid ? "Confirmar ubicación" : "Ese punto queda fuera de Rosario") : "Tocá el mapa o usá tu ubicación"}
              </button>
            </div>
          ) : null}
        </>
      }
    />
  );
}
