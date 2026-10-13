import type { FloodingForecast } from "@/lib/predicciones";

const PERCENT = 100;

interface FloodingOutlookProps {
  anegamientos: FloodingForecast;
}

function titulo(texto: string): string {
  return texto.charAt(0) + texto.slice(1).toLowerCase();
}

export function FloodingOutlook({ anegamientos }: FloodingOutlookProps) {
  const maximo = Math.max(...anegamientos.porDistrito.map((entry) => entry.esperados), 0.1);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span className="readout text-5xl font-medium text-ink">{anegamientos.esperadosCiudad.toFixed(1)}</span>
        <span className="text-sm leading-tight text-ink-soft">
          casos ilustrativos del modelo
          <br />
          adaptado a {anegamientos.ventanaDias} días
        </span>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        Con <span className="readout text-ink">{anegamientos.lluvia.total} mm</span> pronosticados y un pico de{" "}
        <span className="readout text-ink">{anegamientos.lluvia.max2h} mm</span> en 2 horas. Estimación propia a partir del historial de Defensa Civil y
        la lluvia de cada mes. Error absoluto medio de validación mensual: {anegamientos.modelo.validacionCruzada.maeModelo} casos. Este error no es un intervalo de la semana.
      </p>
      <ul className="flex flex-col gap-2">
        {anegamientos.porDistrito.map((entry) => (
          <li key={entry.distrito} className="flex items-center gap-3 text-xs">
            <span className="w-20 shrink-0 text-ink-soft">{titulo(entry.distrito)}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-rule-soft">
              <span className="block h-full rounded-full bg-alerta/80" style={{ width: `${(entry.esperados / maximo) * PERCENT}%` }} />
            </span>
            <span className="readout w-10 shrink-0 text-right text-ink">{entry.esperados.toFixed(1)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-atencion">Reparto por participación histórica de cada distrito. La escala diaria/semanal y sus probabilidades no están validadas; se muestran para explorar el método.</p>
    </div>
  );
}
