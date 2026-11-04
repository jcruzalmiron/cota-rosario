import { handle } from "@/server/http";
import { summaryToCsv } from "@/domain/incidents";

/** Resumen por período y corte. `?formato=csv` lo devuelve descargable. */
export const GET = handle(async (req, actor, s) => {
  const p = new URL(req.url).searchParams;
  const to = p.get("hasta") ? new Date(p.get("hasta")!) : new Date();
  const from = p.get("desde") ? new Date(p.get("desde")!) : new Date(to.getTime() - 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw Object.assign(new Error("Período inválido."), { status: 400 });
  }
  const summary = await s.incidents.summary(actor, from, to);
  if (p.get("formato") !== "csv") return summary;
  return new Response(summaryToCsv(summary), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="resumen-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`,
    },
  });
});
