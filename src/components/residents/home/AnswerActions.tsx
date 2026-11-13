"use client";

import Link from "next/link";
import { requestSheet } from "@/components/BottomSheet";
import { usePlaces } from "@/components/residents/usePlaces";
import { NavGlyph } from "@/components/shell/NavGlyph";
import { CLAIMS_HREF, EMERGENCY_PHONE, REPORT_HREF } from "@/lib/navigation";
import type { AnswerAction } from "@/lib/residents";

const PHONE_PATH = "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z";

const BASE = "flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-medium transition-[opacity,border-color,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const PRIMARY = `${BASE} bg-ink text-ground hover:opacity-90 active:opacity-80`;
const URGENT = `${BASE} bg-critical text-ground hover:opacity-90 active:opacity-80`;
const SECONDARY = `${BASE} border border-rule text-ink hover:border-ink-soft active:bg-panel-soft`;

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PHONE_PATH} />
    </svg>
  );
}

function ActionButton({ action, primary, hasPlaces }: { action: AnswerAction; primary: boolean; hasPlaces: boolean }) {
  switch (action) {
    case "call":
      return (
        <a href={`tel:${EMERGENCY_PHONE}`} className={primary ? URGENT : SECONDARY}>
          <PhoneGlyph />
          {primary ? `Llamar al ${EMERGENCY_PHONE} · Defensa Civil` : `Llamar al ${EMERGENCY_PHONE}`}
        </a>
      );
    case "report":
      return (
        <Link href={REPORT_HREF} className={primary ? PRIMARY : SECONDARY}>
          <NavGlyph icon="report" className="size-4 shrink-0" />
          {primary ? "Reportar agua en mi cuadra" : "Reportar agua"}
        </Link>
      );
    case "zone":
      return (
        <Link href="/zona" className={primary ? PRIMARY : SECONDARY}>
          <NavGlyph icon="zone" className="size-4 shrink-0" />
          {hasPlaces ? (primary ? "Ver cómo está mi zona" : "Ver mi zona") : primary ? "Agregá tu casa en Mi zona" : "Agregar mi casa"}
        </Link>
      );
    case "claims":
      return (
        <Link href={CLAIMS_HREF} className={primary ? PRIMARY : SECONDARY}>
          <NavGlyph icon="reports" className="size-4 shrink-0" />
          Ver reclamos de hoy
        </Link>
      );
  }
}

/** Los botones de la respuesta: el primero ocupa el ancho; los demás se reparten debajo. */
export function AnswerActions({ actions }: { actions: readonly AnswerAction[] }) {
  const { places, ready } = usePlaces();
  const hasPlaces = ready && places.length > 0;
  const [first, ...rest] = actions;
  return (
    <div className="mt-5 flex flex-col gap-2">
      <ActionButton action={first} primary hasPlaces={hasPlaces} />
      {rest.length ? (
        <div className={`grid gap-2 ${rest.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {rest.map((action) => (
            <ActionButton key={action} action={action} primary={false} hasPlaces={hasPlaces} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** En el celular la respuesta tapa el mapa: este botón la corre para verlo. */
export function ShowMapButton() {
  return (
    <button
      type="button"
      onClick={() => requestSheet(false)}
      className="-my-3 -mr-2 flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-ink-soft underline decoration-rule underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden"
    >
      <NavGlyph icon="map" className="size-4" />
      Ver el mapa
    </button>
  );
}
