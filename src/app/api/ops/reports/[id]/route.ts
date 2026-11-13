import { opsErrorResponse, opsJson, requireOperator } from "@/lib/opsAuth";
import { updateReportStatus, type StatusChangeInput } from "@/lib/reports";
import { readJsonBody } from "@/lib/requestGuard";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[0-9a-f-]{36}$/;
const MAX_BODY_BYTES = 4_096;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = requireOperator(request, { mutating: true });
    const { id } = await context.params;
    if (!ID_PATTERN.test(id)) {
      return opsJson({ ok: false, error: "Identificador inválido." }, { status: 400 });
    }
    const body = (await readJsonBody(request, MAX_BODY_BYTES)) as StatusChangeInput | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return opsJson({ ok: false, error: "Cuerpo inválido." }, { status: 400 });
    }
    const report = await updateReportStatus(id, { status: body.status, note: body.note, publicNote: body.publicNote }, session.name);
    return opsJson({ ok: true, report });
  } catch (error: unknown) {
    return opsErrorResponse(error, "/api/ops/reports/:id");
  }
}
