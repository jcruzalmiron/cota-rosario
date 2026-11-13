import type { ReportStatus } from "@/lib/reportTypes";

/** Color de cada estado en la cola y en el mapa de operaciones. */
export const STATUS_COLOR: Record<ReportStatus, string> = {
  new: "#dc5449",
  in_progress: "#d2a13a",
  resolved: "#5c9e7a",
  dismissed: "#929aa6",
};

export interface ClaimAction {
  to: ReportStatus;
  label: string;
  /** Se aplica con un toque, sin abrir el formulario de notas. */
  quick?: boolean;
  tone: "primary" | "plain";
}

/** Acciones por estado, en el orden en que se ofrecen. Coinciden con REPORT_TRANSITIONS. */
export const CLAIM_ACTIONS: Record<ReportStatus, readonly ClaimAction[]> = {
  new: [
    { to: "in_progress", label: "Tomar", quick: true, tone: "primary" },
    { to: "resolved", label: "Resolver", tone: "plain" },
    { to: "dismissed", label: "Descartar", tone: "plain" },
  ],
  in_progress: [
    { to: "resolved", label: "Resolver", tone: "primary" },
    { to: "dismissed", label: "Descartar", tone: "plain" },
    { to: "new", label: "Soltar", quick: true, tone: "plain" },
  ],
  resolved: [{ to: "in_progress", label: "Reabrir", tone: "plain" }],
  dismissed: [{ to: "new", label: "Reabrir", tone: "plain" }],
};

export const ACTION_TITLE: Record<ReportStatus, string> = {
  new: "Volver a nuevos",
  in_progress: "Pasar a en atención",
  resolved: "Marcar como resuelto",
  dismissed: "Descartar el reclamo",
};
