"use client";

import { usePathname } from "next/navigation";

const PAGE_ROUTES = new Set(["/operaciones/rio", "/operaciones/lluvia", "/operaciones/demanda", "/mas"]);

const SUBJECTS: Record<string, string> = {
  "/": "el mapa",
  "/zona": "tus lugares",
  "/reportar": "el reporte",
  "/mas": "el menú",
  "/operaciones": "el resumen",
  "/operaciones/rio": "el río",
  "/operaciones/lluvia": "la lluvia",
  "/operaciones/pronostico": "el pronóstico",
  "/operaciones/reclamos": "los reclamos",
  "/operaciones/demanda": "la demanda estimada",
  "/operaciones/simulador": "el simulador",
};

const FIGURE_COUNT = 4;
const RAIL_CARDS = 3;
const STREET_LINES = 9;

function Bar({ className }: { className: string }) {
  return <span className={`skeleton block rounded-md ${className}`} />;
}

function RailSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <div className="flex flex-col gap-3">
        <Bar className="h-3 w-28" />
        <Bar className="h-8 w-44" />
        <Bar className="h-3.5 w-full" />
        <Bar className="h-3.5 w-4/5" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: FIGURE_COUNT }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Bar className="h-2.5 w-16" />
            <Bar className="h-8 w-20" />
          </div>
        ))}
      </div>
      {Array.from({ length: RAIL_CARDS }, (_, index) => (
        <span key={index} className="skeleton block h-24 rounded-xl" />
      ))}
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#101114]">
      <svg className="absolute inset-0 h-full w-full text-rule-soft" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: STREET_LINES }, (_, index) => (
          <line key={`h${index}`} x1="0" x2="100" y1={8 + index * 11} y2={4 + index * 11} stroke="currentColor" strokeWidth="0.35" />
        ))}
        {Array.from({ length: STREET_LINES }, (_, index) => (
          <line key={`v${index}`} y1="0" y2="100" x1={6 + index * 11} x2={10 + index * 11} stroke="currentColor" strokeWidth="0.35" />
        ))}
        <path d="M78 0 C70 30 86 55 74 100" fill="none" stroke="#24536a" strokeWidth="5" strokeOpacity="0.5" />
      </svg>
      <span className="skeleton absolute inset-0 bg-transparent" />
      <svg viewBox="0 0 32 44" className="skeleton-pin absolute left-1/2 top-1/2 h-11 w-8 -translate-x-1/2 -translate-y-full text-ink-faint" aria-hidden="true">
        <path d="M16 1C8 1 2 7 2 15c0 10.5 14 27 14 27s14-16.5 14-27C30 7 24 1 16 1Z" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="relative flex min-h-0 flex-1 lg:flex-row">
      <div className="absolute inset-x-0 bottom-0 z-10 h-[var(--sheet-peek)] rounded-t-2xl border-t border-rule bg-panel lg:static lg:h-auto lg:w-[27rem] lg:shrink-0 lg:rounded-none lg:border-r lg:border-t-0 lg:bg-transparent xl:w-[30rem]">
        <RailSkeleton />
      </div>
      <div className="relative min-h-0 flex-1">
        <MapSkeleton />
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-hidden px-5 py-8">
      <div className="flex flex-col gap-3">
        <Bar className="h-3 w-32" />
        <Bar className="h-9 w-40" />
        <Bar className="h-3.5 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
        {Array.from({ length: FIGURE_COUNT + 1 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Bar className="h-2.5 w-20" />
            <Bar className="h-10 w-24" />
            <Bar className="h-2.5 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <span className="skeleton block h-72 rounded-xl" />
        <span className="skeleton block h-72 rounded-xl" />
      </div>
    </div>
  );
}

export function ContentLoading() {
  const pathname = usePathname();
  return (
    <div role="status" aria-live="polite" className="flex min-h-0 flex-1 flex-col">
      <span className="sr-only">Cargando {SUBJECTS[pathname] ?? "la vista"}…</span>
      {PAGE_ROUTES.has(pathname) ? <PageSkeleton /> : <WorkspaceSkeleton />}
    </div>
  );
}
