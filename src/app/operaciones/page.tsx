import { DataStatus } from "@/components/DataStatus";
import { Docs, DocsSection } from "@/components/Docs";
import { FloodMap } from "@/components/FloodMap";
import { KpiGrid } from "@/components/kpis/KpiGrid";
import { Sparkline } from "@/components/kpis/Sparkline";
import { Briefing, PulseCard, PulseGrid, PulseSpark } from "@/components/panel/briefing";
import { PanelSection } from "@/components/panel/PanelBlocks";
import { SectionHero, type HeroFigure } from "@/components/panel/SectionHero";
import { rainTiles, networkAndReportTiles, riverTiles } from "@/components/panel/tiles";
import { Provenance } from "@/components/Provenance";
import { Workspace } from "@/components/shell/Workspace";
import { WeatherLine } from "@/components/WeatherBadge";
import { OPS_CLAIMS_HREF } from "@/lib/navigation";
import { loadPanel } from "@/lib/panelData";
import { riskLabel } from "@/lib/risk";
import { statusTitle } from "@/lib/residents";

export const dynamic = "force-dynamic";

const MARGIN_WARNING_M = 0.5;
const HEAVY_48H_MM = 30;

export default async function SummaryPage() {
  const { status, kpis, predictions, recommendations, situationReport, failureOf } = await loadPanel();
  const { risk, river, rain, discharge, weather } = status;
  const margin = kpis.river?.alertMarginM ?? null;
  const balance = kpis.rain?.balance ?? null;
  const urgent = recommendations.filter((item) => item.priority === "high").length;
  const flooding = predictions.flooding;

  const figures: HeroFigure[] = [
    { label: "Río en Rosario", value: kpis.river?.current ?? null, decimals: 2, unit: "m", detail: margin === null ? "sin umbral de alerta" : `${margin.toFixed(2)} m a la alerta` , tone: margin !== null && margin <= MARGIN_WARNING_M ? "watch" : "neutral" },
    { label: "Lluvia 48 h", value: balance?.expected48h ?? null, decimals: 1, unit: "mm", detail: balance ? `${balance.fallen24h.toFixed(1)} mm cayeron en 24 h` : "pronóstico no disponible", tone: balance && balance.expected48h >= HEAVY_48H_MM ? "watch" : "neutral" },
    { label: "Reclamos abiertos · 24 h", value: kpis.reports?.active ?? null, detail: kpis.reports ? `${kpis.reports.last6h} en las últimas 6 h` : "consulta no disponible" },
    { label: "Para hacer ahora", value: urgent, detail: recommendations.length === 1 ? "1 sugerencia en total" : `${recommendations.length} sugerencias en total`, tone: urgent ? "critical" : "neutral" },
  ];

  return (
    <Workspace
      canvas={<FloodMap zones={risk.zones} reports />}
      rail={
        <div className="flex flex-col">
          <WeatherLine weather={weather} />
          <SectionHero pattern="summary" meta={`Seguimiento hídrico${risk.incomplete ? " · evaluación parcial" : ""}`} title="Resumen" level={risk.level} status={riskLabel(risk.level)} figures={figures}>
            {statusTitle(risk.level)}. Qué conviene revisar ahora, el parte para compartir y el pulso de cada sección.
          </SectionHero>

          <DataStatus status={status} />

          <PanelSection title="Sugerencias para revisar" note="Basadas en los indicadores y reportes disponibles. Cada una muestra el dato que la motiva.">
            <Briefing recommendations={recommendations} situationReport={situationReport} />
          </PanelSection>

          <PanelSection title="Por sección">
            <PulseGrid>
              <PulseCard href="/operaciones/rio" title="Río" value={kpis.river ? kpis.river.current.toFixed(2) : "—"} unit="m" detail={kpis.river?.change7dCm == null ? "sin variación semanal" : `${kpis.river.change7dCm > 0 ? "+" : ""}${kpis.river.change7dCm} cm en 7 días`} accent="var(--water)">
                {kpis.river ? <PulseSpark values={kpis.river.sparkline.map((reading) => reading.meters)} alert={river?.station.alert} /> : null}
              </PulseCard>
              <PulseCard href="/operaciones/lluvia" title="Lluvia" value={rain?.peakWindow ? rain.peakWindow.millimeters.toFixed(1) : "—"} unit="mm / 2 h" detail={rain?.peakWindow ? "pico de las próximas horas" : "sin pico calculable"} accent="var(--water)" />
              <PulseCard href="/operaciones/pronostico" title="Pronóstico" value={flooding ? flooding.cityExpected.toFixed(flooding.cityExpected < 10 ? 1 : 0) : "—"} unit="anegamientos" detail={flooding ? `esperados en ${flooding.windowDays} días · exploratorio` : "modelo no disponible"} accent="var(--watch)" />
              <PulseCard href={OPS_CLAIMS_HREF} title="Reclamos" value={kpis.reports ? String(kpis.reports.active) : "—"} unit="abiertos · 24 h" detail={kpis.reports?.byDistrict[0] ? `más en ${kpis.reports.byDistrict[0].district.toLowerCase()} · tomar y resolver` : "ningún distrito con reclamos abiertos"} accent="var(--critical)" />
            </PulseGrid>
          </PanelSection>

          <PanelSection title="Todos los indicadores">
            <div className="flex flex-col gap-5">
              <KpiGrid tiles={[...riverTiles(kpis), ...rainTiles(kpis), ...networkAndReportTiles(kpis)]}>
                {kpis.river ? (
                  <div className="flex flex-col gap-1">
                    <Sparkline values={kpis.river.sparkline.map((reading) => reading.meters)} />
                    <span className="meta">
                      altura del río, últimos 60 días · de {kpis.river.min210.meters.toFixed(2)} a {kpis.river.max210.meters.toFixed(2)} m en 210 días
                      {river?.station.alert ? ` · alerta ${river.station.alert.toFixed(2)} m` : ""}
                    </span>
                  </div>
                ) : null}
              </KpiGrid>
            </div>
          </PanelSection>

          <Docs>
            <DocsSection title="Las recomendaciones">
              <p className="text-xs leading-relaxed text-ink-soft">
                Reglas fijas sobre los mismos datos del panel, ordenadas por urgencia (ahora / hoy / cuando se pueda). Río: umbrales del INA superados;
                margen a alerta de 0,50 m o menos, o alerta a 7 días o menos al ritmo actual; dos o más estaciones aguas arriba a 0,50 m o menos de su alerta y
                creciendo; ritmo de 2 cm/día o más. Lluvia: pico de 2 h sobre los umbrales de atención/alerta del panel; 30 mm o más en 48 h; un día con
                período de retorno de 5 años o más; mes en curso al 150 % de lo normal. Anegamientos: 10 o más esperados en la semana, o 3 en un distrito.
                Reportes: agua en viviendas, 3 o más en 6 horas, calles cortadas. Fuentes: INA sin responder. Si nada aplica, se sugiere trabajo preventivo.
                El parte de situación se arma con las mismas cifras. Todo en JSON en <span className="readout">/api/recommendations</span>.
              </p>
            </DocsSection>
            <DocsSection title="Los indicadores">
              <p className="text-xs leading-relaxed text-ink-soft">
                Río: variaciones sobre la serie diaria del INA; el percentil compara la altura de hoy con los últimos 210 días; el ritmo es una recta de
                mínimos cuadrados sobre 14 días. Lluvia caída: horas pasadas del modelo de Open-Meteo, no un pluviómetro de Rosario. Mes en curso:
                archivo de Open-Meteo con fecha de cobertura contra la referencia histórica del mismo mes. Aguas arriba: margen = alerta − altura; se excluyen lecturas de más de 48 h.
                Reclamos: los abiertos (sin resolver ni descartar) cargados por vecinos en las últimas 24 h, ubicados por distrito; el historial completo y la gestión están en Reclamos. Todo en JSON en <span className="readout">/api/kpis</span>.
              </p>
            </DocsSection>
            <DocsSection title="Fuentes y última consulta">
              <Provenance
                stamps={[
                  { id: "ina", fetchedAt: river?.fetchedAt, failure: failureOf("ina") },
                  { id: "openMeteo", fetchedAt: rain?.fetchedAt, failure: failureOf("openMeteo") },
                  { id: "glofas", fetchedAt: discharge?.fetchedAt, failure: failureOf("glofas") },
                ]}
              />
              <a href="/api/status" className="readout inline-block text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                GET /api/status · el cruce completo en JSON
              </a>
            </DocsSection>
          </Docs>
        </div>
      }
    />
  );
}
