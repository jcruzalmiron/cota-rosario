import { body, handle } from "@/server/http";
import type { Direction } from "@/domain/gate";

/** Inventario y cronología de las últimas `horas` (por defecto 24). */
export const GET = handle(async (req, actor, s) => {
  const hours = Math.min(Number(new URL(req.url).searchParams.get("horas") ?? 24) || 24, 24 * 31);
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3_600_000);
  const [inventory, movements] = await Promise.all([s.gate.inventory(actor), s.gate.timeline(actor, from, to)]);
  return { ...inventory, movements };
});

/** Paso por portón (QR o manual). `sourceKey` deduplica reenvíos del mismo escaneo. */
export const POST = handle(async (req, actor, s) => {
  const b = await body<{ gateId: string; sourceKey: string; source: "qr" | "manual"; qr?: string; vehicleCode?: string; direction?: Direction; occurredAt?: string }>(req);
  return s.gate.record(actor, { ...b, occurredAt: b.occurredAt ? new Date(b.occurredAt) : undefined });
});
