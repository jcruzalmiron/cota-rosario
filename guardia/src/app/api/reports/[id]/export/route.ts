import { handle } from "@/server/http";

export const POST = handle<RouteContext<"/api/reports/[id]/export">>(async (_req, actor, s, ctx) => {
  const r = await s.reports.export(actor, Number((await ctx.params).id));
  return new Response(r.text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="informe-rev-${r.revisionId}.txt"`,
      "x-checksum": r.checksum,
    },
  });
});
