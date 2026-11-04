import { body, handle } from "@/server/http";

export const GET = handle<RouteContext<"/api/crm/events/[id]">>(async (_req, actor, s, ctx) =>
  s.crm.eventSummary(actor, (await ctx.params).id));

export const POST = handle<RouteContext<"/api/crm/events/[id]">>(async (req, actor, s, ctx) => {
  const b = await body<{ holderLabel: string; tables: number; provisionalHours?: number }>(req);
  return s.crm.reserve(actor, { ...b, eventId: (await ctx.params).id });
});
