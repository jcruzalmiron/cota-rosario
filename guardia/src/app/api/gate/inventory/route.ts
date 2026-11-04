import { body, handle } from "@/server/http";

/** Alta de móvil o portón (jefatura o técnico). */
export const POST = handle(async (req, actor, s) => {
  const b = await body<{ kind: "movil" | "porton"; code: string; label: string }>(req);
  const id = b.kind === "porton" ? await s.gate.addGate(actor, b.code ?? "", b.label ?? "") : await s.gate.addVehicle(actor, b.code ?? "", b.label ?? "");
  return { id };
});
