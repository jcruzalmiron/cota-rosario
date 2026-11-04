import { body, handle } from "@/server/http";
import type { IncidentStatus } from "@/domain/incidents";

export const POST = handle<RouteContext<"/api/incidents/[id]/transition">>(async (req, actor, s, ctx) => {
  const b = await body<{ version: number; to: IncidentStatus; reason?: string; assignedTo?: string; duplicateOf?: string }>(req);
  return s.incidents.transition(actor, (await ctx.params).id, b.version, b.to, b);
});
