import Link from "next/link";
import { Workspace } from "@/components/shell/Workspace";
import { HELP_HREF } from "@/lib/navigation";
import { tipsFor, statusTitle } from "@/lib/residents";
import { QuickActions } from "@/components/residents/QuickActions";
import { Docs, DocsSection } from "@/components/Docs";
import { FloodMap } from "@/components/FloodMap";
import { Provenance } from "@/components/Provenance";
import { RainStrip } from "@/components/RainStrip";
import { RiverGauge } from "@/components/RiverGauge";
import { SourceDown } from "@/components/SourceDown";
import { WeatherLine } from "@/components/WeatherBadge";
import { riskColor } from "@/components/status";
import { DataStatus } from "@/components/DataStatus";
import { loadStatus } from "@/lib/status";
import { riskLabel } from "@/lib/risk";
import { sourceSignals } from "@/lib/placeSignals";

export const dynamic = "force-dynamic";

export default async function ResidentsPage() {
  const status = await loadStatus();
  const { risk, river, rain, weather, failures } = status;
  const tips = tipsFor(risk);
  const failureOf = (source: string) => failures.find((failure) => failure.source === source);
  const title = statusTitle(risk.level);

  return (
    <Workspace
    canvas={<FloodMap zones={risk.zones} signals={sourceSignals(risk, river, rain)} searcher reports report />}
    rail={
      <div className="flex flex-col">
        <WeatherLine weather={weather} />
        <section className="px-5 py-6 sm:px-5">
          <p className="meta">Rosario · ahora{risk.incomplete ? " · evaluación parcial" : ""}</p>
          <h1 className="mt-2 flex items-start gap-3 text-2xl font-semibold leading-tight tracking-tight text-ink">
            <span
              className="mt-2.5 size-2.5 shrink-0 rounded-full"
              style={{ background: riskColor(risk.level) }}
              aria-hidden="true"
            />
            <span>{title}</span>
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{risk.reason}</p>
          <QuickActions />
        </section>

        <DataStatus status={status} />

        <section className="hairline flex flex-col">
          {risk.factors.map((factor) => (
            <div key={factor.id} className="hairline flex flex-col gap-1.5 px-5 py-4 first:border-t-0 sm:px-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm text-ink">{factor.title}</h2>
                <span className="flex items-center gap-1.5 text-xs">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: riskColor(factor.level) }}
                    aria-hidden="true"
                  />
                  <span className="text-ink-soft">{factor.available ? riskLabel(factor.level) : "sin evaluación"}</span>
                </span>
              </div>
              <p className="readout text-sm text-ink">{factor.measured}</p>
              <p className="text-xs leading-relaxed text-ink-soft">{factor.detail}</p>
            </div>
          ))}
        </section>

        <section className="hairline px-5 py-6 sm:px-5">
          <h2 className="meta">El río</h2>
          <div className="mt-4">{river ? <RiverGauge river={river} /> : <SourceDown failure={failureOf("ina")!} />}</div>
        </section>

        <section className="hairline px-5 py-6 sm:px-5">
          <h2 className="meta">La lluvia</h2>
          <div className="mt-4">{rain ? <RainStrip rain={rain} /> : <SourceDown failure={failureOf("openMeteo")!} />}</div>
        </section>

        <section className="hairline px-5 py-6 sm:px-5">
          <h2 className="meta">Qué conviene hacer</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {tips.map((tip) => (
              <li key={tip} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                <span className="mt-2 h-px w-3 shrink-0 bg-ink-faint" aria-hidden="true" />
                {tip}
              </li>
            ))}
          </ul>
        </section>

        <Docs>
          <DocsSection title="Cómo se decide el nivel">
            <ul className="flex flex-col gap-2 text-xs leading-relaxed text-ink-soft">
              {risk.factors.map((factor) => (
                <li key={factor.id}>
                  <span className="text-ink">{factor.title}:</span> {factor.threshold} · {factor.official ? "umbral oficial" : "umbral estimado por este panel"}
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-ink-soft">
              El nivel general es el peor de los dos factores. Cada zona oficial del Ludueña y el Saladillo tiene un grado de 0 a 5: la base es el
              pronóstico regional de lluvia concentrada; suma un paso si el mapa municipal de riesgo climático la marca más sensible, otro si el
              Paraná está en alerta mientras llueve (supuesto a validar) y los reportes vecinales activos dentro de la zona la suben. El Paraná solo
              no pinta los arroyos. Sin pronóstico ni reportes, las zonas quedan en gris y conservan su exposición. Criterios provisorios, sin
              calibrar.
            </p>
          </DocsSection>
          <DocsSection title="De dónde sale cada número">
            <p className="text-xs leading-relaxed text-ink-soft">Las lecturas publicadas, los pronósticos y los mapas tienen su propia fecha y cobertura. Consultá el origen y el método de cada dato.</p>
            <Provenance
              stamps={[
                { id: "ina", fetchedAt: river?.fetchedAt, failure: failureOf("ina") },
                { id: "openMeteo", fetchedAt: rain?.fetchedAt, failure: failureOf("openMeteo") },
              ]}
            />
            <a href="/api/status" className="readout inline-block text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
              GET /api/status · el cruce completo en JSON
            </a>
          </DocsSection>
        </Docs>

        <p className="hairline px-5 py-6 text-xs leading-relaxed text-ink-faint sm:px-5">
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
