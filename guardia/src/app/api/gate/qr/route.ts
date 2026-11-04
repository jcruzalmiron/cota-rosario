import QRCode from "qrcode";
import { handle } from "@/server/http";

/** Códigos para imprimir y pegar en cada móvil. Contienen sólo cuartel, código y firma. */
export const GET = handle(async (_req, actor, s) => {
  const codes = await s.gate.qrCodes(actor);
  return Promise.all(codes.map(async (c) => ({
    code: c.code,
    label: c.label,
    svg: await QRCode.toString(c.payload, { type: "svg", errorCorrectionLevel: "M", margin: 2 }),
  })));
});
