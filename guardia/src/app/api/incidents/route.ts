import { body, handle } from "@/server/http";
import type { CreateIncidentInput, IncidentFilter } from "@/domain/incidents";

const date = (v: string | null) => {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw Object.assign(new Error(`Fecha inválida: ${v}`), { status: 400 });
  return d;
};

export const GET = handle(async (req, actor, s) => {
  const p = new URL(req.url).searchParams;
  const priority = p.get("prioridad");
  return s.incidents.list(actor, {
    status: (p.get("estado") as IncidentFilter["status"]) || undefined,
    category: p.get("categoria") || undefined,
    priority: priority ? Number(priority) : undefined,
    from: date(p.get("desde")),
    to: date(p.get("hasta")),
    withoutLocation: p.get("sin_ubicacion") === "1",
    limit: Number(p.get("limite") ?? 50),
    offset: Number(p.get("offset") ?? 0),
  });
});

/** Alta: siempre guarda el borrador y devuelve los faltantes (no bloquea). */
export const POST = handle(async (req, actor, s) => s.incidents.create(actor, await body<CreateIncidentInput>(req)));
