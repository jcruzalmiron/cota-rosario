import { body, handle } from "@/server/http";
import type { Direction } from "@/domain/gate";

/** Corrección o descarte de un movimiento (jefatura, con motivo). */
export const POST = handle<RouteContext<"/api/gate/movements/[id]">>(async (req, actor, s, ctx) => {
  const b = await body<{ direction?: Direction; occurredAt?: string; discard?: boolean; reason: string }>(req);
  return s.gate.correct(actor, Number((await ctx.params).id), {
    direction: b.direction,
    occurredAt: b.occurredAt ? new Date(b.occurredAt) : undefined,
    discard: b.discard,
  }, b.reason ?? "");
});
