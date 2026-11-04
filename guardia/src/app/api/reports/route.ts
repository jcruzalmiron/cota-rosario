import { body, handle } from "@/server/http";

export const POST = handle(async (req, actor, s) =>
  s.reports.start(actor, await body<{ interventionId: string; templateKind: string; freeText: string }>(req)));
