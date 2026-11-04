import { handle } from "@/server/http";

/** Métricas del período con definiciones, denominador y excluidos. */
export const GET = handle(async (req, actor, s) => {
  const p = new URL(req.url).searchParams;
  const to = p.get("hasta") ? new Date(p.get("hasta")!) : new Date();
  const from = p.get("desde") ? new Date(p.get("desde")!) : new Date(to.getTime() - 7 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw Object.assign(new Error("Período inválido."), { status: 400 });
  }
  return s.metrics.compute(actor, from, to);
});
