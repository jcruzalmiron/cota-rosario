import { loadPredicciones } from "@/lib/predicciones";
import { DEMO_SCOPE } from "@/lib/demo";

export const dynamic = "force-dynamic";
export async function GET() {
  const predicciones = await loadPredicciones();
  const sinDatos = !predicciones.anegamientos && !predicciones.lluvia && !predicciones.rio;
  return Response.json({ ...predicciones, incompleto: predicciones.fallas.length > 0, alcance: DEMO_SCOPE }, { status: sinDatos ? 503 : 200, headers: { "cache-control": "no-store" } });
}
