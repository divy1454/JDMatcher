/**
 * Outgoing requests for the job finder: a timeout on every call, and a short cache so a recruiter
 * changing filters (24 hours -> 1 week) or searching for a second candidate doesn't download every
 * career site again. Only successful responses are cached.
 */
import { FetchLike } from './types.js';

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 400;
const TIMEOUT_MS = 15000;
const USER_AGENT = 'JDMatcher-JobFinder/1.0';

interface Stored {
  ok: boolean;
  status: number;
  body: string;
}

const cache = new Map<string, { at: number; value: Promise<Stored> }>();

function wrap(r: Stored) {
  return {
    ok: r.ok,
    status: r.status,
    json: async () => JSON.parse(r.body),
    text: async () => r.body,
  };
}

function prune(now: number) {
  for (const [k, v] of cache) if (now - v.at > TTL_MS) cache.delete(k);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Node's fetch with a timeout, a plain User-Agent and the short cache. */
export function createJobFinderFetch(base: typeof fetch = fetch, ttlMs = TTL_MS): FetchLike {
  return async (url, init) => {
    const method = init?.method || 'GET';
    const key = `${method} ${url} ${init?.body || ''}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < ttlMs) return wrap(await hit.value);

    const value = base(url, {
      method,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...(init?.headers || {}) },
      body: init?.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then(async (res) => ({ ok: res.ok, status: res.status, body: await res.text() }));
    cache.set(key, { at: now, value });
    value.then(
      (r) => {
        if (!r.ok) cache.delete(key);
      },
      () => cache.delete(key)
    );
    prune(now);
    return wrap(await value);
  };
}

/** For tests. */
export function clearJobFinderCache() {
  cache.clear();
}
