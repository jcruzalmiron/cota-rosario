import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { HELP_HREF } from "@/components/TopBar";
import { Docs, DocsSection } from "@/components/Docs";
import { FloodMap } from "@/components/FloodMap";
import { Provenance } from "@/components/Provenance";
import { RainStrip } from "@/components/RainStrip";
import { RiverGauge } from "@/components/RiverGauge";
import { SourceDown } from "@/components/SourceDown";
import { WeatherBadge } from "@/components/WeatherBadge";
import { riskColor } from "@/components/status";
import { DataStatus } from "@/components/DataStatus";
import { loadEstado } from "@/lib/estado";
import { riskLabel } from "@/lib/risk";

export const dynamic = "force-dynamic";

const CONSEJOS: Record<string, string[]> = {
  normal: [
    "Los datos consultados no superan los umbrales orientativos. Revisá las condiciones de tu cuadra y las comunicaciones oficiales.",
    "Si vivís sobre zona marcada, revisá que la rejilla de tu frente no esté tapada.",
  ],
  atencion: [
    "Sacá el auto de la vereda si vivís sobre una zona marcada.",
    "Revisá que las rejillas y los desagües de tu frente estén despejados.",
    "Evitá programar viajes por las avenidas que cruzan el Ludueña o el Saladillo en las próximas horas.",
  ],
  alerta: [
    "No cruces calles anegadas ni en auto ni a pie: no se ve el cordón ni las bocas de tormenta abiertas.",
    "Levantá lo que tengas a nivel de piso en cocheras y patios.",
    "Si estás sobre zona marcada, tené documentación y medicación en algo impermeable.",
  ],
  critico: [
    "Seguí las indicaciones de Defensa Civil: 103.",
    "Cortá la luz del sector si el agua entra a la vivienda.",
    "No vuelvas a una zona anegada a buscar cosas hasta que baje.",
  ],
};

const CONSEJOS_INCOMPLETO = [
  "La evaluación está incompleta: consultá las fuentes disponibles y las comunicaciones oficiales.",
  "Los aportes de vecinos son señales para verificar; su ausencia no descarta agua en la zona.",
];

export default async function VecinosPage() {
  const estado = await loadEstado();
  const { riesgo, rio, lluvia, clima, fallas } = estado;
  const consejos = riesgo.nivel === null ? CONSEJOS_INCOMPLETO : riesgo.incompleto ? [...CONSEJOS[riesgo.nivel], CONSEJOS_INCOMPLETO[0]] : CONSEJOS[riesgo.nivel];
  const fallaDe = (fuente: string) => fallas.find((falla) => falla.fuente === fuente);
  const titulo = riesgo.nivel === null
    ? "Faltan datos para una evaluación completa"
    : riesgo.nivel === "normal"
      ? "Sin señales elevadas en los datos consultados"
      : `Nivel ${riskLabel(riesgo.nivel).toLowerCase()} en los datos consultados`;

  return (
    <AppShell
      activo="/"
      nivel={riesgo.nivel}
      actualizadoEn={riesgo.evaluadoEn}
      lienzo={<FloodMap zonas={riesgo.zonas} buscador reportes reportar esquina={<WeatherBadge clima={clima} />} />}
      rail={
        <div className="flex flex-col">
          <section className="px-5 py-6 sm:px-6">
            <p className="meta">Rosario · ahora{riesgo.incompleto ? " · evaluación parcial" : ""}</p>
            <h1 className="mt-2 flex items-start gap-3 text-2xl font-semibold leading-tight tracking-tight text-ink">
              <span
                className="mt-2.5 size-2.5 shrink-0 rounded-full"
                style={{ background: riskColor(riesgo.nivel) }}
                aria-hidden="true"
              />
              <span>{titulo}</span>
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{riesgo.motivo}</p>
          </section>

          <DataStatus estado={estado} />

          <section className="hairline flex flex-col">
            {riesgo.factores.map((factor) => (
              <div key={factor.clave} className="hairline flex flex-col gap-1.5 px-5 py-4 first:border-t-0 sm:px-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm text-ink">{factor.titulo}</h2>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: riskColor(factor.nivel) }}
                      aria-hidden="true"
                    />
                    <span className="text-ink-soft">{factor.disponible ? riskLabel(factor.nivel) : "sin evaluación"}</span>
                  </span>
                </div>
                <p className="readout text-sm text-ink">{factor.medida}</p>
                <p className="text-xs leading-relaxed text-ink-soft">{factor.detalle}</p>
              </div>
            ))}
          </section>

          <section className="hairline px-5 py-6 sm:px-6">
            <h2 className="meta">El río</h2>
            <div className="mt-4">{rio ? <RiverGauge rio={rio} /> : <SourceDown falla={fallaDe("ina")!} />}</div>
          </section>

          <section className="hairline px-5 py-6 sm:px-6">
            <h2 className="meta">La lluvia</h2>
            <div className="mt-4">{lluvia ? <RainStrip lluvia={lluvia} /> : <SourceDown falla={fallaDe("openMeteo")!} />}</div>
          </section>

          <section className="hairline px-5 py-6 sm:px-6">
            <h2 className="meta">Qué conviene hacer</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {consejos.map((consejo) => (
                <li key={consejo} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                  <span className="mt-2 h-px w-3 shrink-0 bg-ink-faint" aria-hidden="true" />
                  {consejo}
                </li>
              ))}
            </ul>
          </section>

          <Docs>
            <DocsSection titulo="Cómo se decide el nivel">
              <ul className="flex flex-col gap-2 text-xs leading-relaxed text-ink-soft">
                {riesgo.factores.map((factor) => (
                  <li key={factor.clave}>
                    <span className="text-ink">{factor.titulo}:</span> {factor.umbral} · {factor.oficial ? "umbral oficial" : "umbral estimado por este panel"}
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-ink-soft">
                El nivel general es el peor de los dos factores. Las zonas oficiales del Ludueña y el Saladillo se pintan con ese nivel, ponderado por
                su sensibilidad a la lluvia concentrada.
              </p>
            </DocsSection>
            <DocsSection titulo="De dónde sale cada número">
              <p className="text-xs leading-relaxed text-ink-soft">Las lecturas publicadas, los pronósticos y los mapas tienen su propia fecha y cobertura. Consultá el origen y el método de cada dato.</p>
              <Provenance
                sellos={[
                  { id: "ina", consultadoEn: rio?.consultadoEn, falla: fallaDe("ina") },
                  { id: "openMeteo", consultadoEn: lluvia?.consultadoEn, falla: fallaDe("openMeteo") },
                ]}
              />
              <a href="/api/estado" className="readout inline-block text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                GET /api/estado · el cruce completo en JSON
              </a>
            </DocsSection>
          </Docs>

          <p className="hairline px-5 py-6 text-xs leading-relaxed text-ink-faint sm:px-6">
            Ante una emergencia, Defensa Civil 103.{" "}
            <Link href={HELP_HREF} className="underline decoration-rule underline-offset-4 hover:text-ink">
              Cómo funciona Cota
            </Link>
            .
          </p>
        </div>
      }
    />
  );
}
