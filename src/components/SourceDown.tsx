import type { SourceFailure } from "@/lib/estado";
import { horaArgentina } from "@/lib/time";

export function SourceDown({ falla }: { falla?: SourceFailure }) {
  return <div className="border-l-2 border-atencion pl-3 text-xs leading-relaxed text-ink-soft">
    <p className="text-atencion">Este bloque no tiene datos utilizables{falla ? ` · consulta ${horaArgentina(falla.en)}` : ""}.</p>
    <p className="mt-1">Puede faltar información o cobertura para el período solicitado. Actualizar la vista vuelve a consultar.</p>
    {falla ? <details className="mt-2"><summary className="cursor-pointer">Detalle de la fuente</summary><p className="mt-1">{falla.mensaje}</p></details> : null}
  </div>;
}
