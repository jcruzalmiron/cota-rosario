import { body, handle } from "@/server/http";
import type { FieldValue } from "@/domain/report-template";

export const POST = handle<RouteContext<"/api/reports/[id]/answer">>(async (req, actor, s, ctx) =>
  s.reports.answer(actor, Number((await ctx.params).id), await body<Record<string, FieldValue>>(req)));
