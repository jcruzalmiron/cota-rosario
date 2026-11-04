import { body, handle } from "@/server/http";

export const POST = handle<RouteContext<"/api/reports/[id]/approve">>(async (req, actor, s, ctx) => {
  const id = Number((await ctx.params).id);
  const b = await body<{ observe?: string }>(req).catch(() => ({} as { observe?: string }));
  if (b.observe) {
    await s.reports.observe(actor, id, b.observe);
    return { observed: true };
  }
  return s.reports.approve(actor, id);
});
