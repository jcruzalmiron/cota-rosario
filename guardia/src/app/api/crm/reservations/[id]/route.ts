import { body, handle } from "@/server/http";

export const POST = handle<RouteContext<"/api/crm/reservations/[id]">>(async (req, actor, s, ctx) => {
  const id = (await ctx.params).id;
  const b = await body<{ action: "confirmar" | "cancelar"; paymentRef?: string }>(req);
  if (b.action === "cancelar") return s.crm.cancelReservation(actor, id);
  return s.crm.confirm(actor, id, b.paymentRef || undefined);
});
