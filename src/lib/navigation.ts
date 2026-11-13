export type NavIcon = "map" | "zone" | "report" | "more" | "summary" | "river" | "rain" | "forecast" | "reports" | "claims" | "demand" | "simulator";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export const RESIDENTS_HOME = "/";
export const PANEL_HOME = "/operaciones";
export const HELP_HREF = "/como-funciona";
export const EMERGENCY_PHONE = "103";
export const REPORT_HREF = "/reportar";
export const CLAIMS_HREF = "/reclamos";
export const OPS_CLAIMS_HREF = "/operaciones/reclamos";
export const OPS_DEMAND_HREF = "/operaciones/demanda";

export const RESIDENTS_TABS: readonly NavItem[] = [
  { href: RESIDENTS_HOME, label: "Ahora", icon: "map" },
  { href: "/zona", label: "Mi zona", icon: "zone" },
  { href: REPORT_HREF, label: "Reportar", icon: "report" },
  { href: CLAIMS_HREF, label: "Reclamos", icon: "reports" },
  { href: "/mas", label: "Más", icon: "more" },
];

export const PANEL_SECTIONS: readonly NavItem[] = [
  { href: PANEL_HOME, label: "Resumen", icon: "summary" },
  { href: "/operaciones/rio", label: "Río", icon: "river" },
  { href: "/operaciones/lluvia", label: "Lluvia", icon: "rain" },
  { href: "/operaciones/pronostico", label: "Pronóstico", icon: "forecast" },
  { href: OPS_CLAIMS_HREF, label: "Reclamos", icon: "claims" },
  { href: OPS_DEMAND_HREF, label: "Demanda", icon: "demand" },
  { href: "/operaciones/simulador", label: "Simulador", icon: "simulator" },
];

export const LEGACY_REDIRECTS: readonly { source: string; destination: string; permanent: true }[] = [
  { source: "/predicciones", destination: "/operaciones/pronostico", permanent: true },
  { source: "/operaciones/reportes", destination: "/operaciones/reclamos", permanent: true },
  { source: "/api/estado", destination: "/api/status", permanent: true },
  { source: "/api/predicciones", destination: "/api/predictions", permanent: true },
  { source: "/api/recomendaciones", destination: "/api/recommendations", permanent: true },
  { source: "/api/reportes", destination: "/api/reports", permanent: true },
  { source: "/api/reportes/:id/confirmar", destination: "/api/reports/:id/confirm", permanent: true },
];

const SECTION_ROOTS = new Set([RESIDENTS_HOME, PANEL_HOME]);

export function isActive(item: NavItem, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (SECTION_ROOTS.has(item.href)) {
    return path === item.href;
  }
  return path === item.href || path.startsWith(`${item.href}/`);
}

export function activeItem(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return items.find((item) => isActive(item, pathname));
}
