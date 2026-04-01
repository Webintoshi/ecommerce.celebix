"use client";

type FetchAdminJsonOptions = {
  timeoutMs?: number;
  cache?: RequestCache;
  init?: RequestInit;
};

export class AdminFetchError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AdminFetchError";
    this.status = status;
  }
}

export async function fetchAdminJson<T>(
  input: string,
  options: FetchAdminJsonOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 8000
  );

  try {
    const response = await fetch(input, {
      cache: options.cache ?? "no-store",
      ...options.init,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new AdminFetchError(
        payload?.error || "Istek basarisiz oldu.",
        response.status
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof AdminFetchError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AdminFetchError("Istek zaman asimina ugradi.", 408);
    }

    throw new AdminFetchError(
      error instanceof Error ? error.message : "Bilinmeyen istek hatasi."
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
