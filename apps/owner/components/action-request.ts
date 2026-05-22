"use client";

export async function readActionResponse<T extends { error?: string }>(response: Response): Promise<{
  payload: T | null;
  errorMessage: string | null;
}> {
  const raw = await response.text();
  const trimmed = raw.trim();
  const sanitizedText = trimmed.replace(/\s+/g, " ").slice(0, 220);

  if (!trimmed) {
    return {
      payload: null,
      errorMessage: null,
    };
  }

  try {
    const payload = JSON.parse(trimmed) as T;
    const errorMessage =
      typeof payload.error === "string" && payload.error.trim().length > 0
        ? payload.error.trim()
        : null;

    return {
      payload,
      errorMessage,
    };
  } catch {
    return {
      payload: null,
      errorMessage: sanitizedText,
    };
  }
}

export function normalizeActionError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return fallback;
}
