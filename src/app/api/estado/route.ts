import { loadEstado } from "@/lib/estado";
import { DEMO_SCOPE } from "@/lib/demo";
import { SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";
export async function GET() {
  const estado = await loadEstado();
  return Response.json({ ...estado, alcance: DEMO_SCOPE, fuentes: SOURCES }, { status: estado.riesgo.sinDatos ? 503 : 200, headers: { "cache-control": "no-store" } });
}
