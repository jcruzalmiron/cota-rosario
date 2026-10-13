import { loadKpis } from "@/lib/kpis";
import { DEMO_SCOPE } from "@/lib/demo";

export const dynamic = "force-dynamic";
export async function GET() {
  const kpis = await loadKpis();
  const sinDatos = !kpis.rio && !kpis.lluvia && !kpis.reportes;
  return Response.json({ ...kpis, incompleto: kpis.fallas.length > 0, alcance: DEMO_SCOPE }, { status: sinDatos ? 503 : 200, headers: { "cache-control": "no-store" } });
}
