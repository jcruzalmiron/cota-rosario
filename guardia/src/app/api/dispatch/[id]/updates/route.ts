import { body, handle } from "@/server/http";
import type { UpdateKind } from "@/domain/guard";

export const POST = handle<RouteContext<"/api/dispatch/[id]/updates">>(async (req, actor, s, ctx) => {
  const b = await body<{ kind: UpdateKind; channel: "radio" | "app" | "telefono" | "manual"; body?: string; sourceKey: string; observedAt?: string }>(req);
  return s.guard.recordUpdate(actor, {
    ...b,
    dispatchId: (await ctx.params).id,
    observedAt: b.observedAt ? new Date(b.observedAt) : undefined,
  });
});
