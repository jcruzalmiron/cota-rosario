import type { RainSnapshot } from "@/lib/rain";

const HOURS_SHOWN = 48;
const MIN_SCALE_MM = 4;
const TICK_EVERY = 6;

interface RainStripProps {
  lluvia: RainSnapshot;
}

export function RainStrip({ lluvia }: RainStripProps) {
  const horas = lluvia.horas.slice(0, HOURS_SHOWN);
  const maximo = Math.max(MIN_SCALE_MM, ...horas.map((hora) => hora.milimetros));
  const pico = lluvia.picoVentana;
  const seco = horas.every((hora) => hora.milimetros === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="readout text-3xl font-medium text-ink">{lluvia.acumulado24h.toFixed(1)}</span>
        <span className="text-sm text-ink-soft">mm en 24 h</span>
        {pico ? (
          <span className="meta ml-auto">
            pico {pico.milimetros.toFixed(1)} mm/2 h
          </span>
        ) : null}
      </div>

      {seco ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-rule bg-panel-soft">
          <p className="text-sm text-ink-soft">Sin lluvia pronosticada en las próximas 48 horas</p>
        </div>
      ) : (
      <div className="flex h-24 items-end gap-px" role="img" aria-label={`Precipitación pronosticada, máximo ${maximo.toFixed(1)} milímetros por hora`}>
        {horas.map((hora) => {
          const altura = Math.max(2, (hora.milimetros / maximo) * 100);
          const vacia = hora.milimetros === 0;
          return (
            <div
              key={hora.hora}
              className={`flex-1 rounded-t-sm ${vacia ? "bg-rule" : "bg-water-deep"}`}
              style={{ height: `${altura}%`, opacity: vacia ? 0.55 : hora.probabilidad === null ? 0.7 : Math.max(0.5, hora.probabilidad / 100) }}
              title={`${hora.hora.slice(5, 16).replace("T", " ")} · ${hora.milimetros.toFixed(1)} mm · ${hora.probabilidad === null ? "probabilidad no disponible" : `${hora.probabilidad}%`}`}
            />
          );
        })}
      </div>
      )}

      <div className="flex justify-between">
        {horas
          .filter((_, index) => index % TICK_EVERY === 0)
          .map((hora) => (
            <span key={hora.hora} className="readout text-[10px] text-ink-faint">
              {hora.hora.slice(11, 16)}
            </span>
          ))}
      </div>

      <p className="text-xs leading-relaxed text-ink-soft">
        La barra marca milímetros por hora y su opacidad representa la probabilidad cuando está disponible. La demo compara el pico de dos horas de las próximas 48 con umbrales orientativos; no representa el drenaje de cada cuadra.
      </p>
    </div>
  );
}
