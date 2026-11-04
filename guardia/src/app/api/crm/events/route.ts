import { body, handle } from "@/server/http";

export const POST = handle(async (req, actor, s) => {
  const b = await body<{ name: string; startsAt?: string; venue?: string; tableCapacity: number }>(req);
  return { id: await s.crm.createEvent(actor, { ...b, startsAt: b.startsAt ? new Date(b.startsAt) : null }) };
});
