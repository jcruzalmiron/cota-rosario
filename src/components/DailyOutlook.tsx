import type { DailyForecast } from "@/lib/predicciones";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const PERCENT = 100;

interface DailyOutlookProps {
  dias: DailyForecast[];
  alerta: number | null;
}

function etiquetaDia(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()]} ${dia}/${mes}`;
}

export function DailyOutlook({ dias, alerta }: DailyOutlookProps) {
  const maxLluvia = Math.max(...dias.map((dia) => dia.lluviaMm), 1);
  const maxCasos = Math.max(...dias.map((dia) => dia.anegamientosEsperados ?? 0), 0.1);
  return (
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead>
        <tr className="meta text-left">
          <th className="pb-2 font-normal">Día</th>
          <th className="pb-2 font-normal">Lluvia</th>
          <th className="pb-2 font-normal">Reparto ilustrativo</th>
          <th className="pb-2 font-normal">Río estimado</th>
        </tr>
      </thead>
      <tbody>
        {dias.map((dia) => (
          <tr key={dia.fecha} className="border-t border-rule-soft">
            <td className="py-2 pr-3 text-ink">{etiquetaDia(dia.fecha)}</td>
            <td className="py-2 pr-3">
              <div className="flex items-center gap-2">
                <span className="h-1 w-24 overflow-hidden rounded-full bg-rule-soft">
                  <span className="block h-full rounded-full bg-water/70" style={{ width: `${(dia.lluviaMm / maxLluvia) * PERCENT}%` }} />
                </span>
                <span className="readout text-ink">{dia.lluviaMm.toFixed(0)} mm</span>
                <span className="readout text-ink-faint">{dia.probabilidad === null ? "sin probabilidad" : `${dia.probabilidad} %`}</span>
              </div>
            </td>
            <td className="py-2 pr-3">
              <div className="flex items-center gap-2">
                <span className="h-1 w-24 overflow-hidden rounded-full bg-rule-soft">
                  <span className="block h-full rounded-full bg-alerta/80" style={{ width: `${((dia.anegamientosEsperados ?? 0) / maxCasos) * PERCENT}%` }} />
                </span>
                <span className="readout text-ink">{dia.anegamientosEsperados === null ? "—" : dia.anegamientosEsperados.toFixed(1)}</span>
              </div>
            </td>
            <td className="py-2">
              {dia.rioMetros === null ? (
                <span className="text-ink-faint">—</span>
              ) : (
                <span className="readout text-ink">
                  {dia.rioMetros.toFixed(2)} m
                  {alerta !== null ? <span className="text-ink-faint"> · {(alerta - dia.rioMetros).toFixed(2)} a alerta</span> : null}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
