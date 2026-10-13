import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BottomSheet } from "@/components/BottomSheet";
import { TopBar } from "@/components/TopBar";
import { DemoNotice } from "@/components/DemoNotice";
import type { RiskLevel } from "@/lib/risk";

interface AppShellProps {
  activo: string;
  nivel: RiskLevel | null;
  actualizadoEn: string;
  rail: ReactNode;
  lienzo: ReactNode;
  lienzoInferior?: ReactNode;
}

export function AppShell({ activo, nivel, actualizadoEn, rail, lienzo, lienzoInferior }: AppShellProps) {
  return (
    <div className="flex h-full flex-col">
      <AutoRefresh />
      <TopBar activo={activo} nivel={nivel} actualizadoEn={actualizadoEn} />
      <DemoNotice />

      <div className="relative flex min-h-0 flex-1 lg:flex-row">
        <BottomSheet>
          {rail}
          {lienzoInferior ? <div className="hairline px-5 py-6 lg:hidden">{lienzoInferior}</div> : null}
        </BottomSheet>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">{lienzo}</div>
          {lienzoInferior ? (
            <div className="glass-rail hidden max-h-[45%] shrink-0 overflow-y-auto border-t border-rule px-5 py-5 sm:px-6 lg:block">
              {lienzoInferior}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
