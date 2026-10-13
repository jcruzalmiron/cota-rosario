import { RefreshButton } from "@/components/RefreshButton";
import type { Estado } from "@/lib/estado";
import { fechaHoraArgentina } from "@/lib/time";

export function DataStatus({ estado }: { estado: Estado }) {
  const rows = [
    { name: "Paraná · INA", kind: "Lectura de estación", at: estado.rio?.estacion.fecha },
    { name: "Lluvia · Open-Meteo", kind: "Pronóstico modelado · 48 h", at: estado.lluvia?.consultadoEn },
    { name: "Caudal · GloFAS", kind: "Modelo global · 7 días", at: estado.caudal?.consultadoEn },
    { name: "Clima · Open-Meteo", kind: "Condiciones modeladas", at: estado.clima?.medidoEn },
  ];
  return (
    <details className="border-t border-rule px-5 py-4 sm:px-6">
      <summary className="cursor-pointer text-sm text-ink">Datos de esta consulta · {rows.filter((row) => row.at).length}/{rows.length} disponibles</summary>
      <div className="mt-3 sm:hidden"><RefreshButton /></div>
      <ul className="mt-3 flex flex-col gap-3 text-xs">
        {rows.map((row) => <li key={row.name} className="flex items-start justify-between gap-3"><span className="text-ink">{row.name}<span className="mt-0.5 block text-ink-soft">{row.kind}</span></span><span className={row.at ? "readout text-ink-soft" : "text-atencion"}>{row.at ? fechaHoraArgentina(row.at) : "No disponible"}</span></li>)}
      </ul>
      {estado.fallas.length ? <ul className="mt-3 space-y-2 text-xs text-atencion">{estado.fallas.map((failure, i) => <li key={`${failure.fuente}-${i}`}>{failure.mensaje}</li>)}</ul> : null}
      <p className="mt-3 text-xs text-ink-soft">Las respuestas reales se reutilizan hasta 60 segundos y conservan su fecha original. Actualizar vuelve a consultar. Disponible indica controles de formato y vigencia; la precisión depende de la fuente. Las capas cartográficas son instantáneas fijas.</p>
    </details>
  );
}
