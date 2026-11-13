import { opsErrorResponse, requireOperator } from "@/lib/opsAuth";
import { parseReportFilter, queryOpsReports } from "@/lib/reports";
import { reportsCsv } from "@/lib/reportsCsv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireOperator(request);
    const filter = parseReportFilter(new URL(request.url).searchParams, { allowDistrict: true });
    const page = await queryOpsReports(filter);
    return new Response(reportsCsv(page.reports), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="reclamos-${page.from}_${page.to}.csv"`,
        "cache-control": "no-store",
        "x-cota-truncated": page.truncated ? "1" : "0",
      },
    });
  } catch (error: unknown) {
    return opsErrorResponse(error, "/api/ops/reports.csv");
  }
}
