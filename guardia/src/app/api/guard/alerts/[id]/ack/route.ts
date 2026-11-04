import { handle } from "@/server/http";

export const POST = handle<RouteContext<"/api/guard/alerts/[id]/ack">>(async (_req, actor, s, ctx) =>
  ({ acked: await s.guard.acknowledgeAlert(actor, Number((await ctx.params).id)) }));
