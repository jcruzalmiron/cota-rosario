/**
 * B3 · Motor de plantillas de informe. Puro y determinístico: mismos valores →
 * mismo texto y mismo checksum. La plantilla real para Fiscalía no está relevada;
 * la incluida es PROVISORIA (estado `pendiente_validacion`) y bloquea la versión final.
 */
import { createHash } from "node:crypto";

export type FieldType = "texto" | "fecha_hora" | "lista" | "opcion";

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  allowUnknown?: boolean;
  question: string;
  options?: string[];
}

export interface TemplateSection {
  key: string;
  title: string;
  fields: TemplateField[];
}

export interface TemplateSchema {
  title: string;
  sections: TemplateSection[];
  /** Reglas de consistencia: `a` debe ser anterior o igual a `b`. */
  order?: { a: string; b: string; message: string }[];
}

export type FieldSource = "operador" | "movil" | "registro";

export interface FieldValue {
  value?: string | string[];
  unknownReason?: string;
  source: FieldSource;
  evidence?: string;
}

export type Values = Record<string, FieldValue>;

export const allFields = (s: TemplateSchema) => s.sections.flatMap((x) => x.fields);

const filled = (v: FieldValue | undefined) =>
  !!v && (Array.isArray(v.value) ? v.value.length > 0 : !!(v.value ?? "").toString().trim());

export function missingFields(schema: TemplateSchema, values: Values): TemplateField[] {
  return allFields(schema).filter((f) => {
    if (!f.required) return false;
    const v = values[f.key];
    if (filled(v)) return false;
    return !(f.allowUnknown && v?.unknownReason?.trim());
  });
}

export function contradictions(schema: TemplateSchema, values: Values): { fields: string[]; message: string }[] {
  const out: { fields: string[]; message: string }[] = [];
  for (const rule of schema.order ?? []) {
    const a = values[rule.a]?.value;
    const b = values[rule.b]?.value;
    if (typeof a === "string" && typeof b === "string") {
      const ta = Date.parse(a);
      const tb = Date.parse(b);
      if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta > tb) out.push({ fields: [rule.a, rule.b], message: rule.message });
    }
  }
  for (const f of allFields(schema)) {
    const v = values[f.key];
    if (f.type === "fecha_hora" && typeof v?.value === "string" && v.value && Number.isNaN(Date.parse(v.value))) {
      out.push({ fields: [f.key], message: `${f.label}: fecha u hora no reconocible.` });
    }
    if (f.type === "opcion" && typeof v?.value === "string" && v.value && f.options && !f.options.includes(v.value)) {
      out.push({ fields: [f.key], message: `${f.label}: valor fuera de las opciones de la plantilla.` });
    }
  }
  return out;
}

/** Preguntas en lenguaje claro sólo para faltantes aplicables. */
export function questionsFor(schema: TemplateSchema, values: Values) {
  return missingFields(schema, values).map((f) => ({
    field: f.key,
    question: f.question,
    canMarkUnknown: !!f.allowUnknown,
    options: f.options,
    list: f.type === "lista",
  }));
}

const fmtLocal = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short",
  }).format(d);
};

export interface RenderMeta {
  templateKind: string;
  templateVersion: number;
  templateStatus: string;
  revisionNo: number;
  final: boolean;
}

/** Renderizador determinístico. El texto no depende de la IA, sólo de valores confirmados. */
export function renderReport(schema: TemplateSchema, values: Values, meta: RenderMeta): { text: string; checksum: string } {
  const lines: string[] = [];
  if (!meta.final) lines.push("*** BORRADOR — NO VÁLIDO PARA PRESENTACIÓN ***", "");
  lines.push(schema.title.toUpperCase(), "");
  for (const section of schema.sections) {
    lines.push(section.title.toUpperCase());
    for (const f of section.fields) {
      const v = values[f.key];
      let shown: string;
      if (filled(v)) {
        shown = Array.isArray(v!.value) ? v!.value.map((x) => `  - ${x}`).join("\n") : f.type === "fecha_hora" ? fmtLocal(v!.value as string) : String(v!.value);
        if (Array.isArray(v!.value)) shown = `\n${shown}`;
      } else if (v?.unknownReason) {
        shown = `DESCONOCIDO (${v.unknownReason})`;
      } else {
        shown = f.required ? "[FALTA]" : "—";
      }
      lines.push(`${f.label}: ${shown}`);
    }
    lines.push("");
  }
  lines.push(`Plantilla ${meta.templateKind} v${meta.templateVersion} (${meta.templateStatus}) · revisión ${meta.revisionNo}`);
  const body = lines.join("\n");
  const checksum = createHash("sha256").update(body).digest("hex");
  return { text: `${body}\nChecksum: ${checksum.slice(0, 16)}`, checksum };
}

/** Plantilla provisoria para arrancar el piloto. Reemplazar por la vigente del circuito real. */
export const PROVISIONAL_TEMPLATE: { kind: string; version: number; schema: TemplateSchema } = {
  kind: "informe_intervencion_fiscalia",
  version: 1,
  schema: {
    title: "Informe de intervención (plantilla provisoria)",
    sections: [
      {
        key: "datos", title: "Datos de la intervención", fields: [
          { key: "tipo", label: "Tipo de intervención", type: "opcion", required: true, question: "¿Qué tipo de intervención fue?",
            options: ["incendio_estructural", "incendio_vehicular", "incendio_pastizal", "rescate", "materiales_peligrosos", "accidente_transito", "otro"] },
          { key: "lugar", label: "Lugar", type: "texto", required: true, question: "¿Dónde fue? Dirección, intersección o referencia." },
          { key: "hora_aviso", label: "Hora de aviso", type: "fecha_hora", required: true, question: "¿A qué hora entró el aviso?" },
          { key: "hora_salida", label: "Hora de salida", type: "fecha_hora", required: true, question: "¿A qué hora salió el primer móvil?" },
          { key: "hora_arribo", label: "Hora de arribo", type: "fecha_hora", required: true, question: "¿A qué hora llegó el primer móvil?" },
          { key: "hora_finalizacion", label: "Hora de finalización", type: "fecha_hora", required: true, question: "¿A qué hora se dio por finalizada la intervención?" },
          { key: "moviles", label: "Móviles intervinientes", type: "lista", required: true, question: "¿Qué móviles intervinieron?" },
          { key: "jefe_a_cargo", label: "Jefe a cargo", type: "texto", required: true, question: "¿Quién estuvo a cargo de la intervención?" },
        ],
      },
      {
        key: "hechos", title: "Hechos", fields: [
          { key: "panorama_arribo", label: "Panorama al arribo", type: "texto", required: true, question: "¿Qué encontraron al llegar?" },
          { key: "acciones", label: "Acciones realizadas", type: "lista", required: true, question: "¿Qué acciones realizaron, en orden?" },
          { key: "victimas", label: "Personas lesionadas o asistidas", type: "texto", required: true, allowUnknown: true, question: "¿Hubo personas lesionadas o asistidas? Si no se sabe, indicá por qué." },
          { key: "danos", label: "Daños observados", type: "texto", required: true, allowUnknown: true, question: "¿Qué daños se observaron?" },
          { key: "causa_probable", label: "Causa probable", type: "texto", required: false, allowUnknown: true, question: "¿Se observó una causa probable? (Sólo lo observado, sin conclusiones periciales.)" },
          { key: "organismos", label: "Otros organismos presentes", type: "lista", required: false, question: "¿Participaron otros organismos (policía, EPE, gas, SIES)?" },
        ],
      },
    ],
    order: [
      { a: "hora_aviso", b: "hora_salida", message: "La salida figura antes del aviso." },
      { a: "hora_salida", b: "hora_arribo", message: "El arribo figura antes de la salida." },
      { a: "hora_arribo", b: "hora_finalizacion", message: "La finalización figura antes del arribo." },
    ],
  },
};
