import Link from "next/link";
import type { ReactNode } from "react";
import { Provenance } from "@/components/Provenance";
import { RainStrip } from "@/components/RainStrip";
import { RefreshButton } from "@/components/RefreshButton";
import { RiverGauge } from "@/components/RiverGauge";
import { ZoneOutlook } from "@/components/ZoneOutlook";
import { ago } from "@/lib/claims";
import { HELP_HREF } from "@/lib/navigation";
import type { Status } from "@/lib/status";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-rule-soft pt-5">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {children}
    </section>
  );
}

const TEXT = "text-sm leading-relaxed text-ink-soft";

/** El detalle que no hace falta para decidir: cómo se arma la respuesta, las zonas, los gráficos y las fuentes. */
export function HowWeCalculate({ status, now }: { status: Status; now: number }) {
  const { risk, river, rain, alerts, streams, failures } = status;
  const riverFactor = risk.factors.find((factor) => factor.id === "river");
  const rainFactor = risk.factors.find((factor) => factor.id === "rain");
  const failureOf = (source: string) => failures.find((failure) => failure.source === source);
  const checks = [
    { name: "Altura del Paraná", at: river?.station.date, verb: "medida" },
    { name: "Pronóstico de lluvia", at: rain?.fetchedAt, verb: "consultado" },
    { name: "Alertas del SMN", at: alerts?.fetchedAt, verb: "revisadas" },
    { name: "Altura de los arroyos", at: streams?.items[0]?.at, verb: "medida" },
  ];

  return (
    <details className="hairline group px-5 py-2">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
        <span>
          Cómo lo calculamos
          <span className="block text-xs text-ink-faint">El detalle, las zonas a 48 horas y de dónde sale cada dato</span>
        </span>
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="flex flex-col gap-5 pb-5 pt-2">
        <p className={TEXT}>
          Miramos dos cosas: la altura del río Paraná y la lluvia prevista para las próximas 48 horas. La respuesta de arriba es la peor de las dos. Si el Servicio Meteorológico Nacional emite una alerta para
          Rosario, manda la alerta. Si falta un dato, lo decimos: nunca lo contamos como «todo bien».
        </p>

        <Block title="El río Paraná">
          <p className={TEXT}>
            {riverFactor?.available
              ? `Comparamos la altura medida en el puerto de Rosario con los niveles oficiales del Instituto Nacional del Agua: ${riverFactor.threshold.replaceAll(".", ",")}.`
              : "No tenemos una altura del río para comparar con los niveles oficiales."}
          </p>
          {river ? <RiverGauge river={river} /> : null}
        </Block>

        <Block title="La lluvia">
          <p className={TEXT}>
            {rainFactor?.available
              ? "Tomamos las dos horas seguidas con más lluvia prevista. Avisamos desde 15 mm en dos horas, pasamos a alerta con 25 mm y a riesgo alto con 30 mm. Son valores de referencia de Cota, no oficiales, y el pronóstico sale de un modelo: puede fallar."
              : "No tenemos un pronóstico de lluvia vigente."}
          </p>
          {rain ? <RainStrip rain={rain} /> : null}
        </Block>

        <Block title="Zonas bajas del Ludueña y el Saladillo · próximas 48 horas">
          <p className={TEXT}>Las áreas inundables del mapa oficial. Cada una sube o baja según la lluvia prevista hora por hora, si es más sensible a la lluvia, si el Paraná está alto y si hay reportes de vecinos adentro.</p>
          <ZoneOutlook zones={risk.zones} />
        </Block>

        <Block title="De cuándo es cada dato">
          <ul className="flex flex-col gap-2">
            {checks.map((check) => (
              <li key={check.name} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-soft">{check.name}</span>
                <span className={check.at ? "readout text-xs text-ink" : "text-xs text-watch"}>{check.at ? `${check.verb} ${ago(check.at, now)}` : "no disponible ahora"}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <RefreshButton className="size-11 border border-rule" />
            Volver a consultar todo ahora
          </div>
        </Block>

        <details className="group/sources border-t border-rule-soft pt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
            Fuentes y licencias
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-faint transition-transform group-open/sources:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="pt-3">
            <Provenance
              stamps={[
                { id: "ina", fetchedAt: river?.fetchedAt, failure: failureOf("ina") },
                { id: "openMeteo", fetchedAt: rain?.fetchedAt, failure: failureOf("openMeteo") },
                { id: "smnAlerts", fetchedAt: alerts?.fetchedAt, failure: failureOf("smnAlerts") },
                { id: "provincialStreams", fetchedAt: streams?.fetchedAt, failure: failureOf("provincialStreams") },
              ]}
            />
          </div>
        </details>

        <Link href={HELP_HREF} className="flex min-h-11 items-center text-sm text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
          Cómo funciona Cota, paso a paso
        </Link>
      </div>
    </details>
  );
}
