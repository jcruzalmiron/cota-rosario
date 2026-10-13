"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" onClick={() => startTransition(() => router.refresh())} disabled={pending} aria-label="Actualizar los datos de esta vista" className="rounded-md border border-rule px-2.5 py-1.5 text-xs text-ink-soft hover:text-ink disabled:opacity-50">{pending ? "Consultando…" : "Actualizar"}</button>;
}
