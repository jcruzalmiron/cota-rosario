import { body, handle } from "@/server/http";
import type { CreateIncidentInput, IncidentStatus } from "@/domain/incidents";

export const GET = handle(async (req, actor, s) => {
  const url = new URL(req.url);
  return s.incidents.list(actor, {
    status: (url.searchParams.get("estado") as IncidentStatus) || undefined,
    limit: Number(url.searchParams.get("limite") ?? 50),
    offset: Number(url.searchParams.get("desde") ?? 0),
  });
});

/** Alta: siempre guarda el borrador y devuelve los faltantes (no bloquea). */
export const POST = handle(async (req, actor, s) => s.incidents.create(actor, await body<CreateIncidentInput>(req)));
