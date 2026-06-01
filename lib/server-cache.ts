import "server-only";

/**
 * In-process TTL cache for expensive async loads. Single-user tool, so a
 * Map per loader is sufficient.
 *
 * Notes:
 * - Caches the in-flight Promise so concurrent callers share a single load.
 * - On rejection, the entry is evicted so the next call retries fresh.
 * - In Next.js dev mode, hot-module reload may reset the cache; in production
 *   (`next start`) the module is reused across requests for the process
 *   lifetime.
 */
type Entry<T> = {
  value: Promise<T>;
  expiresAt: number;
};

export function ttlCache<T>(ttlMs: number) {
  const map = new Map<string, Entry<T>>();
  return {
    async get(key: string, loader: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const cached = map.get(key);
      if (cached && cached.expiresAt > now) {
        return cached.value;
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
  };
}
