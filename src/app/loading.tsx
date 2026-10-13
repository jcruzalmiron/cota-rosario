"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { DemoNotice } from "@/components/DemoNotice";

const TITLES: Record<string, string> = { "/": "Vecinos", "/operaciones": "Operaciones", "/predicciones": "Predicciones" };

export default function Loading() {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col">
      <TopBar activo={path} />
      <DemoNotice />
      <div role="status" aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xl text-ink">Cargando {TITLES[path] ?? "la vista"}…</p>
        <p className="max-w-lg text-sm text-ink-soft">Podés cambiar de vista mientras llegan las fuentes reales. Los datos faltantes se indicarán como no disponibles.</p>
      </div>
    </div>
  );
}
