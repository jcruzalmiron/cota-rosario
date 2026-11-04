import { body, handle } from "@/server/http";
import type { IntakeDraft } from "@/domain/intake";

export const PATCH = handle<RouteContext<"/api/incidents/[id]/intake">>(async (req, actor, s, ctx) => {
  const { version, ...patch } = await body<IntakeDraft & { version: number }>(req);
  return s.incidents.updateIntake(actor, (await ctx.params).id, version, patch);
});
