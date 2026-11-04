import { body, handle } from "@/server/http";

/** Despacho idempotente: el cliente envía una clave única por intento de confirmación. */
export const POST = handle(async (req, actor, s) =>
  s.guard.dispatch(actor, await body<{ incidentId: string; mobileCode: string; idempotencyKey: string; externalRef?: string }>(req)));
