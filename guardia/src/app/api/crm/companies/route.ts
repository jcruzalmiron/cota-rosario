import { body, handle } from "@/server/http";
import { followUpDate } from "@/domain/crm";

/** Alta de empresa con primer seguimiento opcional ("volver a llamar en N días"). */
export const POST = handle(async (req, actor, s) => {
  const b = await body<{ name: string; notes?: string; followUpDays?: number; followUpTitle?: string }>(req);
  const id = await s.crm.createCompany(actor, b);
  const task = b.followUpDays
    ? await s.crm.createTask(actor, { companyId: id, title: b.followUpTitle || "Volver a contactar", dueAt: followUpDate(new Date(), b.followUpDays) })
    : null;
  return { id, task };
});
