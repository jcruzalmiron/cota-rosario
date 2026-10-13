import { loadEstado } from "@/lib/estado";
import { loadKpis } from "@/lib/kpis";
import { loadPredicciones } from "@/lib/predicciones";
import { buildParte, buildRecomendaciones } from "@/lib/recomendaciones";
import { DEMO_SCOPE } from "@/lib/demo";

export const dynamic = "force-dynamic";
export async function GET() {
  const estado = await loadEstado();
  const [kpis, predicciones] = await Promise.all([loadKpis(estado), loadPredicciones(estado)]);
  const insumos = { estado, kpis, predicciones };
  return Response.json({ recomendaciones: buildRecomendaciones(insumos), parte: buildParte(insumos), generadoEn: new Date().toISOString(), incompleto: estado.riesgo.incompleto || kpis.fallas.length > 0 || predicciones.fallas.length > 0, alcance: DEMO_SCOPE }, { status: estado.riesgo.sinDatos ? 503 : 200, headers: { "cache-control": "no-store" } });
}
