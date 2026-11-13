import { createReport, listReports, parseReportFilter, queryReports, ReportError, REPORT_TTL_HOURS, type NewReportInput } from "@/lib/reports";
import { BodyTooLargeError, clientIp, readJsonBody } from "@/lib/requestGuard";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;

function errorResponse(error: unknown): Response {
  if (error instanceof ReportError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  if (error instanceof BodyTooLargeError) {
    return Response.json({ ok: false, error: "El reporte es demasiado grande." }, { status: 413 });
  }
  console.error("Failed to handle /api/reports:", error);
  return Response.json({ ok: false, error: "No se pudo procesar el reporte." }, { status: 500 });
}

const NO_STORE = { "cache-control": "no-store" };

/**
 * Sin parámetros: reclamos cargados hoy (día argentino). Con from, to, status o type: ese rango.
 * Con window=active: los abiertos de las últimas REPORT_TTL_HOURS, que es lo que dibuja el mapa.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const window = params.get("window");
    if (window !== null) {
      if (window !== "active" || [...params.keys()].some((key) => key !== "window")) {
        return Response.json({ ok: false, error: "Parámetro window inválido: sólo acepta active, sin otros filtros." }, { status: 400 });
      }
      return Response.json({ ok: true, windowHours: REPORT_TTL_HOURS, reports: await listReports() }, { headers: NO_STORE });
    }
    return Response.json({ ok: true, ...(await queryReports(parseReportFilter(params))) }, { headers: NO_STORE });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request, MAX_BODY_BYTES)) as NewReportInput | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ ok: false, error: "Cuerpo inválido." }, { status: 400 });
    }
    const report = await createReport(body, clientIp(request.headers));
    return Response.json({ ok: true, report }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
