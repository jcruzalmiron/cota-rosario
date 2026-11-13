import type { RiskAssessment, RiskLevel } from "@/lib/risk";
import { riskLabel } from "@/lib/risk";
import type { AlertLevel, AlertsSnapshot, StreamReading, StreamsSnapshot } from "@/lib/provincial";
import type { RainSnapshot } from "@/lib/rain";
import type { RiverSnapshot } from "@/lib/river";
import { ago } from "@/lib/claims";
import { addCalendarDays, argentinaDay, argentinaTime } from "@/lib/time";

export const ADVICE: Record<RiskLevel, string[]> = {
  normal: [
    "Los datos consultados no superan los umbrales orientativos. Revisá las condiciones de tu cuadra y las comunicaciones oficiales.",
    "Si vivís sobre zona marcada, revisá que la rejilla de tu frente no esté tapada.",
  ],
  watch: [
    "Sacá el auto de la vereda si vivís sobre una zona marcada.",
    "Revisá que las rejillas y los desagües de tu frente estén despejados.",
    "Evitá programar viajes por las avenidas que cruzan el Ludueña o el Saladillo en las próximas horas.",
  ],
  alert: [
    "No cruces calles anegadas ni en auto ni a pie: no se ve el cordón ni las bocas de tormenta abiertas.",
    "Levantá lo que tengas a nivel de piso en cocheras y patios.",
    "Si estás sobre zona marcada, tené documentación y medicación en algo impermeable.",
  ],
  critical: [
    "Seguí las indicaciones de Defensa Civil: 103.",
    "Cortá la luz del sector si el agua entra a la vivienda.",
    "No vuelvas a una zona anegada a buscar cosas hasta que baje.",
  ],
};

export const ADVICE_INCOMPLETE = [
  "La evaluación está incompleta: consultá las fuentes disponibles y las comunicaciones oficiales.",
  "Los aportes de vecinos son señales para verificar; su ausencia no descarta agua en la zona.",
];

/** Titular técnico que usa el panel de operaciones. La pantalla de vecinos usa `residentAnswer`. */
export function statusTitle(level: RiskLevel | null): string {
  if (level === null) {
    return "Faltan datos para una evaluación completa";
  }
  return level === "normal" ? "Sin señales elevadas en los datos consultados" : `Nivel ${riskLabel(level).toLowerCase()} en los datos consultados`;
}

export function tipsFor(risk: { level: RiskLevel | null; incomplete: boolean }): string[] {
  if (risk.level === null) {
    return [...ADVICE_INCOMPLETE];
  }
  return risk.incomplete ? [...ADVICE[risk.level], ADVICE_INCOMPLETE[0]] : [...ADVICE[risk.level]];
}

/*
 * Inicio de vecinos: una respuesta, por qué y qué hacer.
 * Regla de la casa: un dato que falta se nombra como faltante y nunca se lee como calma.
 */

export type AnswerTone = "calm" | "watch" | "alert" | "critical" | "unknown";
export type AnswerAction = "call" | "report" | "zone" | "claims";

export interface ResidentAnswer {
  tone: AnswerTone;
  headline: string;
  why: string;
  /** De una a tres acciones; la primera es la principal. */
  actions: AnswerAction[];
  tips: string[];
}

const LEVEL_RANK: Record<RiskLevel, number> = { normal: 0, watch: 1, alert: 2, critical: 3 };
const ALERT_LEVEL: Record<AlertLevel, RiskLevel> = { amarilla: "watch", naranja: "alert", roja: "critical" };
const TONE: Record<RiskLevel, AnswerTone> = { normal: "calm", watch: "watch", alert: "alert", critical: "critical" };

const HEADLINE: Record<AnswerTone, string> = {
  calm: "Hoy no hace falta que hagas nada",
  watch: "Hoy conviene que estés atento",
  alert: "Preparate: puede haber agua en la calle",
  critical: "Hay riesgo alto: cuidate y seguí a Defensa Civil",
  unknown: "Ahora no podemos decirte cómo está la situación",
};

const TIPS: Record<AnswerTone, string[]> = {
  calm: ["Si vivís en una zona baja, mirá que la rejilla de tu frente no esté tapada.", "Guardá tu casa en Mi zona para saber qué esperar cuando llueva."],
  watch: ["Sacá el auto de la calle si vivís en una zona baja.", "Destapá las rejillas y los desagües de tu frente.", "Si podés, evitá cruzar el Ludueña o el Saladillo mientras llueve fuerte."],
  alert: ["No cruces calles con agua, ni a pie ni en auto: no se ven el cordón ni las bocas de tormenta.", "Levantá lo que tengas a nivel del piso en la cochera y el patio.", "Dejá a mano documentos y remedios en una bolsa que no se moje."],
  critical: ["Si entra agua a tu casa, cortá la luz y llamá al 103.", "No cruces calles con agua, ni a pie ni en auto.", "No vuelvas a buscar cosas a un lugar inundado hasta que baje el agua."],
  unknown: ["Mirá cómo está tu cuadra antes de salir.", "Si ves agua acumulada, avisá con un reporte: les sirve a tus vecinos y a quienes atienden.", "Si hay riesgo para personas, llamá al 103."],
};

const ACTIONS: Record<AnswerTone, AnswerAction[]> = {
  calm: ["zone", "report"],
  watch: ["zone", "report"],
  alert: ["report", "zone", "call"],
  critical: ["call", "report", "zone"],
  unknown: ["report", "claims", "call"],
};

function higher(a: RiskLevel | null, b: RiskLevel | null): RiskLevel | null {
  if (a === null || b === null) {
    return a ?? b;
  }
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

function decimal(value: number, digits = 2): string {
  return value.toFixed(digits).replace(".", ",");
}

/** «hoy a las 18:00», «mañana a las 06:00» o «el 16/11 a las 06:00». */
export function whenLabel(iso: string, now: number): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) {
    return "en las próximas horas";
  }
  const today = argentinaDay(now);
  const day = argentinaDay(time);
  const hour = argentinaTime(iso);
  if (day === today) {
    return `hoy a las ${hour}`;
  }
  if (day === addCalendarDays(today, 1)) {
    return `mañana a las ${hour}`;
  }
  return `el ${day.slice(8, 10)}/${day.slice(5, 7)} a las ${hour}`;
}

function riverSentence(risk: RiskAssessment, river: RiverSnapshot | null): string | null {
  const factor = risk.factors.find((entry) => entry.id === "river");
  if (!factor?.available || !river || factor.level === null) {
    return null;
  }
  const rising = river.station.trend.toLowerCase().includes("crec");
  switch (factor.level) {
    case "normal":
      return river.marginToAlert === null ? "El Paraná está por debajo de su nivel de alerta." : `El Paraná está ${decimal(river.marginToAlert)} m por debajo de su nivel de alerta.`;
    case "watch":
      return `El Paraná está a menos de medio metro de su nivel de alerta${rising ? " y sigue subiendo" : ""}.`;
    case "alert":
      return "El Paraná superó su nivel de alerta.";
    case "critical":
      return "El Paraná superó el nivel en el que se evacúa la costa.";
  }
}

function rainSentence(risk: RiskAssessment, rain: RainSnapshot | null, now: number): string | null {
  const factor = risk.factors.find((entry) => entry.id === "rain");
  if (!factor?.available || !rain || factor.level === null) {
    return null;
  }
  if (factor.level === "normal") {
    return "No se espera lluvia fuerte en las próximas 48 horas.";
  }
  const when = rain.peakWindow ? whenLabel(rain.peakWindow.from, now) : "en las próximas 48 horas";
  return factor.level === "watch" ? `Se espera lluvia fuerte ${when}.` : `Se espera lluvia muy fuerte ${when}.`;
}

function missingSentence(risk: RiskAssessment): string | null {
  const missing = risk.factors.filter((factor) => !factor.available).map((factor) => (factor.id === "river" ? "el dato del río" : "el pronóstico de lluvia"));
  return missing.length === 0 ? null : `No tenemos ${missing.join(" ni ")} ahora; no podemos asegurar que esté todo bien.`;
}

function zoneSentence(risk: RiskAssessment, level: RiskLevel | null): string | null {
  const top = risk.zones.reduce<RiskLevel | null>((max, zone) => higher(max, zone.level), null);
  if (top === null || top === "normal" || (level !== null && LEVEL_RANK[top] <= LEVEL_RANK[level])) {
    return null;
  }
  return "En las zonas bajas del Ludueña y el Saladillo el riesgo es mayor: fijate si tu casa está en una.";
}

function alertSentence(alerts: AlertsSnapshot | null, now: number): string | null {
  const alert = alerts?.items[0];
  if (!alert) {
    return null;
  }
  const event = alert.event.toLowerCase();
  return alert.current ? `Rige una alerta ${alert.level} oficial por ${event}.` : `Hay una alerta ${alert.level} oficial por ${event} que empieza ${whenLabel(alert.from, now)}.`;
}

const CALM_SENTENCE = /^No se espera|por debajo de su nivel/;

/**
 * La respuesta de la pantalla «Ahora». El nivel es el peor entre el río, la lluvia y las alertas oficiales
 * del SMN para Rosario. Si falta un dato y lo conocido está tranquilo, la respuesta es «no sabemos», no «todo bien».
 */
export function residentAnswer(input: { risk: RiskAssessment; river: RiverSnapshot | null; rain: RainSnapshot | null; alerts: AlertsSnapshot | null; now: number }): ResidentAnswer {
  const { risk, river, rain, alerts, now } = input;
  const official = (alerts?.items ?? []).reduce<RiskLevel | null>((max, alert) => higher(max, ALERT_LEVEL[alert.level]), null);
  const level = higher(risk.level, official);
  const tone: AnswerTone = level === null ? "unknown" : TONE[level];
  const sentences = [alertSentence(alerts, now), rainSentence(risk, rain, now), riverSentence(risk, river), missingSentence(risk), zoneSentence(risk, level)].filter((sentence): sentence is string => sentence !== null);
  if (alerts === null && tone === "calm") {
    sentences.push("No pudimos revisar las alertas oficiales.");
  }
  // Con riesgo, arriba va lo que lo causa; lo que está tranquilo queda en las líneas de detalle.
  const shown = tone === "calm" || tone === "unknown" ? sentences : sentences.filter((sentence) => !CALM_SENTENCE.test(sentence));
  return { tone, headline: HEADLINE[tone], why: shown.join(" ") || "Ninguna fuente respondió; no podemos asegurar que esté todo bien.", actions: ACTIONS[tone], tips: TIPS[tone] };
}

export type LineTone = "calm" | "watch" | "alert" | "missing";

export interface ConditionLine {
  id: string;
  name: string;
  /** Valor corto: «4,53 m · sube». Vacío si no hay dato. */
  value: string;
  meaning: string;
  /** «hace 2 h»; `null` si no hay dato. */
  freshness: string | null;
  tone: LineTone;
}

const LINE_TONE: Record<RiskLevel, LineTone> = { normal: "calm", watch: "watch", alert: "alert", critical: "alert" };

function riverTrend(trend: string): string {
  const text = trend.toLowerCase();
  return text.includes("crec") || text.includes("sub") ? "sube" : text.includes("baj") ? "baja" : text.includes("esta") ? "estable" : "";
}

export function riverLine(risk: RiskAssessment, river: RiverSnapshot | null, now: number): ConditionLine {
  const factor = risk.factors.find((entry) => entry.id === "river");
  if (!river || !Number.isFinite(river.station.meters)) {
    return { id: "river", name: "Río Paraná", value: "", meaning: "No tenemos el dato del río ahora. No podemos asegurar que esté todo bien.", freshness: null, tone: "missing" };
  }
  const trend = riverTrend(river.station.trend);
  const value = `${decimal(river.station.meters)} m${trend ? ` · ${trend}` : ""}`;
  const freshness = `medido ${ago(river.station.date, now)}`;
  if (!factor?.available || factor.level === null) {
    return { id: "river", name: "Río Paraná", value, meaning: "No hay un nivel de alerta publicado para comparar esta altura.", freshness, tone: "missing" };
  }
  return { id: "river", name: "Río Paraná", value, meaning: riverSentence(risk, river) ?? "", freshness, tone: LINE_TONE[factor.level] };
}

export function rainLine(risk: RiskAssessment, rain: RainSnapshot | null, now: number): ConditionLine {
  const factor = risk.factors.find((entry) => entry.id === "rain");
  if (!rain || !factor?.available || factor.level === null) {
    return { id: "rain", name: "Lluvia", value: "", meaning: "No tenemos el pronóstico de lluvia ahora. No podemos asegurar que no llueva fuerte.", freshness: null, tone: "missing" };
  }
  const peak = rain.peakWindow;
  const meaning =
    factor.level === "normal"
      ? rain.hours.every((hour) => hour.millimeters === 0)
        ? "No se espera lluvia en las próximas 48 horas."
        : "Puede llover, pero no se espera lluvia fuerte en 48 horas."
      : `Lo más fuerte llega ${peak ? whenLabel(peak.from, now) : "en las próximas 48 horas"}. Con esa lluvia se puede juntar agua en las calles.`;
  return { id: "rain", name: "Lluvia", value: `${decimal(rain.accumulated24h, 1)} mm en 24 h`, meaning, freshness: `pronóstico de ${ago(rain.fetchedAt, now)}`, tone: LINE_TONE[factor.level] };
}

const STREAM_TREND: Record<NonNullable<StreamReading["trend"]>, string> = { rising: "sube", falling: "baja", steady: "estable" };

/**
 * Una línea por arroyo. Manda la estación que superó su nivel de alerta; si no, la que sube; si no, la más alta.
 * Sin lecturas vigentes el arroyo queda «sin dato», nunca «bajo».
 */
export function streamLines(streams: StreamsSnapshot | null, now: number): ConditionLine[] {
  if (!streams) {
    return [{ id: "streams", name: "Arroyos Ludueña y Saladillo", value: "", meaning: "No tenemos la altura de los arroyos ahora. No podemos asegurar que estén bajos.", freshness: null, tone: "missing" }];
  }
  const byStream = new Map<string, StreamReading[]>();
  for (const reading of streams.items) {
    byStream.set(reading.stream, [...(byStream.get(reading.stream) ?? []), reading]);
  }
  return [...byStream.entries()].map(([stream, readings]): ConditionLine => {
    const fresh = readings.filter((reading) => !reading.stale);
    if (fresh.length === 0) {
      return { id: stream, name: stream, value: "", meaning: "La última medición tiene más de un día y medio. No podemos asegurar que esté bajo.", freshness: `medido ${ago(readings[0].at, now)}`, tone: "missing" };
    }
    const over = fresh.find((reading) => reading.alertM !== null && reading.heightM >= reading.alertM);
    const rising = fresh.find((reading) => reading.trend === "rising");
    const lead = over ?? rising ?? fresh.reduce((top, reading) => (reading.heightM > top.heightM ? reading : top));
    const value = `${decimal(lead.heightM)} m${lead.trend ? ` · ${STREAM_TREND[lead.trend]}` : ""}`;
    const where = lead.place ? ` en ${lead.place}` : "";
    const meaning = over
      ? `Superó su nivel de alerta${where}. Si vivís cerca, seguí las indicaciones oficiales.`
      : rising
        ? `Está subiendo${where}. Si vivís cerca, volvé a mirarlo en un rato.`
        : fresh.length === 1
          ? `No está subiendo${where}.`
          : `No sube en ninguno de los ${fresh.length} puntos medidos. El más alto es${lead.place ? ` ${lead.place}` : " el que se muestra"}${lead.alertM !== null ? `, lejos de su nivel de alerta (${decimal(lead.alertM)} m)` : ""}.`;
    return { id: stream, name: stream, value, meaning, freshness: `medido ${ago(lead.at, now)}`, tone: over ? "alert" : rising ? "watch" : "calm" };
  });
}
