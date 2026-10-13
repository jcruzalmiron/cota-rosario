import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/Logo";
import { riskColor } from "@/components/status";
import { riskLabel, type RiskLevel } from "@/lib/risk";
import { fechaHoraArgentina } from "@/lib/time";
import { RefreshButton } from "@/components/RefreshButton";

const VISTAS = [
  { href: "/", etiqueta: "Vecinos" },
  { href: "/operaciones", etiqueta: "Operaciones" },
  { href: "/predicciones", etiqueta: "Predicciones" },
] as const;

export const HELP_HREF = "/como-funciona";

interface TopBarProps {
  activo: string;
  nivel?: RiskLevel | null;
  actualizadoEn?: string;
}

export function TopBar({ activo, nivel, actualizadoEn }: TopBarProps) {
  const esAyuda = activo === HELP_HREF;
  return (
    <header className="glass-rail z-40 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-rule px-3 py-2 sm:gap-6 sm:px-5">
      <Link href="/" className="flex items-center gap-2.5 rounded-md py-0.5 pr-1 transition-opacity hover:opacity-80" aria-label="Cota, inicio">
        <LogoMark />
        <Wordmark />
      </Link>

      <nav aria-label="Vistas" className="flex min-w-0 justify-center">
        <div className="flex max-w-full overflow-x-auto rounded-full border border-rule bg-ground/60 p-0.5 [scrollbar-width:none]">
          {VISTAS.map((vista) => {
            const esActivo = vista.href === activo;
            return (
              <Link
                key={vista.href}
                href={vista.href}
                aria-current={esActivo ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition-colors sm:px-4 sm:text-[13px] ${
                  esActivo ? "bg-panel-soft text-ink shadow-[inset_0_0_0_1px_var(--rule)]" : "text-ink-soft hover:text-ink"
                }`}
              >
                {vista.etiqueta}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="flex items-center justify-end gap-2 sm:gap-3">
        {actualizadoEn ? <span className="hidden sm:inline-flex"><RefreshButton /></span> : null}
        {nivel !== undefined ? (
          <span
            className="flex items-center gap-2 rounded-full border border-rule px-2 py-1 sm:px-3"
            aria-label={`Estado: ${riskLabel(nivel)}${actualizadoEn ? `, consulta ${fechaHoraArgentina(actualizadoEn)}` : ""}`}
            title={actualizadoEn ? `Consulta ${fechaHoraArgentina(actualizadoEn)}, hora argentina. Revisá también la fecha de cada fuente.` : undefined}
          >
            <span className="relative flex size-2">
              <span className="relative inline-flex size-2 rounded-full" style={{ background: riskColor(nivel) }} aria-hidden="true" />
            </span>
            <span className="hidden text-[13px] text-ink lg:inline">{riskLabel(nivel)}</span>
            {actualizadoEn ? <span className="readout hidden text-xs text-ink-soft xl:inline">{fechaHoraArgentina(actualizadoEn)}</span> : null}
          </span>
        ) : null}
        <Link
          href={HELP_HREF}
          aria-current={esAyuda ? "page" : undefined}
          aria-label="Cómo funciona Cota"
          title="Cómo funciona"
          className={`flex size-8 items-center justify-center rounded-full border text-sm transition-colors ${
            esAyuda ? "border-ink bg-panel-soft text-ink" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
          }`}
        >
          ?
        </Link>
      </div>
    </header>
  );
}
