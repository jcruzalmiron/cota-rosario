import modelos from "../../../public/data/modelos.json";
import { DataStatus } from "@/components/DataStatus";
import { AppShell } from "@/components/AppShell";
import { DailyOutlook } from "@/components/DailyOutlook";
import { Docs, DocsSection } from "@/components/Docs";
import { FloodingOutlook } from "@/components/FloodingOutlook";
import { ForecastMap } from "@/components/ForecastMap";
import { ModelNotes } from "@/components/ModelNotes";
import { Provenance } from "@/components/Provenance";
import { RainOutlook } from "@/components/RainOutlook";
import { RiverProjection } from "@/components/RiverProjection";
import { SourceDown } from "@/components/SourceDown";
import { TrainingTable } from "@/components/TrainingTable";
import { WeatherBadge } from "@/components/WeatherBadge";
import type { PoissonModel } from "@/lib/forecast/poisson";
import { loadEstado } from "@/lib/estado";
import { loadPredicciones } from "@/lib/predicciones";
import { horaArgentina } from "@/lib/time";

export const dynamic = "force-dynamic";

const CM_PER_M = 100;
const WEAK_FIT_R2 = 0.5;
const DEFAULT_WINDOW_DAYS = 7;

function diasHasta(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "sin cruce futuro calculable" : valor > 7 ? `fuera de 7 días (hipótesis: ${valor} d)` : `en ${valor} días`;
}

export default async function PrediccionesPage() {
  const estadoPromise = loadEstado();
  const [estado, predicciones] = await Promise.all([estadoPromise, loadPredicciones(estadoPromise)]);
  const { anegamientos, lluvia, rio, fallas, consultas, vigencia, porDia } = predicciones;
  const fallaDe = (fuente: string) => fallas.find((falla) => falla.fuente === fuente);
  const entrenamiento = (modelos.anegamientos as PoissonModel).entrenamiento;
  const ventanaDias = anegamientos?.ventanaDias ?? DEFAULT_WINDOW_DAYS;
  const curvaDebil = rio?.curva ? rio.curva.r2 < WEAK_FIT_R2 : false;

  return (
    <AppShell
      activo="/predicciones"
      nivel={estado.riesgo.nivel}
      actualizadoEn={predicciones.generadoEn}
      lienzo={<ForecastMap distritos={anegamientos?.porDistrito ?? []} ventanaDias={ventanaDias} esquina={<WeatherBadge clima={estado.clima} />} />}
      lienzoInferior={
        porDia.length ? (
          <>
            <h2 className="meta">Día por día · próximos {ventanaDias} días</h2>
            <div className="mt-4">
              <DailyOutlook dias={porDia} alerta={rio?.alerta ?? null} />
            </div>
          </>
        ) : undefined
      }
      rail={
        <div className="flex flex-col">
          <section className="px-5 py-6 sm:px-6">
            <p className="meta">Próximos {ventanaDias} días{fallas.length ? " · evaluación parcial" : ""}</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">La semana que viene</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Lluvia prevista, tendencias del Paraná y escenarios de anegamiento para consultar los próximos siete días.
            </p>
          </section>

          <DataStatus estado={estado} />

          <section className="hairline px-5 py-6 sm:px-6">
            <h2 className="meta">Escenario de anegamientos</h2>
            <div className="mt-4">{anegamientos ? <FloodingOutlook anegamientos={anegamientos} /> : <SourceDown falla={fallaDe("modelos") ?? fallaDe("openMeteo")} />}</div>
          </section>



          <section className="hairline px-5 py-6 sm:px-6">
            <h2 className="meta">La lluvia que viene</h2>
            <div className="mt-4">{lluvia ? <RainOutlook lluvia={lluvia} /> : <SourceDown falla={fallaDe("openMeteo")!} />}</div>
          </section>



          <section className="hairline px-5 py-6 sm:px-6">
            <h2 className="meta">A dónde va el río</h2>
            <div className="mt-4">
              {rio ? (
                <div className="flex flex-col gap-4">
                  <RiverProjection rio={rio} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rule-soft pt-4 text-xs sm:grid-cols-3">
                    <div className="flex flex-col gap-0.5">
                      <dt className="meta">Ritmo actual</dt>
                      <dd className="readout text-ink">{rio.tendencia ? `${(rio.tendencia.metrosPorDia * CM_PER_M).toFixed(1)} cm/día` : "—"}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="meta">Alerta ({rio.alerta?.toFixed(2) ?? "—"} m)</dt>
                      <dd className="readout text-ink">{diasHasta(rio.tendencia?.diasHasta.alerta)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="meta">Evacuación ({rio.evacuacion?.toFixed(2) ?? "—"} m)</dt>
                      <dd className="readout text-ink">{diasHasta(rio.tendencia?.diasHasta.evacuacion)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="meta">En {ventanaDias} días, siguiendo el ritmo</dt>
                      <dd className="readout text-ink">{rio.tendencia ? `${rio.tendencia.proyeccion[rio.tendencia.proyeccion.length - 1].metros.toFixed(2)} m` : "—"}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="meta">En {ventanaDias} días, según el caudal</dt>
                      <dd className="readout text-ink">{rio.curva?.proyeccion.length ? `${rio.curva.proyeccion[rio.curva.proyeccion.length - 1].metros.toFixed(2)} m` : "—"}</dd>
                      {curvaDebil ? <dd className="meta text-atencion">estimación poco confiable</dd> : null}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="meta">Caudal hoy</dt>
                      <dd className="readout text-ink">{rio.caudal?.actual ? `${Math.round(rio.caudal.actual)} m³/s` : "—"}</dd>
                    </div>
                  </dl>
                  {!rio.caudal ? <SourceDown falla={fallaDe("glofas")!} /> : null}
                </div>
              ) : (
                <SourceDown falla={fallaDe("ina")!} />
              )}
            </div>
          </section>

          <Docs titulo="Fuentes, metodología y fecha de los datos">
            <DocsSection titulo="Cómo se calculan las tres estimaciones">
              <ModelNotes predicciones={predicciones} />
            </DocsSection>
            <DocsSection titulo="Hasta cuándo llega cada dato">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div className="flex flex-col gap-0.5">
                  <dt className="meta">Pronóstico y caudal</dt>
                  <dd className="text-ink">datos de la consulta actual</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="meta">Última lectura del río</dt>
                  <dd className="readout text-ink">{vigencia.ultimaMedicionRio ? `${vigencia.ultimaMedicionRio.slice(0, 10)} · diaria` : "—"}</dd>
                  {rio ? <dd className="meta">serie desde {rio.serieDesde.slice(0, 10)}</dd> : null}
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="meta">Registro de Defensa Civil incorporado hasta</dt>
                  <dd className="readout text-ink">{vigencia.defensaCivilHasta}</dd>
                  <dd className="meta">último mes del registro disponible</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="meta">Lluvia histórica hasta</dt>
                  <dd className="readout text-ink">{vigencia.lluviaHistoricaHasta}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="meta">Modelos ajustados</dt>
                  <dd className="readout text-ink">{vigencia.modelosCalculados.slice(0, 10)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="meta">Esta vista</dt>
                  <dd className="readout text-ink">{horaArgentina(predicciones.generadoEn)}</dd>
                </div>
              </dl>
            </DocsSection>
            <DocsSection titulo="Cómo le fue al modelo en el pasado, mes por mes">
              <TrainingTable entrenamiento={entrenamiento} />
            </DocsSection>
            <DocsSection titulo="Fuentes y última consulta">
              <Provenance
                sellos={[
                  { id: "ina", consultadoEn: consultas.ina, falla: fallaDe("ina") },
                  { id: "openMeteo", consultadoEn: consultas.openMeteo, falla: fallaDe("openMeteo") },
                  { id: "glofas", consultadoEn: consultas.glofas, falla: fallaDe("glofas") },
                ]}
              />
              <a href="/api/predicciones" className="readout inline-block text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                GET /api/predicciones · todo en JSON
              </a>
            </DocsSection>
          </Docs>

        </div>
      }
    />
  );
}
