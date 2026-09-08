import "server-only";

/**
 * In-process TTL cache for expensive async loads. Single-user tool, so a
 * Map per loader is sufficient.
 *
 * Notes:
 * - Caches the in-flight Promise so concurrent callers share a single load.
 * - On rejection, the entry is evicted so the next call retries fresh.
 * - `get` accepts a per-call TTL so one cache can hold entries with
 *   different lifetimes (e.g. keyed to a dashboard's own refresh interval).
 * - In Next.js dev mode, hot-module reload may reset the cache; in production
 *   (`next start`) the module is reused across requests for the process
 *   lifetime.
 */
type Entry<T> = {
  value: Promise<T>;
  expiresAt: number;
};

/** Entries beyond this count trigger an opportunistic sweep of expired keys. */
const SWEEP_THRESHOLD = 32;

export function ttlCache<T>(defaultTtlMs: number) {
  const map = new Map<string, Entry<T>>();
  return {
    async get(
      key: string,
      loader: () => Promise<T>,
      ttlMs: number = defaultTtlMs,
    ): Promise<T> {
      const now = Date.now();
      const cached = map.get(key);
      if (cached && cached.expiresAt > now) {
        return cached.value;
      }
      // Keys that embed a settings fingerprint change whenever settings do;
      // drop the expired leftovers so the map can't grow without bound.
      if (map.size >= SWEEP_THRESHOLD) {
        for (const [k, e] of map) if (e.expiresAt <= now) map.delete(k);
      }
      const promise = loader();
      map.set(key, { value: promise, expiresAt: now + ttlMs });
      try {
        return await promise;
      } catch (err) {
        map.delete(key);
        throw err;
      }
    },
    invalidate(key: string) {
      map.delete(key);
    },
    /** Drop every entry whose key starts with `prefix`. */
    invalidatePrefix(prefix: string) {
      for (const k of map.keys()) if (k.startsWith(prefix)) map.delete(k);
    },
  };
}

/**
 * Short, stable fingerprint of a string (FNV-1a, 32-bit, hex). Used to fold a
 * settings snapshot into a cache key without storing the whole thing.
 */
export function fingerprint(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
