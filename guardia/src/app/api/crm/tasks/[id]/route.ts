import { body, handle } from "@/server/http";
import { followUpDate } from "@/domain/crm";

export const POST = handle<RouteContext<"/api/crm/tasks/[id]">>(async (req, actor, s, ctx) => {
  const id = (await ctx.params).id;
  const b = await body<{ version: number; action: "hecha" | "reprogramar"; result?: string; days?: number }>(req);
  if (b.action === "hecha") return s.crm.complete(actor, id, b.version, b.result ?? "");
  return s.crm.reschedule(actor, id, b.version, followUpDate(new Date(), b.days ?? 7));
});
