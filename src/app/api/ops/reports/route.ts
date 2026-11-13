import { opsErrorResponse, opsJson, requireOperator } from "@/lib/opsAuth";
import { parseReportFilter, queryOpsReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireOperator(request);
    const filter = parseReportFilter(new URL(request.url).searchParams, { allowDistrict: true });
    return opsJson({ ok: true, ...(await queryOpsReports(filter)) });
  } catch (error: unknown) {
    return opsErrorResponse(error, "/api/ops/reports");
  }
}
