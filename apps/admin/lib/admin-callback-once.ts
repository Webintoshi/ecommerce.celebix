type CallbackEntry = {
  expiresAt: number;
  promise: Promise<unknown>;
};

type AdminCallbackDeduplicator = <T>(
  signedState: string,
  task: () => Promise<T>,
) => Promise<T>;

export function createAdminCallbackDeduplicator(options?: {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}): AdminCallbackDeduplicator {
  const ttlMs = options?.ttlMs ?? 60_000;
  const maxEntries = options?.maxEntries ?? 256;
  const now = options?.now ?? Date.now;
  const entries = new Map<string, CallbackEntry>();

  return <T>(signedState: string, task: () => Promise<T>): Promise<T> => {
    const currentTime = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= currentTime) {
        entries.delete(key);
      }
    }

    const existing = entries.get(signedState);
    if (existing) {
      return existing.promise as Promise<T>;
    }

    let promise: Promise<T>;
    try {
      promise = Promise.resolve(task());
    } catch (error) {
      promise = Promise.reject(error);
    }

    entries.set(signedState, {
      expiresAt: currentTime + ttlMs,
      promise,
    });

    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      entries.delete(oldestKey);
    }

    return promise;
  };
}

export const resolveAdminCallbackOnce = createAdminCallbackDeduplicator();
