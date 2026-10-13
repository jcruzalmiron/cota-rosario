export function nonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label}: dato faltante o inválido; no se reemplaza por cero.`);
  return value;
}

export function probability(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function requireRecent(iso: string, maxAgeMs: number, label: string, now = Date.now()): void {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant) || instant > now + 15 * 60_000 || now - instant > maxAgeMs) throw new Error(`${label}: lectura fuera de vigencia. Última fecha informada: ${iso || "sin fecha"}.`);
}
