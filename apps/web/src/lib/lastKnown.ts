/**
 * Last known good answers for the few reads a weaver needs at the loom.
 *
 * Factory internet is weak, and TanStack Query's cache lives in memory, so it
 * is empty again after the app is reopened. Without this, a weaver with no
 * signal sees a sign-in screen and an empty saree list, which is exactly when
 * they need the entry form.
 *
 * Only ever a fallback for reading. Every request is still authorised by the
 * server against the session cookie, so a stale copy here grants nothing that
 * a fresh one would not.
 */

const PREFIX = "loom.lastKnown.";

export function readLastKnown<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Private windows, cleared site data, storage turned off.
    return null;
  }
}

export function writeLastKnown(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(PREFIX + key);
    } else {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    }
  } catch {
    // Storage full or unavailable: the app still works, it just will not
    // remember this across a reload.
  }
}

export function clearLastKnown(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing to clear if storage cannot be read.
  }
}
