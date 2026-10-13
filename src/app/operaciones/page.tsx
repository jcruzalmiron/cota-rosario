import { DataStatus } from "@/components/DataStatus";
import { AppShell } from "@/components/AppShell";
import { Docs, DocsSection } from "@/components/Docs";
import { KpiGrid, type KpiTile } from "@/components/kpis/KpiGrid";
import { RainBalanceBars } from "@/components/kpis/RainBalanceBars";
import { Recomendaciones } from "@/components/Recomendaciones";
import { Sparkline } from "@/components/kpis/Sparkline";
import { UpstreamStrip } from "@/components/kpis/UpstreamStrip";
import { FloodMap } from "@/components/FloodMap";
import { Provenance } from "@/components/Provenance";
import { RiverGauge } from "@/components/RiverGauge";
import { SimulationProvider } from "@/components/SimulationContext";
import { Simulator } from "@/components/Simulator";
import { SourceDown } from "@/components/SourceDown";
import { StationTable } from "@/components/StationTable";
import { WeatherBadge } from "@/components/WeatherBadge";
import { loadEstado } from "@/lib/estado";
import { loadKpis, type Kpis } from "@/lib/kpis";
import { loadPredicciones } from "@/lib/predicciones";
import { buildParte, buildRecomendaciones } from "@/lib/recomendaciones";
import { PARANA_GLOFAS_CELL, ROSARIO } from "@/lib/sources";
import { hasUsableThresholds } from "@/lib/risk";

export const dynamic = "force-dynamic";

const CAUDAL_DECIMALS = 0;
const PERCENT = 100;

function signo(valor: number | null, unidad: string): string {
  if (valor === null) {
    return "—";
  }
  return `${valor > 0 ? "+" : ""}${valor} ${unidad}`;
}

function tilesRio(kpis: Kpis): KpiTile[] {
  const { rio } = kpis;
  if (!rio) {
    return [];
  }
  const margen = rio.margenAlertaM;
  return [
    { etiqueta: "Río ahora", valor: rio.actual.toFixed(2), unidad: "m", detalle: `${signo(rio.variacion24hCm, "cm")} en 24 h · ${signo(rio.variacion7dCm, "cm")} en 7 días` },
    {
      etiqueta: "Margen a alerta",
      valor: margen === null ? "—" : margen.toFixed(2),
      unidad: "m",
      detalle: rio.diasHastaAlerta === null ? (rio.ritmoCmDia === null ? "sin tendencia" : `${rio.ritmoCmDia} cm/día · no la alcanza a este ritmo`) : `${rio.ritmoCmDia} cm/día · extrapolación a ${rio.diasHastaAlerta} días${rio.diasHastaAlerta > 7 ? " · fuera de la ventana semanal" : ""}`,
      tono: margen !== null && margen <= 0.5 ? "atencion" : "neutro",
    },
    { etiqueta: "Frente a los últimos 210 días", valor: `p${rio.percentil210}`, detalle: `mín ${rio.minimo210.metros.toFixed(2)} · máx ${rio.maximo210.metros.toFixed(2)} m` },
  ];
}

function tilesLluvia(kpis: Kpis): KpiTile[] {
  const { lluvia } = kpis;
  if (!lluvia) {
    return [];
  }
  const { balance, mes, mesNormalMm } = lluvia;
  const porcentajeMes = mes && mesNormalMm ? Math.round((mes.acumuladoMm / mesNormalMm) * PERCENT) : null;
  return [
    { etiqueta: "Lluvia caída", valor: balance.caido24h.toFixed(0), unidad: "mm / 24 h", detalle: `${balance.caido72h.toFixed(0)} mm en 72 h` },
    { etiqueta: "Lluvia prevista", valor: balance.prevista48h.toFixed(0), unidad: "mm / 48 h", detalle: `${balance.prevista24h.toFixed(0)} mm en 24 h · prob. máx ${balance.probabilidadMax24h === null ? "sin dato" : `${balance.probabilidadMax24h} %`}`, tono: balance.prevista48h >= 30 ? "atencion" : "neutro" },
    {
      etiqueta: "Mes en curso",
      valor: mes ? mes.acumuladoMm.toFixed(0) : "—",
      unidad: "mm",
      detalle: porcentajeMes === null ? "sin climatología" : `${porcentajeMes} % de la referencia mensual (${mesNormalMm} mm) · datos hasta ${mes?.hasta ?? "—"}${mes?.completo ? "" : " · cobertura parcial"}`,
    },
  ];
}

function tilesRedYReportes(kpis: Kpis): KpiTile[] {
  const { red, reportes } = kpis;
  const tipoTop = [...(reportes?.porTipo ?? [])].sort((a, b) => b.cantidad - a.cantidad)[0];
  return [
    ...(red
      ? [
          { etiqueta: "Estaciones sobre alerta", valor: String(red.sobreAlerta), detalle: `${red.sobreEvacuacion} sobre evacuación · de ${red.conUmbral} con umbral`, tono: red.sobreAlerta > 0 ? ("alerta" as const) : ("neutro" as const) },
          { etiqueta: "Estaciones creciendo", valor: String(red.creciendo), detalle: `de ${red.conUmbral} con umbral válido` },
        ]
      : []),
    {
      etiqueta: "Reportes de vecinos",
      valor: reportes ? String(reportes.activos) : "—",
      detalle: !reportes ? "consulta no disponible" : reportes.activos === 0 ? "ninguno en 24 h" : `${reportes.ultimas6h} en las últimas 6 h · ${reportes.confirmaciones} confirmaciones${tipoTop && tipoTop.cantidad > 0 ? ` · ${tipoTop.etiqueta.toLowerCase()}` : ""}`,
      tono: (reportes?.ultimas6h ?? 0) > 0 ? ("atencion" as const) : ("neutro" as const),
    },
  ];
}

export default async function OperacionesPage() {
  const estadoPromise = loadEstado();
  const [estado, kpis, predicciones] = await Promise.all([estadoPromise, loadKpis(estadoPromise), loadPredicciones(estadoPromise)]);
  const { riesgo, rio, lluvia, caudal, clima, fallas } = estado;
  const recomendaciones = buildRecomendaciones({ estado, kpis, predicciones });
  const parte = buildParte({ estado, kpis, predicciones });
  const fallaDe = (fuente: string) => fallas.find((falla) => falla.fuente === fuente);
  const caudalMaximo = caudal ? Math.max(...caudal.dias.map((dia) => dia.caudal), 1) : 1;

  return (
    <SimulationProvider>
      <AppShell
        activo="/operaciones"
        nivel={riesgo.nivel}
        actualizadoEn={riesgo.evaluadoEn}
        lienzo={<FloodMap zonas={riesgo.zonas} reportes esquina={<WeatherBadge clima={clima} />} />}
        lienzoInferior={
          <>
            <h2 className="meta">Red hidrométrica del INA</h2>
            <div className="mt-4">{rio ? <StationTable estaciones={rio.red} /> : <SourceDown falla={fallaDe("ina")!} />}</div>
          </>
        }
        rail={
          <div className="flex flex-col">
            <section className="px-5 py-6 sm:px-6">
              <p className="meta">Exploración operativa{riesgo.incompleto ? " · evaluación parcial" : ""}</p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">Operaciones</h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Las mismas fuentes que ve el vecino, sin redondear: la red completa del INA, el caudal del Paraná y un simulador para ensayar
                escenarios sobre el mapa.
              </p>
            </section>

            <DataStatus estado={estado} />

            <section className="hairline px-5 py-6 sm:px-6">
              <h2 className="meta">Sugerencias para revisar</h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                Recomendaciones derivadas de los datos de esta vista, con el número que las dispara. Son reglas fijas y explicadas en la documentación, no una
                opinión: la decisión sigue siendo de quien opera.
              </p>
              <div className="mt-4">
                <Recomendaciones recomendaciones={recomendaciones} parte={parte} />
              </div>
            </section>



            <section className="hairline px-5 py-6 sm:px-6">
              <h2 className="meta">Indicadores</h2>
              <div className="mt-4 flex flex-col gap-5">
                <KpiGrid tiles={[...tilesRio(kpis), ...tilesLluvia(kpis), ...tilesRedYReportes(kpis)]}>
                  {kpis.rio ? (
                    <div className="flex flex-col gap-1">
                      <Sparkline valores={kpis.rio.sparkline.map((lectura) => lectura.metros)} />
                      <span className="meta">
                        altura del río, últimos 60 días · de {kpis.rio.minimo210.metros.toFixed(2)} a {kpis.rio.maximo210.metros.toFixed(2)} m en 210 días
                        {rio?.estacion.alerta ? ` · alerta ${rio.estacion.alerta.toFixed(2)} m` : ""}
                      </span>
                    </div>
                  ) : null}
                </KpiGrid>
              </div>
            </section>

            {kpis.aguasArriba.length ? (


            <section className="hairline px-5 py-6 sm:px-6">
                <h2 className="meta">Cadena del Paraná</h2>
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                  Lecturas recientes y margen en metros respecto al umbral de cada estación. Una subida aguas arriba no determina por sí sola qué pasará en Rosario.
                </p>
                <div className="mt-4">
                  <UpstreamStrip estaciones={kpis.aguasArriba} />
                </div>
              </section>
            ) : null}

            {kpis.lluvia ? (


            <section className="hairline px-5 py-6 sm:px-6">
                <h2 className="meta">Lluvia caída y prevista</h2>
                <div className="mt-4">
                  <RainBalanceBars balance={kpis.lluvia.balance} />
                </div>
                <p className="meta mt-3">lleno: caída · tenue: prevista · seis días alrededor de hoy</p>
              </section>
            ) : null}

            {kpis.reportes && kpis.reportes.activos > 0 ? (


            <section className="hairline px-5 py-6 sm:px-6">
                <h2 className="meta">Reportes de vecinos · 24 h</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <ul className="flex flex-col gap-1.5 text-xs">
                    {kpis.reportes.porTipo.map((tipo) => (
                      <li key={tipo.tipo} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-ink-soft">
                          <span className="size-2 rounded-full" style={{ background: tipo.color }} aria-hidden="true" />
                          {tipo.etiqueta}
                        </span>
                        <span className="readout text-ink">{tipo.cantidad}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="flex flex-col gap-1.5 text-xs">
                    {kpis.reportes.porDistrito.map((distrito) => (
                      <li key={distrito.distrito} className="flex items-center justify-between gap-3">
                        <span className="text-ink-soft">{distrito.distrito.charAt(0) + distrito.distrito.slice(1).toLowerCase()}</span>
                        <span className="readout text-ink">{distrito.cantidad}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}



            <section className="hairline px-5 py-6 sm:px-6">
              <h2 className="meta">Simulador de escenarios</h2>
              <div className="mt-4">
                {rio && lluvia?.picoVentana && hasUsableThresholds(rio.estacion) ? (
                  <Simulator
                    metrosActuales={rio.estacion.metros}
                    alerta={rio.estacion.alerta!}
                    evacuacion={rio.estacion.evacuacion !== null && rio.estacion.evacuacion > 0 ? rio.estacion.evacuacion : null}
                    picoActualMm={lluvia.picoVentana.milimetros}
                  />
                ) : (
                  <p className="text-xs leading-relaxed text-ink-soft">El simulador necesita altura, umbral de alerta y lluvia utilizables de las fuentes para iniciar el escenario.</p>
                )}
              </div>
            </section>



            <section className="hairline px-5 py-6 sm:px-6">
              <h2 className="meta">Estación Rosario</h2>
              <div className="mt-4">{rio ? <RiverGauge rio={rio} /> : <SourceDown falla={fallaDe("ina")!} />}</div>
            </section>



            <section className="hairline px-5 py-6 sm:px-6">
              <h2 className="meta">Caudal del Paraná</h2>
              {caudal ? (
                <>
                  <div className="mt-4 flex items-baseline gap-2.5">
                    <span className="readout text-3xl font-medium text-ink">
                      {caudal.actual === null ? "—" : caudal.actual.toFixed(CAUDAL_DECIMALS)}
                    </span>
                    <span className="text-sm text-ink-soft">m³/s</span>
                    <span className="meta ml-auto">próximos 7 días</span>
                  </div>
                  <ul className="mt-4 flex flex-col gap-2">
                    {caudal.dias.map((dia) => (
                      <li key={dia.fecha} className="flex items-center gap-3 text-xs">
                        <span className="readout w-20 shrink-0 text-ink-faint">{dia.fecha.slice(5)}</span>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-rule-soft">
                          <span className="block h-full rounded-full bg-ink-faint" style={{ width: `${(dia.caudal / caudalMaximo) * 100}%` }} />
                        </span>
                        <span className="readout w-16 shrink-0 text-right text-ink">{dia.caudal.toFixed(CAUDAL_DECIMALS)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="mt-4">
                  <SourceDown falla={fallaDe("glofas")!} />
                </div>
              )}
            </section>

            <Docs>
              <DocsSection titulo="Las recomendaciones">
                <p className="text-xs leading-relaxed text-ink-soft">
                  Reglas fijas sobre los mismos datos del panel, ordenadas por urgencia (ahora / hoy / cuando se pueda). Río: umbrales del INA superados;
                  margen a alerta de 0,50 m o menos, o alerta a 7 días o menos al ritmo actual; dos o más estaciones aguas arriba a 0,50 m o menos de su alerta y
                  creciendo; ritmo de 2 cm/día o más. Lluvia: pico de 2 h sobre los umbrales de atención/alerta del panel; 30 mm o más en 48 h; un día con
                  período de retorno de 5 años o más; mes en curso al 150 % de lo normal. Anegamientos: 10 o más esperados en la semana, o 3 en un distrito.
                  Reportes: agua en viviendas, 3 o más en 6 horas, calles cortadas. Fuentes: INA sin responder. Si nada aplica, se sugiere trabajo preventivo.
                  El parte de situación se arma con las mismas cifras. Todo en JSON en <span className="readout">/api/recomendaciones</span>.
                </p>
              </DocsSection>
              <DocsSection titulo="Los indicadores">
                <p className="text-xs leading-relaxed text-ink-soft">
                  Río: variaciones sobre la serie diaria del INA; el percentil compara la altura de hoy con los últimos 210 días; el ritmo es una recta de
                  mínimos cuadrados sobre 14 días. Lluvia caída: horas pasadas del modelo de Open-Meteo, no un pluviómetro de Rosario. Mes en curso:
                  archivo de Open-Meteo con fecha de cobertura contra la referencia histórica del mismo mes. El snapshot histórico no fijaba un modelo de reanálisis. Aguas arriba: margen = alerta − altura; se excluyen lecturas de más de 48 h.
                  Reportes: los cargados por vecinos en las últimas 24 h, ubicados por distrito. Todo en JSON en <span className="readout">/api/kpis</span>.
                </p>
              </DocsSection>
              <DocsSection titulo="El simulador">
                <p className="text-xs leading-relaxed text-ink-soft">
                  Usa exactamente el mismo modelo que la vista pública: mover los controles pinta el mapa con el escenario, no altera ningún dato real ni
                  queda guardado. Sirve para comparar escenarios hipotéticos durante la capacitación.
                </p>
              </DocsSection>
              <DocsSection titulo="El caudal">
                <p className="text-xs leading-relaxed text-ink-soft">
                  Es el caudal modelado por GloFAS (Copernicus), no una medición. En las coordenadas del centro de Rosario ({ROSARIO.lat}, {ROSARIO.lon})
                  GloFAS devuelve 0,03 m³/s porque cae en una celda sin cauce; este panel consulta la celda del canal ({PARANA_GLOFAS_CELL.lat},{" "}
                  {PARANA_GLOFAS_CELL.lon}).
                </p>
              </DocsSection>
              <DocsSection titulo="Fuentes y última consulta">
                <Provenance
                  sellos={[
                    { id: "ina", consultadoEn: rio?.consultadoEn, falla: fallaDe("ina") },
                    { id: "openMeteo", consultadoEn: lluvia?.consultadoEn, falla: fallaDe("openMeteo") },
                    { id: "glofas", consultadoEn: caudal?.consultadoEn, falla: fallaDe("glofas") },
                  ]}
                />
                <a href="/api/estado" className="readout inline-block text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                  GET /api/estado · el cruce completo en JSON
                </a>
              </DocsSection>
            </Docs>
          </div>
        }
      />
    </SimulationProvider>
  );
}
