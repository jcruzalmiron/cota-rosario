import { handle } from "@/server/http";

export const GET = handle<RouteContext<"/api/reports/[id]">>(async (_req, actor, s, ctx) => {
  const view = await s.reports.view(actor, Number((await ctx.params).id));
  const suggestions = await s.reports.suggestFromPrevious(actor, view.template.kind, view.revision.field_values);
  return { ...view, suggestions };
});
