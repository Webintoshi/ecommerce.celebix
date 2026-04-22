"use client";

const RECOVERY_STORAGE_KEY = "celebix-route-recovery";
const RECOVERY_WINDOW_MS = 30_000;

const RECOVERABLE_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk/i,
  /Loading CSS chunk/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Failed to fetch RSC payload/i,
  /Failed to fetch server response/i,
  /Abort fetching component for route/i,
  /Failed to fetch$/i,
];

function buildRecoverySignature(error: Error & { digest?: string }) {
  if (typeof window === "undefined") {
    return `${error.name}:${error.message}:${error.digest ?? ""}`;
  }

  return [
    window.location.pathname,
    window.location.search,
    error.name,
    error.message,
    error.digest ?? "",
  ].join("|");
}

export function shouldAutoRecover(error: Error & { digest?: string }) {
  return RECOVERABLE_ERROR_PATTERNS.some((pattern) => {
    return pattern.test(error.name) || pattern.test(error.message ?? "");
  });
}

export function attemptAutoRecovery(error: Error & { digest?: string }) {
  if (typeof window === "undefined") {
    return false;
  }

  const signature = buildRecoverySignature(error);
  const rawPayload = sessionStorage.getItem(RECOVERY_STORAGE_KEY);

  if (rawPayload) {
    try {
      const payload = JSON.parse(rawPayload) as {
        signature?: string;
        timestamp?: number;
      };

      if (
        payload.signature === signature &&
        typeof payload.timestamp === "number" &&
        Date.now() - payload.timestamp < RECOVERY_WINDOW_MS
      ) {
        sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
        return false;
      }
    } catch {
      sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
    }
  }

  sessionStorage.setItem(
    RECOVERY_STORAGE_KEY,
    JSON.stringify({
      signature,
      timestamp: Date.now(),
    }),
  );

  window.location.reload();
  return true;
}
