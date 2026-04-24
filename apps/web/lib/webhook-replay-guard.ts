const _store = new Map<string, number>();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

function _prune(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, ts] of _store) {
    if (ts < cutoff) _store.delete(key);
  }
}

export function checkAndMark(key: string): boolean {
  const seenAt = _store.get(key);
  if (seenAt !== undefined) {
    if (Date.now() - seenAt < TTL_MS) return false; // duplicate
    _store.delete(key);
  }
  _store.set(key, Date.now());
  if (_store.size > MAX_ENTRIES) _prune();
  return true; // first time seen
}
