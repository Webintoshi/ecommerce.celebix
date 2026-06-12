import { randomUUID } from "crypto";

export interface ProviderHttpMetadata {
  correlationId: string;
  latencyMs: number;
  status: number;
  requestId: string | null;
  providerErrorCode: string | null;
}

export interface ProviderHttpResponse<T> {
  data: T;
  metadata: ProviderHttpMetadata;
  headers: Headers;
}

export class ProviderApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly responseBody: unknown;
  readonly correlationId: string;
  readonly requestId: string | null;
  readonly retryable: boolean;

  constructor(input: {
    message: string;
    status: number;
    code?: string | null;
    responseBody?: unknown;
    correlationId: string;
    requestId?: string | null;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "ProviderApiError";
    this.status = input.status;
    this.code = input.code || null;
    this.responseBody = input.responseBody;
    this.correlationId = input.correlationId;
    this.requestId = input.requestId || null;
    this.retryable = Boolean(input.retryable);
  }
}

type ProviderHttpRequestInput = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  maxRetries?: number;
  retryableStatusCodes?: number[];
  correlationId?: string;
};

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 409, 425, 429, 500, 502, 503, 504];

function parseResponseBody(raw: string) {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function extractRequestId(headers: Headers) {
  return (
    headers.get("x-request-id") ||
    headers.get("x-correlation-id") ||
    headers.get("x-amzn-requestid") ||
    headers.get("x-amzn-request-id") ||
    null
  );
}

function extractProviderErrorCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  const candidate =
    value.code ||
    value.errorCode ||
    value.error_code ||
    (typeof value.error === "object" && value.error ? (value.error as Record<string, unknown>).code : null) ||
    null;

  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function shouldRetry(status: number, retryableStatusCodes: number[]) {
  return retryableStatusCodes.includes(status);
}

function computeBackoffMs(attempt: number) {
  const base = Math.min(1000 * Math.pow(2, attempt), 12_000);
  const jitter = Math.floor(Math.random() * 350);
  return base + jitter;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildCorrelationId() {
  return randomUUID();
}

export async function sendProviderRequest<T = unknown>(
  input: ProviderHttpRequestInput,
): Promise<ProviderHttpResponse<T>> {
  const method = input.method || "GET";
  const timeoutMs = input.timeoutMs || 20_000;
  const maxRetries = Math.max(0, input.maxRetries ?? 2);
  const retryableStatusCodes = input.retryableStatusCodes || DEFAULT_RETRYABLE_STATUS_CODES;
  const correlationId = input.correlationId || buildCorrelationId();

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input.url, {
        method,
        headers: {
          "content-type": "application/json",
          "x-correlation-id": correlationId,
          ...input.headers,
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeout);

      const rawBody = await response.text();
      const body = parseResponseBody(rawBody);
      const status = response.status;
      const requestId = extractRequestId(response.headers);
      const providerErrorCode = extractProviderErrorCode(body);

      if (!response.ok) {
        const retryable = shouldRetry(status, retryableStatusCodes);
        if (retryable && attempt < maxRetries) {
          await sleep(computeBackoffMs(attempt));
          continue;
        }

        let message = `Provider istegi basarisiz: ${status}`;
        if (body && typeof body === "object") {
          const candidate = (body as Record<string, unknown>).message;
          if (typeof candidate === "string" && candidate.trim()) {
            message = candidate.trim();
          }
        }

        throw new ProviderApiError({
          message,
          status,
          code: providerErrorCode,
          responseBody: body,
          correlationId,
          requestId,
          retryable,
        });
      }

      return {
        data: body as T,
        metadata: {
          correlationId,
          latencyMs: Date.now() - startedAt,
          status,
          requestId,
          providerErrorCode,
        },
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      const isAbort = error instanceof Error && error.name === "AbortError";
      const retryable = isAbort || !(error instanceof ProviderApiError) || error.retryable;
      if (!retryable || attempt >= maxRetries) {
        if (error instanceof ProviderApiError) {
          throw error;
        }

        throw new ProviderApiError({
          message: isAbort ? "Provider istegi zaman asimina ugradi." : normalizeUnknownProviderError(error),
          status: 0,
          code: null,
          responseBody: null,
          correlationId,
          retryable,
        });
      }

      await sleep(computeBackoffMs(attempt));
    }
  }

  throw new ProviderApiError({
    message: normalizeUnknownProviderError(lastError),
    status: 0,
    code: null,
    responseBody: null,
    correlationId,
    retryable: false,
  });
}

export function normalizeUnknownProviderError(error: unknown) {
  if (error instanceof ProviderApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Bilinmeyen pazaryeri hatasi.";
}

export function toRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
