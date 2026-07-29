import {
  parseCheckoutHttpErrorResponse,
  parseCheckoutSubmitSuccess,
  type CheckoutHttpError,
} from "@celebix/saas-contracts";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type CheckoutSubmissionRequestResult =
  | Readonly<{ kind: "redirect"; location: string }>
  | Readonly<{ kind: "failed"; code: CheckoutHttpError }>
  | Readonly<{ kind: "aborted" }>;

const ERROR_STATUS: Readonly<Record<CheckoutHttpError, number>> = Object.freeze({
  invalid_input: 400,
  origin_denied: 403,
  cart_not_found: 404,
  cart_changed: 409,
  discount_invalid: 409,
  stock_unavailable: 409,
  payment_unavailable: 409,
  processing: 202,
  unavailable: 503,
});

function unavailable(): CheckoutSubmissionRequestResult {
  return Object.freeze({ kind: "failed", code: "unavailable" });
}

export async function requestCheckoutSubmission(input: Readonly<{
  body: URLSearchParams;
  signal: AbortSignal;
  fetcher?: Fetcher;
}>): Promise<CheckoutSubmissionRequestResult> {
  const fetcher = input.fetcher ?? fetch;
  try {
    const selected = await fetcher("/api/checkout/submit", {
      method: "POST",
      headers: Object.freeze({
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      }),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      body: input.body.toString(),
      signal: input.signal,
    });
    const body: unknown = await selected.json();
    if (selected.status === 200) {
      return parseCheckoutSubmitSuccess(body);
    }
    const parsed = parseCheckoutHttpErrorResponse(body);
    return ERROR_STATUS[parsed.code] === selected.status
      ? Object.freeze({ kind: "failed" as const, code: parsed.code })
      : unavailable();
  } catch (error) {
    if (
      error instanceof DOMException
      && error.name === "AbortError"
    ) return Object.freeze({ kind: "aborted" });
    return unavailable();
  }
}
