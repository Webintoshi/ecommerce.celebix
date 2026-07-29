type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type BuyNowResult = Readonly<{ kind: "ready" | "failed" | "aborted" }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validSuccess(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (Object.getPrototypeOf(candidate) !== Object.prototype
    || Object.keys(candidate).sort().join(",") !== "currency,itemCount,status,totalCents,version") return false;
  return (candidate.status === "active" || candidate.status === "recovered")
    && typeof candidate.currency === "string" && /^[A-Z]{3}$/.test(candidate.currency)
    && Number.isSafeInteger(candidate.totalCents) && Number(candidate.totalCents) >= 0
    && Number.isSafeInteger(candidate.itemCount) && Number(candidate.itemCount) === 1
    && Number.isSafeInteger(candidate.version) && Number(candidate.version) >= 1;
}

export async function requestBuyNow(input: Readonly<{
  productId: string;
  variantId: string;
  signal: AbortSignal;
  fetcher?: Fetcher;
}>): Promise<BuyNowResult> {
  if (!UUID.test(input.productId) || !UUID.test(input.variantId)) return Object.freeze({ kind: "failed" });
  try {
    const response = await (input.fetcher ?? fetch)("/api/cart", {
      method: "POST",
      headers: Object.freeze({ "Content-Type": "application/json" }),
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        customer: {},
        items: [{ productId: input.productId, variantId: input.variantId, quantity: 1 }],
      }),
      signal: input.signal,
    });
    const body: unknown = await response.json();
    return response.status === 200 && validSuccess(body)
      ? Object.freeze({ kind: "ready" })
      : Object.freeze({ kind: "failed" });
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? Object.freeze({ kind: "aborted" })
      : Object.freeze({ kind: "failed" });
  }
}
