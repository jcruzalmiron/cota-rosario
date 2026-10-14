import type { RainForecast } from "@/lib/predicciones";

const PERCENT = 100;
const DAYS_PER_MONTH = 30.4;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

interface RainOutlookProps {
  lluvia: RainForecast;
}

function fmtDia(fecha: string): string {
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

function periodoRetorno(anios: number): string {
  if (anios < 1.05) {
    return "año";
  }
  return anios < 10 ? `${anios.toFixed(1)} años` : `${Math.round(anios)} años`;
}

export function RainOutlook({ lluvia }: RainOutlookProps) {
  const maximo = Math.max(...lluvia.dias.map((dia) => dia.milimetros), 1);
  const mesActual = MESES[lluvia.climatologia.mes - 1] ?? "";
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex items-end gap-1.5" aria-label="Lluvia diaria pronosticada">
        {lluvia.dias.map((dia) => (
          <li key={dia.fecha} className="flex flex-1 flex-col items-center gap-1">
            <span className="readout text-[10px] text-ink-soft">{dia.milimetros > 0 ? dia.milimetros.toFixed(0) : ""}</span>
            <span className="flex h-16 w-full items-end overflow-hidden rounded-sm bg-rule-soft">
              <span className="block w-full rounded-sm bg-water/70" style={{ height: `${(dia.milimetros / maximo) * PERCENT}%` }} />
            </span>
            <span className="readout text-[10px] text-ink-faint">{fmtDia(dia.fecha)}</span>
            <span className="readout text-[10px] text-ink-faint">{dia.probabilidad === null ? "—" : `${dia.probabilidad} %`}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-ink-soft">
        {lluvia.maximoDia.milimetros > 0 ? (
          <>
            El día más cargado, {fmtDia(lluvia.maximoDia.fecha)} con <span className="readout text-ink">{lluvia.maximoDia.milimetros} mm</span>: una
            lluvia así, como máximo del año, se da en promedio <span className="readout text-ink">cada {periodoRetorno(lluvia.periodoRetornoAnios)}</span>;
            en {lluvia.rangoHistorico.mayores} de los últimos {lluvia.rangoHistorico.total} años hubo un día igual o mayor.
          </>
        ) : (
          <>No se pronostica lluvia en la semana.</>
        )}
      </p>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 border-t border-rule-soft pt-4 text-xs sm:grid-cols-6">
        {lluvia.cuantiles.map((cuantil) => (
          <div key={cuantil.periodoAnios} className="flex flex-col gap-0.5">
            <dt className="meta">cada {cuantil.periodoAnios} años</dt>
            <dd className="readout text-ink">{cuantil.mm.toFixed(0)} mm</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-ink-soft">
        La referencia histórica de {mesActual} en el archivo de Open-Meteo es de {lluvia.climatologia.mediaMm} mm; un día de más de {lluvia.climatologia.umbralMm} mm pasa{" "}
        {(lluvia.climatologia.probabilidadDia * DAYS_PER_MONTH).toFixed(1)} veces por mes en promedio.
      </p>
    </div>
  );
}
