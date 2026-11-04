import { randomUUID } from "node:crypto";
import { body, handle } from "@/server/http";

export const GET = handle<RouteContext<"/api/interventions/[id]/entries">>(async (_req, actor, s, ctx) =>
  s.logbook.timeline(actor, (await ctx.params).id));

/** Entrada de texto libre. El audio se suma cuando haya transcriptor habilitado (ADAPTER_TRANSCRIPCION). */
export const POST = handle<RouteContext<"/api/interventions/[id]/entries">>(async (req, actor, s, ctx) => {
  const { text } = await body<{ text: string }>(req);
  return s.logbook.addText(actor, (await ctx.params).id, `texto-${randomUUID()}`, text ?? "");
});
