/**
 * Extracción por reglas: línea base determinística para bitácora (B1) e informes (B3).
 * Cada candidato conserva el fragmento de origen. Un adaptador de IA puede sumarse
 * detrás de `FieldExtractor`, pero siempre devuelve candidatos con evidencia que
 * una persona confirma; nunca completa campos en silencio.
 */
export interface Evidence {
  source: "texto" | "audio";
  ref: string;            // id de la entrada o del audio
  start?: number;         // segundos, para audio
  end?: number;
  excerpt: string;
}

export interface Candidate<T = string> {
  value: T;
  evidence: Evidence;
}

export interface FieldExtractor {
  readonly name: string;
  extract(text: string, ref: Evidence): Promise<Record<string, Candidate>>;
}

const TIME_RE = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\s*(?:hs?\.?|horas)?\b/i;
const UNIT_RE = /\b(?:m[oó]vil|unidad|autobomba|cisterna|dotaci[oó]n)\s*(?:n[°ºo.]*\s*)?([A-Z]?-?\d{1,3})\b/i;
const W = String.raw`(?:[A-ZÁÉÍÓÚÑ0-9][\wáéíóúñ.]*|de|del|la|las|los)`;
const PLACE_RE = new RegExp(
  String.raw`\b(?:en|sobre|calle|av(?:enida)?\.?)\s+((?:${W}\s){0,5}\d{1,5}\b|(?:${W}\s?){1,4}\s(?:y|esq\.?)\s(?:${W}\s?){1,4})`,
);

const ACTIONS: [RegExp, string][] = [
  [/\b(sal(e|i[oó]|ida|imos)|despach)/i, "salida"],
  [/\b(lleg(a|[oó]|ada|amos)|arrib)/i, "arribo"],
  [/\b(extingu|sofoc|apag)/i, "extincion"],
  [/\b(rescat|evacu)/i, "rescate_evacuacion"],
  [/\b(ventil)/i, "ventilacion"],
  [/\b(corte de (luz|energ[ií]a|gas)|cort[oó] (la )?(luz|energ[ií]a|gas))/i, "corte_servicio"],
  [/\b(EPE|COEM|Litoral Gas|gas)\b/, "coordinacion_externa"],
  [/\b(retir|regres|retorn|vuelve|volvi|finaliz)/i, "retorno"],
];

/** Hora local de Rosario (UTC-3, sin horario de verano vigente) aplicada a la fecha base. */
export function toInstant(base: Date, hh: number, mm: number): Date {
  const localDay = new Date(base.getTime() - 3 * 3_600_000); // día calendario en Rosario
  return new Date(Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate(), hh + 3, mm));
}

export function extractTime(text: string): { hh: number; mm: number; raw: string } | null {
  const m = text.match(TIME_RE);
  return m ? { hh: Number(m[1]), mm: Number(m[2]), raw: m[0] } : null;
}

export function extractUnit(text: string): string | null {
  const m = text.match(UNIT_RE);
  return m ? m[1].toUpperCase() : null;
}

/** Todas las unidades mencionadas en el fragmento ("móvil 12 y unidad 7"). */
export function extractUnits(text: string): string[] {
  const re = new RegExp(UNIT_RE.source, "gi");
  return [...text.matchAll(re)].map((m) => m[1].toUpperCase());
}

export function extractPlace(text: string): string | null {
  const m = text.match(PLACE_RE);
  return m ? m[1].trim() : null;
}

export function extractAction(text: string): string | null {
  for (const [re, action] of ACTIONS) if (re.test(text)) return action;
  return null;
}

/** Divide un relato en oraciones o renglones para ubicar evidencia por evento. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}
