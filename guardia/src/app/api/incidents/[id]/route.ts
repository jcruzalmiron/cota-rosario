import { handle } from "@/server/http";

export const GET = handle<RouteContext<"/api/incidents/[id]">>(async (_req, actor, s, ctx) =>
  s.incidents.get(actor, (await ctx.params).id));
