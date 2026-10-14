const TTL_MS = 60_000;
const MAX_ENTRIES = 32;
// The refresh action is public: never let callers force upstream requests more often than this.
const MIN_CLEAR_INTERVAL_MS = 10_000;

interface Entry {
  promise: Promise<unknown>;
  expiresAt: number;
}

// Shared across server route bundles in this process; never sent to the browser.
const runtime = globalThis as typeof globalThis & { __cotaLiveSources?: Map<string, Entry> };
const entries = runtime.__cotaLiveSources ??= new Map<string, Entry>();
let lastClearAt = Number.NEGATIVE_INFINITY;

export function readLiveSource<T>(source: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  // Rolling rain windows and calendar days must be recalculated at hour boundaries.
  const key = `${Math.floor(now / 3_600_000)}:${source}`;
  for (const [name, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(name);
  }
  const existing = entries.get(key);
  if (existing) return existing.promise as Promise<T>;
  if (entries.size >= MAX_ENTRIES) return load();

  const entry: Entry = { promise: Promise.resolve(), expiresAt: Infinity };
  entry.promise = Promise.resolve().then(load).then(
    (value) => {
      if (entries.get(key) === entry) entry.expiresAt = Date.now() + TTL_MS;
      return value;
    },
    (error) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    },
  );
  entries.set(key, entry);
  return entry.promise as Promise<T>;
}

export function clearLiveSources(now = Date.now()): boolean {
  if (now - lastClearAt < MIN_CLEAR_INTERVAL_MS) return false;
  lastClearAt = now;
  entries.clear();
  return true;
}
