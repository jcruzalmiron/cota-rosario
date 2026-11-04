import { body, handle } from "@/server/http";

export const POST = handle(async (req, actor, s) => {
  const b = await body<{ title: string; incidentId?: string; externalRef?: string; startedAt?: string }>(req);
  return { id: await s.logbook.createIntervention(actor, { ...b, startedAt: b.startedAt ? new Date(b.startedAt) : undefined }) };
});
