type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function operationId() {
  return crypto.randomUUID();
}

export async function idempotentJsonMutation<T = unknown>(
  path: string,
  method: string,
  payload: unknown,
  options: {
    fetcher?: Fetcher;
    operationId?: string;
    parse?: (value: unknown) => T;
  } = {},
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const idempotencyKey = options.operationId ?? operationId();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(path, {
        method,
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (attempt === 1) throw error;
      continue;
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      if (attempt === 0 && (response.ok || response.status >= 500)) continue;
      throw new Error("unavailable");
    }
    if (response.ok) {
      try {
        return options.parse ? options.parse(value) : (value as T);
      } catch {
        if (attempt === 0) continue;
        throw new Error("unavailable");
      }
    }
    if (response.status >= 500 && attempt === 0) continue;
    const errorValue = value as { code?: unknown } | null;
    throw new Error(
      errorValue && typeof errorValue.code === "string"
        ? errorValue.code
        : "unavailable",
    );
  }
  throw new Error("unavailable");
}
