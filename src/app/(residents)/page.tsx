import { FloodMap } from "@/components/FloodMap";
import { AnswerCard } from "@/components/residents/home/AnswerCard";
import { ConditionLines } from "@/components/residents/home/ConditionLines";
import { HowWeCalculate } from "@/components/residents/home/HowWeCalculate";
import { OfficialAlerts } from "@/components/residents/home/OfficialAlerts";
import { TodayClaims } from "@/components/residents/home/TodayClaims";
import { Workspace } from "@/components/shell/Workspace";
import { ago } from "@/lib/claims";
import { EMERGENCY_PHONE } from "@/lib/navigation";
import { sourceSignals } from "@/lib/placeSignals";
import type { AlertsSnapshot } from "@/lib/provincial";
import { parseReportFilter, queryReports } from "@/lib/reports";
import type { ReportCounts } from "@/lib/reportTypes";
import { rainLine, residentAnswer, riverLine, streamLines, type ConditionLine } from "@/lib/residents";
import { loadStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

/** Reclamos cargados hoy (día argentino). Si el registro no se puede leer devuelve `null`: no se muestra un cero. */
async function todayCounts(): Promise<ReportCounts | null> {
  try {
    return (await queryReports(parseReportFilter(new URLSearchParams()))).counts;
  } catch (error: unknown) {
    console.error("Today's claims unavailable:", error instanceof Error ? error.message : "Error");
    return null;
  }
}

function alertsLine(alerts: AlertsSnapshot | null, now: number): ConditionLine[] {
  // Con alertas vigentes o sin poder consultarlas ya hay un aviso propio más arriba.
  if (!alerts || alerts.items.length > 0) {
    return [];
  }
  return [{ id: "alerts", name: "Alertas oficiales", value: "ninguna", meaning: "El Servicio Meteorológico Nacional no tiene alertas vigentes para Rosario.", freshness: `revisado ${ago(alerts.fetchedAt, now)}`, tone: "calm" }];
}

export default async function ResidentsPage() {
  const [status, counts] = await Promise.all([loadStatus(), todayCounts()]);
  const { risk, river, rain, alerts, streams } = status;
  const now = Date.parse(risk.assessedAt);
  const answer = residentAnswer({ risk, river, rain, alerts, now });
  const lines = [...alertsLine(alerts, now), riverLine(risk, river, now), rainLine(risk, rain, now), ...streamLines(streams, now)];

  return (
    <Workspace
      sheetOpen
      canvas={<FloodMap zones={risk.zones} signals={sourceSignals(risk, river, rain)} searcher reports report />}
      rail={
        <div className="flex flex-col">
          <AnswerCard answer={answer} assessedAt={risk.assessedAt} />
          <OfficialAlerts alerts={alerts} now={now} />
          <TodayClaims counts={counts} />
          <ConditionLines lines={lines} />
          <HowWeCalculate status={status} now={now} />
          <p className="hairline px-5 py-5 text-sm leading-relaxed text-ink-soft">
            Si hay riesgo para personas, llamá a Defensa Civil al{" "}
            <a href={`tel:${EMERGENCY_PHONE}`} className="font-medium text-ink underline decoration-rule underline-offset-4">
              {EMERGENCY_PHONE}
            </a>
            . Cota informa; no reemplaza los avisos oficiales.
          </p>
        </div>
      }
    />
  );
}
