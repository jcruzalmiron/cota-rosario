const MAX_ENTRIES = 32;
const MIN_CLEAR_INTERVAL_MS = 10_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const RETRY_AFTER_FAILURE_MS = MINUTE_MS;

export interface FreshnessPolicy {
  freshMs: number;
  staleMs: number;
  hourly: boolean;
}

export const FRESHNESS = {
  river: { freshMs: 30 * MINUTE_MS, staleMs: 6 * HOUR_MS, hourly: false },
  hourlyRain: { freshMs: 10 * MINUTE_MS, staleMs: HOUR_MS, hourly: true },
  weather: { freshMs: 10 * MINUTE_MS, staleMs: HOUR_MS, hourly: false },
  discharge: { freshMs: 6 * HOUR_MS, staleMs: 24 * HOUR_MS, hourly: false },
  // Las alertas del SMN cambian en minutos (avisos a corto plazo); los arroyos se leen una vez al día o por hora.
  alerts: { freshMs: 5 * MINUTE_MS, staleMs: 30 * MINUTE_MS, hourly: false },
  streams: { freshMs: 30 * MINUTE_MS, staleMs: 3 * HOUR_MS, hourly: false },
} as const satisfies Record<string, FreshnessPolicy>;

interface Entry {
  value?: unknown;
  settledAt: number;
  staleMs: number;
  failedAt?: number;
  pending?: Promise<unknown>;
}

const runtime = globalThis as typeof globalThis & { __cotaLiveSources?: Map<string, Entry> };
const entries = (runtime.__cotaLiveSources ??= new Map<string, Entry>());
let lastClearAt = Number.NEGATIVE_INFINITY;

function keyFor(source: string, policy: FreshnessPolicy, now: number): string {
  return policy.hourly ? `${Math.floor(now / HOUR_MS)}:${source}` : source;
}

function dropExpired(now: number): void {
  for (const [key, entry] of entries) {
    if (!entry.pending && now - entry.settledAt > entry.staleMs) entries.delete(key);
  }
}

function refresh<T>(key: string, policy: FreshnessPolicy, load: () => Promise<T>, now: number): Promise<T> {
  const entry = entries.get(key) ?? { settledAt: Number.NEGATIVE_INFINITY, staleMs: policy.staleMs };
  const pending = Promise.resolve()
    .then(load)
    .then(
      (value) => {
        if (entries.get(key) === entry) {
          entry.value = value;
          entry.settledAt = now;
          entry.failedAt = undefined;
          entry.pending = undefined;
        }
        return value;
      },
      (error: unknown) => {
        if (entries.get(key) === entry) {
          entry.pending = undefined;
          entry.failedAt = now;
          if (!("value" in entry)) entries.delete(key);
        }
        throw error;
      },
    );
  entry.pending = pending;
  entries.set(key, entry);
  return pending;
}

export function readLiveSource<T>(source: string, policy: FreshnessPolicy, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const key = keyFor(source, policy, now);
  dropExpired(now);
  const entry = entries.get(key);
  const age = entry ? now - entry.settledAt : Number.POSITIVE_INFINITY;
  const hasValue = entry !== undefined && "value" in entry;

  if (hasValue && age <= policy.freshMs) return Promise.resolve(entry.value as T);
  if (hasValue && age <= policy.staleMs) {
    const recentlyFailed = entry.failedAt !== undefined && now - entry.failedAt < RETRY_AFTER_FAILURE_MS;
    if (!entry.pending && !recentlyFailed) {
      refresh(key, policy, load, now).catch((error: unknown) => console.warn(`Background refresh of ${source} failed:`, error instanceof Error ? error.message : error));
    }
    return Promise.resolve(entry.value as T);
  }
  if (entry?.pending) return entry.pending as Promise<T>;
  if (entries.size >= MAX_ENTRIES) return load();
  return refresh(key, policy, load, now);
}

export function clearLiveSources(now = Date.now()): boolean {
  if (now - lastClearAt < MIN_CLEAR_INTERVAL_MS) return false;
  lastClearAt = now;
  entries.clear();
  return true;
}
