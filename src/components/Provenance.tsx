import type { SourceFailure } from "@/lib/estado";
import { SOURCES } from "@/lib/sources";
import { fechaHoraArgentina, horaArgentina } from "@/lib/time";

interface ProvenanceProps {
  sellos: { id: keyof typeof SOURCES; consultadoEn?: string; falla?: SourceFailure }[];
}

export function Provenance({ sellos }: ProvenanceProps) {
  const sello = (id: string) => sellos.find((entry) => entry.id === id);

  return (
    <div className="flex flex-col divide-y divide-rule-soft">
      {Object.values(SOURCES).map((fuente) => {
        const entry = sello(fuente.id);
        const consultado = entry?.consultadoEn;
        const falla = entry?.falla;
        return (
          <article key={fuente.id} className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-medium text-ink">{fuente.organismo}</h3>
              {falla ? (
                <span className="readout text-[11px] text-alerta">sin respuesta {horaArgentina(falla.en)}</span>
              ) : consultado ? (
                <span className="readout text-[11px] text-ink-faint">consultado {fechaHoraArgentina(consultado)}</span>
              ) : null}
            </div>
            <p className="text-xs text-ink-soft">{fuente.descripcion}</p>
            <a
              href={fuente.endpoint}
              target="_blank"
              rel="noopener noreferrer"
              className="readout break-all text-[11px] text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
            >
              {fuente.endpoint}
            </a>
            <a href={fuente.portal} target="_blank" rel="noopener noreferrer" className="text-xs text-water underline underline-offset-4">Publicación y contexto de la fuente</a>
            <p className="text-xs text-ink-soft">
              {fuente.modelo ? <span className="text-atencion">modelo, no dato oficial · </span> : null}
              {fuente.licencia}
            </p>
          </article>
        );
      })}
    </div>
  );
}
