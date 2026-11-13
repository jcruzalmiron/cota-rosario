export const ARGENTINA_TIMEZONE = "America/Argentina/Buenos_Aires";

const timeFormatter = new Intl.DateTimeFormat("es-AR", { timeZone: ARGENTINA_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: ARGENTINA_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function argentinaTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : timeFormatter.format(date);
}

export function argentinaDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date).replace(",", "");
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: ARGENTINA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const stampFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: ARGENTINA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function argentinaDay(now = Date.now()): string {
  const parts = dayFormatter.formatToParts(new Date(now));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Fecha y hora argentinas ordenables, "AAAA-MM-DD HH:mm", para exportaciones. */
export function argentinaStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = stampFormatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** Verdadero si el texto es un día calendario real con formato AAAA-MM-DD. */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function addCalendarDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function sourceTime(iso: string, utcOffsetSeconds: number): string {
  if (!Number.isInteger(utcOffsetSeconds) || Math.abs(utcOffsetSeconds) > 14 * 3600 || utcOffsetSeconds % 60 !== 0 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(iso)) throw new Error("La fuente devolvió una fecha o zona horaria inválida.");
  const minutes = Math.abs(utcOffsetSeconds) / 60;
  const suffix = `${utcOffsetSeconds < 0 ? "-" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const result = `${iso}${suffix}`;
  if (!Number.isFinite(Date.parse(result))) throw new Error("La fuente devolvió una fecha inválida.");
  return result;
}
