import "server-only";

import type { CheckoutHttpError } from "@celebix/saas-contracts";

import type {
  HostedPaymentPresentation,
  HostedPaymentRuntime,
  InitializeCommittedHostedPaymentInput,
} from "../payment-adapters/runtime.ts";

export type HostedCartPaymentRuntime = Pick<HostedPaymentRuntime, "initializeCommitted">;

const TOKEN = /^[A-Za-z0-9_-]{20,4096}$/;
const CHECKOUT_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
});

function error(code: CheckoutHttpError, status: number): Response {
  return Response.json(Object.freeze({ code }), { status, headers: CHECKOUT_HEADERS });
}

function exactPresentation(presentation: HostedPaymentPresentation): string | null {
  if (presentation.kind !== "redirect" && presentation.kind !== "iframe") return null;
  let selected: URL;
  try {
    selected = new URL(presentation.url);
  } catch {
    return null;
  }
  if (
    selected.protocol !== "https:"
    || selected.username
    || selected.password
    || selected.port
    || selected.hash
    || selected.toString() !== presentation.url
  ) return null;
  if (selected.origin === "https://www.paytr.com") {
    if (presentation.kind !== "iframe") return null;
    const prefix = "https://www.paytr.com/odeme/guvenli/";
    return presentation.url === `${prefix}${presentation.token}`
      && TOKEN.test(presentation.token)
      && !selected.search
      ? presentation.url
      : null;
  }
  if (
    selected.origin !== "https://sandbox-cpp.iyzipay.com"
    && selected.origin !== "https://cpp.iyzipay.com"
  ) return null;
  const token = selected.searchParams.get("token");
  if (
    selected.pathname !== "/"
    || selected.searchParams.size !== 2
    || [...selected.searchParams.keys()].join(",") !== "token,lang"
    || selected.searchParams.get("lang") !== "tr"
    || token === null
    || !TOKEN.test(token)
    || (presentation.kind === "iframe" && presentation.token !== token)
  ) return null;
  const exactQuery = `?token=${token}&lang=tr`;
  return presentation.url === `${selected.origin}${exactQuery}`
    || presentation.url === `${selected.origin}/${exactQuery}`
    ? presentation.url
    : null;
}

export async function initializeHostedCartPayment(input: Readonly<{
  request: Request;
  attemptId: string;
  begin: InitializeCommittedHostedPaymentInput["begin"];
  runtime: HostedCartPaymentRuntime;
  trustedClientIp: string;
}>): Promise<Response> {
  const presentation = await input.runtime.initializeCommitted({
    headers: new Headers(input.request.headers),
    attemptId: input.attemptId,
    trustedClientIp: input.trustedClientIp,
    begin: input.begin,
  });
  if (presentation.kind === "processing") return error("processing", 202);
  if (presentation.kind === "rejected") return error("unavailable", 503);
  const location = exactPresentation(presentation);
  return location === null
    ? error("unavailable", 503)
    : new Response(null, {
        status: 303,
        headers: Object.freeze({ ...CHECKOUT_HEADERS, Location: location }),
      });
}
