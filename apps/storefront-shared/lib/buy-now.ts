type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type BuyNowResult = Readonly<{ kind: "ready" | "failed" | "aborted" }>;
export type BuyNowState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "pending"; variantId: string }>
  | Readonly<{ kind: "failed"; variantId: string }>;

type BuyNowRequest = (input: Readonly<{
  productId: string;
  variantId: string;
  signal: AbortSignal;
}>) => Promise<BuyNowResult>;

type BuyNowAttempt = {
  readonly controller: AbortController;
  readonly variantId: string;
  timer: unknown;
  timerSet: boolean;
};

export type BuyNowController = Readonly<{
  buy(input: Readonly<{ variantId: string; available: boolean }>): Promise<void>;
  dispose(): void;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validSuccess(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (Object.getPrototypeOf(candidate) !== Object.prototype
    || Object.keys(candidate).sort().join(",") !== "currency,itemCount,status,totalCents,version") return false;
  return (candidate.status === "active" || candidate.status === "recovered")
    && candidate.currency === "TRY"
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
      redirect: "error",
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

export function createBuyNowController(input: Readonly<{
  productId: string;
  request?: BuyNowRequest;
  navigate(pathname: string): void;
  onStateChange(state: BuyNowState): void;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}>): BuyNowController {
  const request = input.request ?? requestBuyNow;
  const setTimer = input.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const clearTimer = input.clearTimer ?? ((timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>));
  let active: BuyNowAttempt | null = null;
  let disposed = false;

  function cancelTimer(attempt: BuyNowAttempt): void {
    if (!attempt.timerSet) return;
    attempt.timerSet = false;
    clearTimer(attempt.timer);
  }

  function fail(attempt: BuyNowAttempt): void {
    if (active !== attempt) return;
    active = null;
    input.onStateChange(Object.freeze({ kind: "failed", variantId: attempt.variantId }));
  }

  return Object.freeze({
    async buy(selected): Promise<void> {
      if (disposed || !selected.available || active !== null) return;
      const attempt: BuyNowAttempt = {
        controller: new AbortController(),
        variantId: selected.variantId,
        timer: undefined,
        timerSet: false,
      };
      active = attempt;
      input.onStateChange(Object.freeze({ kind: "pending", variantId: selected.variantId }));

      try {
        const timer = setTimer(() => {
          if (active !== attempt) return;
          attempt.timerSet = false;
          active = null;
          attempt.controller.abort();
          input.onStateChange(Object.freeze({ kind: "failed", variantId: attempt.variantId }));
        }, 10_000);
        attempt.timer = timer;
        attempt.timerSet = true;
        if (active !== attempt) cancelTimer(attempt);
      } catch {
        attempt.controller.abort();
        fail(attempt);
        return;
      }

      let result: BuyNowResult;
      try {
        result = await request({
          productId: input.productId,
          variantId: selected.variantId,
          signal: attempt.controller.signal,
        });
      } catch {
        result = Object.freeze({ kind: "failed" });
      }
      if (active !== attempt) return;
      cancelTimer(attempt);
      if (result.kind !== "ready") {
        fail(attempt);
        return;
      }
      try {
        input.navigate("/odeme");
      } catch {
        fail(attempt);
      }
    },
    dispose(): void {
      disposed = true;
      const attempt = active;
      active = null;
      if (attempt === null) return;
      cancelTimer(attempt);
      attempt.controller.abort();
    },
  });
}
