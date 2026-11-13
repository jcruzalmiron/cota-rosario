import { getReport, ReportError } from "@/lib/reports";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[0-9a-f-]{36}$/;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return Response.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
  }
  try {
    return Response.json({ ok: true, report: await getReport(id) }, { headers: { "cache-control": "no-store" } });
  } catch (error: unknown) {
    if (error instanceof ReportError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("Failed to read report:", error instanceof Error ? error.name : "Error");
    return Response.json({ ok: false, error: "No se pudo consultar el reclamo." }, { status: 500 });
  }
}
