import { body, handle } from "@/server/http";

export const POST = handle<RouteContext<"/api/incidents/[id]/exception">>(async (req, actor, s, ctx) => {
  const { reason } = await body<{ reason: string }>(req);
  return { faltantes: await s.incidents.authorizeIntakeException(actor, (await ctx.params).id, reason ?? "") };
});
