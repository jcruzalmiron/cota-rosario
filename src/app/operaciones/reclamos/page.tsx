import type { Metadata } from "next";
import { cookies } from "next/headers";
import districts from "../../../../public/data/districts.json";
import { ClaimsWorkspace } from "@/components/ops/ClaimsWorkspace";
import { SectionHero, type HeroFigure } from "@/components/panel/SectionHero";
import { claimStats, claimsApiParams, claimsViewFromParams, durationFigure, type ClaimStats, type ClaimsView } from "@/lib/opsClaims";
import { OPS_COOKIE, OPS_DISABLED_MESSAGE, OpsAuthError, verifySessionToken } from "@/lib/opsAuth";
import { parseReportFilter, queryOpsReports, queryReports, ReportError } from "@/lib/reports";
import { REPORT_STATUSES, type OpsReport, type Report, type ReportPage } from "@/lib/reportTypes";
import { addCalendarDays, argentinaDateTime, argentinaDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reclamos · Operaciones · Cota" };

const STATS_WINDOW_DAYS = 365;
const DISTRICT_NAMES = (districts as { features: { properties: { district: string } }[] }).features.map((feature) => feature.properties.district);
const STORE_DOWN = "El registro de reclamos no respondió. No se puede afirmar que no haya reclamos; actualizá la vista para volver a consultar.";

type RawParams = Record<string, string | string[] | undefined>;

/** Sesión del operador leída de la cookie firmada. La página es pública: sin sesión se muestra en sólo lectura. */
async function operatorAccess(): Promise<{ enabled: boolean; operator: string | null }> {
  try {
    const token = (await cookies()).get(OPS_COOKIE)?.value ?? "";
    return { enabled: true, operator: verifySessionToken(token)?.name ?? null };
  } catch (error: unknown) {
    if (error instanceof OpsAuthError) return { enabled: false, operator: null };
    throw error;
  }
}

function describe(error: unknown): string {
  if (error instanceof ReportError) return error.status >= 500 ? STORE_DOWN : error.message;
  throw error;
}

function heroFigures(stats: ClaimStats): HeroFigure[] {
  const todayMean = stats.meanResolveMsToday;
  const meanMs = todayMean ?? stats.meanResolveMsRecent;
  const meanFigure = meanMs === null ? null : durationFigure(meanMs);
  const oldest = stats.oldestOpen ? durationFigure(stats.oldestOpen.waitMs) : null;
  return [
    { label: "Sin tomar", value: stats.waiting, tone: stats.waiting ? "critical" : "neutral", detail: `${stats.receivedToday} ${stats.receivedToday === 1 ? "cargado" : "cargados"} hoy${stats.openHomes ? ` · ${stats.openHomes} con agua en viviendas` : ""}` },
    { label: "En atención", value: stats.inProgress, tone: stats.inProgress ? "watch" : "neutral", detail: "tomados y sin cerrar" },
    { label: "Resueltos hoy", value: stats.resolvedToday, detail: `${stats.resolvedRecent} en 30 días` },
    { label: "Descartados hoy", value: stats.dismissedToday, detail: "duplicados o sin sustento" },
    {
      label: "Media hasta resolver",
      value: meanFigure?.value ?? null,
      decimals: meanFigure?.decimals,
      unit: meanFigure?.unit,
      detail: todayMean !== null ? `de la carga al cierre · ${stats.resolvedToday} de hoy` : meanMs !== null ? `sin resueltos hoy · media de ${stats.resolvedRecent} en 30 días` : "todavía no hay reclamos resueltos",
    },
    {
      label: "Espera más larga",
      value: oldest?.value ?? null,
      decimals: oldest?.decimals,
      unit: oldest?.unit,
      tone: stats.oldestOpen && stats.oldestOpen.status === "new" ? "watch" : "neutral",
      detail: stats.oldestOpen ? `abierto desde ${argentinaDateTime(stats.oldestOpen.createdAt)} · ${REPORT_STATUSES[stats.oldestOpen.status].label.toLowerCase()}` : "no hay reclamos abiertos",
    },
  ];
}

async function loadClaims(raw: RawParams) {
  const now = Date.now();
  const today = argentinaDay(now);
  const view: ClaimsView = claimsViewFromParams(raw, today);
  const access = await operatorAccess();
  const statsFrom = addCalendarDays(today, -STATS_WINDOW_DAYS);

  let page: ReportPage<Report | OpsReport> | null = null;
  let pageError: string | null = null;
  try {
    const filter = parseReportFilter(claimsApiParams(view), { allowDistrict: true, now });
    page = access.operator ? await queryOpsReports(filter) : await queryReports(filter);
  } catch (error: unknown) {
    pageError = describe(error);
  }

  let stats: ClaimStats | null = null;
  let statsTruncated = false;
  try {
    const all = await queryReports({ from: statsFrom, to: today, statuses: null, types: null, districts: null });
    stats = claimStats(all.reports, now);
    statsTruncated = all.truncated;
  } catch (error: unknown) {
    describe(error);
  }

  return { now, today, view, access, page, pageError, stats, statsFrom, statsTruncated };
}

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { now, today, view, access, page, pageError, stats, statsFrom, statsTruncated } = await loadClaims(await searchParams);
  return (
    <ClaimsWorkspace
      hero={
        <SectionHero pattern="reports" meta="Vecinos · gestión y seguimiento" title="Reclamos" figures={stats ? heroFigures(stats) : []}>
          Cola de reclamos vecinales para tomar, resolver o descartar. Cada cambio queda en el historial y el vecino lo ve en su seguimiento.
        </SectionHero>
      }
      view={view}
      page={page ? { counts: page.counts, truncated: page.truncated, reports: page.reports } : null}
      pageError={pageError}
      stats={stats}
      statsFrom={statsFrom}
      statsTruncated={statsTruncated}
      enabled={access.enabled}
      disabledMessage={OPS_DISABLED_MESSAGE}
      operator={access.operator}
      districts={DISTRICT_NAMES}
      today={today}
      now={now}
    />
  );
}
