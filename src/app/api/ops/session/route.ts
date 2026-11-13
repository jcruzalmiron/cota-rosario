import { clearedSessionCookie, guardOpsRequest, openSession, opsErrorResponse, opsJson, requireOperator, sessionCookie } from "@/lib/opsAuth";
import { clientIp, readJsonBody } from "@/lib/requestGuard";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_024;

export async function GET(request: Request) {
  try {
    const session = requireOperator(request);
    return opsJson({ ok: true, name: session.name, expiresAt: new Date(session.exp).toISOString() });
  } catch (error: unknown) {
    return opsErrorResponse(error, "/api/ops/session");
  }
}

export async function POST(request: Request) {
  try {
    guardOpsRequest(request, { mutating: true });
    const body = (await readJsonBody(request, MAX_BODY_BYTES)) as { key?: unknown; name?: unknown } | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return opsJson({ ok: false, error: "Cuerpo inválido." }, { status: 400 });
    }
    const { token, name } = openSession(body, clientIp(request.headers));
    return opsJson({ ok: true, name }, { headers: { "set-cookie": sessionCookie(token) } });
  } catch (error: unknown) {
    return opsErrorResponse(error, "/api/ops/session");
  }
}

export async function DELETE(request: Request) {
  try {
    guardOpsRequest(request, { mutating: true });
    return opsJson({ ok: true }, { headers: { "set-cookie": clearedSessionCookie() } });
  } catch (error: unknown) {
    return opsErrorResponse(error, "/api/ops/session");
  }
}
