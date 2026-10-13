export const ARGENTINA_TIMEZONE = "America/Argentina/Buenos_Aires";

const horaFormatter = new Intl.DateTimeFormat("es-AR", { timeZone: ARGENTINA_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const fechaHoraFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: ARGENTINA_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function horaArgentina(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "—" : horaFormatter.format(fecha);
}

export function fechaHoraArgentina(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "—" : fechaHoraFormatter.format(fecha).replace(",", "");
}

export function argentinaDay(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ARGENTINA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addCalendarDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// The provider returns local ISO strings and an offset separately; never use the server's timezone.
export function sourceTime(iso: string, utcOffsetSeconds: number): string {
  if (!Number.isInteger(utcOffsetSeconds) || Math.abs(utcOffsetSeconds) > 14 * 3600 || utcOffsetSeconds % 60 !== 0 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(iso)) throw new Error("La fuente devolvió una fecha o zona horaria inválida.");
  const minutes = Math.abs(utcOffsetSeconds) / 60;
  const suffix = `${utcOffsetSeconds < 0 ? "-" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const result = `${iso}${suffix}`;
  if (!Number.isFinite(Date.parse(result))) throw new Error("La fuente devolvió una fecha inválida.");
  return result;
}
