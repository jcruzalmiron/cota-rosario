/**
 * O2 · Reglas de ingreso bloqueantes. Se evalúan en servidor en la transición
 * que jefatura defina como "avance operativo" (por defecto: despacho).
 * El borrador incompleto siempre se guarda; lo que se bloquea es el avance.
 */
export interface IntakeDraft {
  callerName?: string | null;
  anonymous?: boolean;
  phone?: string | null;
  locationText?: string | null;
  category?: string | null;
  description?: string | null;
}

export type IntakeField = "denunciante" | "telefono" | "lugar";
export interface FieldIssue {
  field: IntakeField;
  message: string;
}

export interface IntakeRules {
  version: string;
  /** Campos exigidos antes del avance operativo. */
  required: IntakeField[];
}

/** Regla inicial propuesta en el relevamiento. Versionada para auditar cambios. */
export const DEFAULT_INTAKE_RULES: IntakeRules = {
  version: "2026-11-04.v1-propuesta",
  required: ["denunciante", "telefono", "lugar"],
};

/** Normaliza un teléfono argentino a dígitos; devuelve null si no es utilizable. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  const bare = digits.replace(/^\+?54/, "").replace(/^0/, "");
  // Fijo o móvil con código de área (10 dígitos, con o sin 9/15) o abreviado local (6-8).
  const withoutMobilePrefix = bare.replace(/^9(?=\d{10}$)/, "");
  if (/^\d{10}$/.test(withoutMobilePrefix)) return withoutMobilePrefix;
  if (/^\d{6,8}$/.test(bare)) return bare; // número local sin característica
  if (/^\d{2,4}15\d{6,8}$/.test(bare) && bare.length <= 12) return bare;
  return null;
}

export type LocationKind = "direccion" | "interseccion" | "referencia";

/**
 * Acepta dirección con altura, intersección ("Mitre y Córdoba", "Oroño esq. 3 de Febrero")
 * o referencia utilizable (≥ 12 caracteres con al menos dos palabras). Devuelve el tipo.
 */
export function classifyLocation(raw: string | null | undefined): LocationKind | null {
  const text = (raw ?? "").trim().replace(/\s+/g, " ");
  if (text.length < 4) return null;
  if (/\b(y|e|esq\.?|esquina|entre)\b/i.test(text) && text.split(" ").length >= 3) return "interseccion";
  if (/[a-záéíóúñ.]{3,}.*\b\d{1,5}\b/i.test(text)) return "direccion";
  if (text.length >= 12 && text.split(" ").length >= 2) return "referencia";
  return null;
}

export function validateIntake(draft: IntakeDraft, rules: IntakeRules = DEFAULT_INTAKE_RULES): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const need = (f: IntakeField) => rules.required.includes(f);

  if (need("denunciante") && !draft.anonymous && !(draft.callerName ?? "").trim()) {
    issues.push({
      field: "denunciante",
      message: "Falta el nombre de quien llama. Si no lo da, registrá una excepción autorizada.",
    });
  }
  if (need("telefono")) {
    if (!(draft.phone ?? "").trim()) {
      issues.push({ field: "telefono", message: "Falta un teléfono de contacto." });
    } else if (!normalizePhone(draft.phone)) {
      issues.push({ field: "telefono", message: "El teléfono no tiene un formato utilizable." });
    }
  }
  if (need("lugar") && !classifyLocation(draft.locationText)) {
    issues.push({
      field: "lugar",
      message: "Indicá dirección con altura, intersección o una referencia utilizable.",
    });
  }
  return issues;
}
