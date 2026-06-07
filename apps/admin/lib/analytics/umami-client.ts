import "server-only";

type UmamiAuthHeaders =
  | { Authorization: string }
  | { "x-umami-api-key": string };

type UmamiClientOptions = {
  baseUrl: string;
  apiKey?: string | null;
  bearerToken?: string | null;
  username?: string | null;
  password?: string | null;
};

export type UmamiApiErrorCode =
  | "missing-auth"
  | "login-failed"
  | "unauthorized"
  | "not-found"
  | "request-failed";

export class UmamiApiError extends Error {
  code: UmamiApiErrorCode;
  status: number | null;

  constructor(message: string, code: UmamiApiErrorCode, status: number | null = null) {
    super(message);
    this.name = "UmamiApiError";
    this.code = code;
    this.status = status;
  }
}

export interface UmamiWebsiteRecord {
  id: string;
  name: string;
  domain: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  shareId?: string | null;
}

export interface UmamiPaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
}

export interface UmamiStatsResponse {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  comparison?: {
    pageviews?: number;
    visitors?: number;
    visits?: number;
    bounces?: number;
    totaltime?: number;
  } | null;
}

export interface UmamiExpandedMetric {
  name: string;
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
}

type CachedToken = {
  token: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

function trimValue(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function toErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = Reflect.get(payload, "error");
  if (!error || typeof error !== "object") {
    return null;
  }

  const message = Reflect.get(error, "message");
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    return toErrorMessage(payload) || response.statusText || "Umami istegi basarisiz oldu.";
  } catch {
    return response.statusText || "Umami istegi basarisiz oldu.";
  }
}

async function resolveAuthHeaders(options: UmamiClientOptions): Promise<UmamiAuthHeaders> {
  const apiKey = trimValue(options.apiKey);
  if (apiKey) {
    return { "x-umami-api-key": apiKey };
  }

  const bearerToken = trimValue(options.bearerToken);
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  const username = trimValue(options.username);
  const password = trimValue(options.password);
  if (!username || !password) {
    throw new UmamiApiError(
      "Umami API kimlik bilgileri tanimli degil.",
      "missing-auth",
      null,
    );
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return { Authorization: `Bearer ${cachedToken.token}` };
  }

  const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new UmamiApiError(await readError(response), "login-failed", response.status);
  }

  const payload = (await response.json()) as { token?: string };
  const token = trimValue(payload.token);

  if (!token) {
    throw new UmamiApiError("Umami login token dondurmedi.", "login-failed", response.status);
  }

  cachedToken = {
    token,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  return { Authorization: `Bearer ${token}` };
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function createUmamiClient(options: UmamiClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  async function request<T>(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<T> {
    const headers = await resolveAuthHeaders(options);
    const searchParams = new URLSearchParams();

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }

      searchParams.set(key, String(value));
    });

    const url = searchParams.size > 0
      ? `${baseUrl}${path}?${searchParams.toString()}`
      : `${baseUrl}${path}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const message = await readError(response);

      if (response.status === 401 || response.status === 403) {
        throw new UmamiApiError(message, "unauthorized", response.status);
      }

      if (response.status === 404) {
        throw new UmamiApiError(message, "not-found", response.status);
      }

      throw new UmamiApiError(message, "request-failed", response.status);
    }

    return parseJson<T>(response);
  }

  return {
    async getWebsite(websiteId: string) {
      return request<UmamiWebsiteRecord>(`/api/websites/${websiteId}`);
    },
    async listWebsites(search?: string) {
      return request<UmamiPaginatedResponse<UmamiWebsiteRecord>>("/api/websites", {
        includeTeams: true,
        pageSize: 100,
        search,
      });
    },
    async getActiveVisitors(websiteId: string) {
      return request<{ visitors?: number }>(`/api/websites/${websiteId}/active`);
    },
    async getStats(
      websiteId: string,
      params: { startAt: number; endAt: number },
    ) {
      return request<UmamiStatsResponse>(`/api/websites/${websiteId}/stats`, params);
    },
    async getExpandedMetrics(
      websiteId: string,
      params: {
        startAt: number;
        endAt: number;
        type: "path" | "referrer" | "hostname";
        limit?: number;
      },
    ) {
      return request<UmamiExpandedMetric[]>(
        `/api/websites/${websiteId}/metrics/expanded`,
        params,
      );
    },
  };
}
