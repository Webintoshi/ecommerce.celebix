import "server-only";

import { createHash } from "node:crypto";

import {
  parseCheckoutQuote,
  parseCheckoutStatus,
  type CheckoutDeliveryInput,
  type CheckoutHttpError,
  type CheckoutQuote,
  type CheckoutSubmissionResult,
  type CheckoutSubmitInput,
} from "@celebix/saas-contracts";
import {
  PublicCheckoutRepositoryError,
  type PublicCheckoutRepository,
} from "@celebix/saas-data";

import { digestCartCredential, readCartCredential } from "../cart-capture/credential.ts";
import type { HostedPaymentRuntime } from "../payment-adapters/runtime.ts";
import { initializeHostedCartPayment } from "./hosted-cart-payment.ts";
import {
  readCheckoutCredentialRequest,
  readCheckoutDeliveryRequest,
  readCheckoutSubmitRequest,
} from "./request.ts";
import { parseTrustedClientIp } from "./trusted-client-ip.ts";

export const CHECKOUT_HTTP_ERRORS: readonly CheckoutHttpError[] = Object.freeze([
  "invalid_input",
  "origin_denied",
  "cart_not_found",
  "cart_changed",
  "discount_invalid",
  "stock_unavailable",
  "payment_unavailable",
  "processing",
  "unavailable",
]);

export const CHECKOUT_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
});

export type PublicCheckoutRuntime = Readonly<{
  checkout: PublicCheckoutRepository;
  hosted: HostedPaymentRuntime | null;
}>;

type HostAuthority =
  | Readonly<{ kind: "trusted"; hostname: string }>
  | Readonly<{ kind: string; hostname?: never }>;

type HandlerDependencies = Readonly<{
  selectAuthority(headers: Headers): HostAuthority;
  resolveRuntime(): Promise<PublicCheckoutRuntime | null>;
  now(): Date;
}>;

type CheckoutPageResult =
  | Readonly<{ kind: "active"; quote: CheckoutQuote }>
  | Readonly<{ kind: "not_found" | "unavailable" }>;

function validNow(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function response(code: CheckoutHttpError): Response {
  const status = code === "invalid_input" ? 400
    : code === "origin_denied" ? 403
      : code === "cart_not_found" ? 404
        : code === "processing" ? 202
          : code === "unavailable" ? 503
            : 409;
  return Response.json(Object.freeze({ code }), { status, headers: CHECKOUT_HEADERS });
}

function json(value: unknown): Response {
  return Response.json(value, { status: 200, headers: CHECKOUT_HEADERS });
}

function repositoryCode(error: unknown): CheckoutHttpError {
  const selected = publicRepositoryError(error);
  if (selected === null) return "unavailable";
  if (selected.code === "invalid_input") return "invalid_input";
  if (selected.code === "not_found") return "cart_not_found";
  if (selected.code === "version_conflict" || selected.code === "operation_mismatch") {
    return "cart_changed";
  }
  if (selected.code === "discount_invalid") return "discount_invalid";
  if (selected.code === "stock_unavailable") return "stock_unavailable";
  if (selected.code === "payment_method_unavailable") return "payment_unavailable";
  if (selected.code === "commit_unknown") return "processing";
  return "unavailable";
}

function publicRepositoryError(error: unknown): PublicCheckoutRepositoryError | null {
  try {
    return error instanceof PublicCheckoutRepositoryError ? error : null;
  } catch {
    return null;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deliveryFingerprint(input: Readonly<{
  hostname: string;
  credentialDigest: string;
  delivery: CheckoutDeliveryInput;
}>): string {
  const { delivery } = input;
  return sha256(JSON.stringify({
    action: "delivery",
    hostname: input.hostname,
    credentialDigest: input.credentialDigest,
    cartVersion: delivery.cartVersion,
    currentNonceDigest: sha256(delivery.checkoutNonce),
    operationId: delivery.operationId,
    email: delivery.email,
    marketingOptIn: delivery.marketingOptIn,
    shippingAddress: delivery.shippingAddress,
    billingAddress: delivery.billingAddress,
    shippingId: delivery.shippingId,
    discountCode: delivery.discountCode,
  }));
}

function submissionFingerprint(input: Readonly<{
  action: "submit_builtin" | "begin_hosted";
  hostname: string;
  credentialDigest: string;
  submission: CheckoutSubmitInput;
  attemptId?: string;
  callbackBindingDigest?: string;
}>): string {
  return sha256(JSON.stringify({
    action: input.action,
    hostname: input.hostname,
    credentialDigest: input.credentialDigest,
    cartVersion: input.submission.cartVersion,
    currentNonceDigest: sha256(input.submission.checkoutNonce),
    operationId: input.submission.operationId,
    paymentMethodId: input.submission.paymentMethodId,
    consents: input.submission.consents,
    ...(input.action === "begin_hosted" ? {
      attemptId: input.attemptId,
      callbackBindingDigest: input.callbackBindingDigest,
      identityNumberDigest: input.submission.identityNumber === null
        ? null
        : sha256(input.submission.identityNumber),
    } : {}),
  }));
}

function uuidFromDigest(digest: string): string {
  const bytes = Buffer.from(digest.slice(0, 32), "hex");
  try {
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } finally {
    bytes.fill(0);
  }
}

function hostedAttemptId(
  hostname: string,
  credentialDigest: string,
  operationId: string,
): string {
  return uuidFromDigest(sha256(JSON.stringify([
    "celebix-storefront-checkout",
    1,
    "hosted-attempt",
    hostname,
    credentialDigest,
    operationId,
  ])));
}

async function recoverUnknown(input: Readonly<{
  repository: PublicCheckoutRepository;
  hostname: string;
  credentialDigest: string;
  operationId: string;
  fingerprint: string;
  checkoutNonce: string;
  now: Date;
}>): Promise<unknown | null> {
  try {
    return await input.repository.recover({
      hostname: input.hostname,
      credentialDigest: input.credentialDigest,
      operationId: input.operationId,
      fingerprint: input.fingerprint,
      checkoutNonce: input.checkoutNonce,
      now: new Date(input.now),
    });
  } catch {
    return null;
  }
}

export async function resolveCheckoutPage(input: Readonly<{
  hostname: string;
  cookieHeader: string | null;
  now: Date;
  repository: PublicCheckoutRepository;
}>): Promise<CheckoutPageResult> {
  if (!validNow(input.now)) return Object.freeze({ kind: "unavailable" });
  const selected = readCartCredential(input.cookieHeader);
  if (selected.kind !== "present") return Object.freeze({ kind: "not_found" });
  let credentialDigest: string;
  try {
    credentialDigest = digestCartCredential(selected.credential);
  } catch {
    return Object.freeze({ kind: "not_found" });
  }
  try {
    const quote = parseCheckoutQuote(await input.repository.issueNonce({
      hostname: input.hostname,
      credentialDigest,
      now: new Date(input.now),
    }));
    return Object.freeze({ kind: "active", quote });
  } catch (error) {
    return Object.freeze({
      kind: publicRepositoryError(error)?.code === "not_found"
        ? "not_found"
        : "unavailable",
    });
  }
}

export function createPublicCheckoutHandlers(dependencies: HandlerDependencies) {
  function authority(request: Request): Readonly<{
    kind: "trusted";
    hostname: string;
  }> | null {
    try {
      const selected = dependencies.selectAuthority(request.headers);
      return selected.kind === "trusted" && typeof selected.hostname === "string"
        ? Object.freeze({ kind: "trusted", hostname: selected.hostname })
        : null;
    } catch {
      return null;
    }
  }

  async function runtimeAndNow(): Promise<Readonly<{
    runtime: PublicCheckoutRuntime;
    now: Date;
  }> | null> {
    try {
      const [runtime, now] = await Promise.all([
        dependencies.resolveRuntime(),
        Promise.resolve(dependencies.now()),
      ]);
      return runtime !== null && validNow(now)
        ? Object.freeze({ runtime, now: new Date(now) })
        : null;
    } catch {
      return null;
    }
  }

  async function quote(request: Request): Promise<Response> {
    const selectedHost = authority(request);
    if (selectedHost === null) return response("unavailable");
    const selected = readCheckoutCredentialRequest({
      request,
      hostname: selectedHost.hostname,
      pathname: "/api/checkout/quote",
      method: "GET",
      sameOrigin: false,
    });
    if (selected.kind !== "valid") return response(selected.code);
    const resolved = await runtimeAndNow();
    if (resolved === null) return response("unavailable");
    try {
      return json(parseCheckoutQuote(await resolved.runtime.checkout.issueNonce({
        hostname: selected.hostname,
        credentialDigest: selected.credentialDigest,
        now: new Date(resolved.now),
      })));
    } catch (error) {
      return response(repositoryCode(error));
    }
  }

  async function delivery(request: Request): Promise<Response> {
    const selectedHost = authority(request);
    if (selectedHost === null) return response("unavailable");
    const selected = await readCheckoutDeliveryRequest(request, selectedHost.hostname);
    if (selected.kind !== "valid") return response(selected.code);
    const resolved = await runtimeAndNow();
    if (resolved === null) return response("unavailable");
    try {
      return json(parseCheckoutQuote(await resolved.runtime.checkout.updateDelivery({
        hostname: selected.hostname,
        credentialDigest: selected.credentialDigest,
        delivery: selected.delivery,
        now: new Date(resolved.now),
      })));
    } catch (error) {
      if (publicRepositoryError(error)?.code === "commit_unknown") {
        await recoverUnknown({
          repository: resolved.runtime.checkout,
          hostname: selected.hostname,
          credentialDigest: selected.credentialDigest,
          operationId: selected.delivery.operationId,
          fingerprint: deliveryFingerprint(selected),
          checkoutNonce: selected.delivery.checkoutNonce,
          now: resolved.now,
        });
      }
      return response(repositoryCode(error));
    }
  }

  async function builtIn(input: Readonly<{
    runtime: PublicCheckoutRuntime;
    hostname: string;
    credentialDigest: string;
    submission: CheckoutSubmitInput;
    now: Date;
  }>): Promise<Response> {
    try {
      const result = await input.runtime.checkout.submitBuiltIn({
        hostname: input.hostname,
        credentialDigest: input.credentialDigest,
        submission: input.submission,
        now: new Date(input.now),
      });
      return result.kind === "placed"
        ? new Response(null, {
            status: 303,
            headers: Object.freeze({ ...CHECKOUT_HEADERS, Location: "/odeme/sonuc" }),
          })
        : response("unavailable");
    } catch (error) {
      if (publicRepositoryError(error)?.code === "commit_unknown") {
        const recovered = await recoverUnknown({
          repository: input.runtime.checkout,
          hostname: input.hostname,
          credentialDigest: input.credentialDigest,
          operationId: input.submission.operationId,
          fingerprint: submissionFingerprint({
            action: "submit_builtin",
            hostname: input.hostname,
            credentialDigest: input.credentialDigest,
            submission: input.submission,
          }),
          checkoutNonce: input.submission.checkoutNonce,
          now: input.now,
        });
        const placed = recovered as CheckoutSubmissionResult | null;
        if (placed?.kind === "placed") {
          return new Response(null, {
            status: 303,
            headers: Object.freeze({ ...CHECKOUT_HEADERS, Location: "/odeme/sonuc" }),
          });
        }
      }
      return response(repositoryCode(error));
    }
  }

  async function submit(request: Request): Promise<Response> {
    const selectedHost = authority(request);
    if (selectedHost === null) return response("unavailable");
    const selected = await readCheckoutSubmitRequest(request, selectedHost.hostname);
    if (selected.kind !== "valid") return response(selected.code);
    const resolved = await runtimeAndNow();
    if (resolved === null) return response("unavailable");
    if (resolved.runtime.hosted !== null) {
      const trustedClientIp = parseTrustedClientIp(request.headers.get("x-forwarded-for"));
      if (trustedClientIp === null) return response("invalid_input");
      const attemptId = hostedAttemptId(
        selected.hostname,
        selected.credentialDigest,
        selected.submission.operationId,
      );
      try {
        return await initializeHostedCartPayment({
          request,
          attemptId,
          trustedClientIp,
          runtime: resolved.runtime.hosted,
          begin: async ({ attemptId: suppliedAttemptId, callbackBindingDigest }) => {
            const fingerprint = submissionFingerprint({
              action: "begin_hosted",
              hostname: selected.hostname,
              credentialDigest: selected.credentialDigest,
              submission: selected.submission,
              attemptId: suppliedAttemptId,
              callbackBindingDigest,
            });
            try {
              return await resolved.runtime.checkout.beginHosted({
                hostname: selected.hostname,
                credentialDigest: selected.credentialDigest,
                submission: selected.submission,
                attemptId: suppliedAttemptId,
                callbackBindingDigest,
                now: new Date(resolved.now),
              });
            } catch (error) {
              if (publicRepositoryError(error)?.code === "commit_unknown") {
                const recovered = await recoverUnknown({
                  repository: resolved.runtime.checkout,
                  hostname: selected.hostname,
                  credentialDigest: selected.credentialDigest,
                  operationId: selected.submission.operationId,
                  fingerprint,
                  checkoutNonce: selected.submission.checkoutNonce,
                  now: resolved.now,
                });
                if (recovered !== null) {
                  return recovered as Awaited<ReturnType<PublicCheckoutRepository["beginHosted"]>>;
                }
              }
              throw error;
            }
          },
        });
      } catch (error) {
        const selectedError = publicRepositoryError(error);
        if (
          selectedError !== null
          && selectedError.code === "payment_method_unavailable"
        ) return builtIn({
          runtime: resolved.runtime,
          hostname: selected.hostname,
          credentialDigest: selected.credentialDigest,
          submission: selected.submission,
          now: resolved.now,
        });
        return response(repositoryCode(error));
      }
    }
    return builtIn({
      runtime: resolved.runtime,
      hostname: selected.hostname,
      credentialDigest: selected.credentialDigest,
      submission: selected.submission,
      now: resolved.now,
    });
  }

  async function status(request: Request): Promise<Response> {
    const selectedHost = authority(request);
    if (selectedHost === null) return response("unavailable");
    const selected = readCheckoutCredentialRequest({
      request,
      hostname: selectedHost.hostname,
      pathname: "/api/checkout/status",
      method: "GET",
      sameOrigin: false,
    });
    if (selected.kind !== "valid") return response(selected.code);
    const resolved = await runtimeAndNow();
    if (resolved === null) return response("unavailable");
    try {
      return json(parseCheckoutStatus(await resolved.runtime.checkout.getStatus({
        hostname: selected.hostname,
        credentialDigest: selected.credentialDigest,
        now: new Date(resolved.now),
      })));
    } catch (error) {
      return response(repositoryCode(error));
    }
  }

  return Object.freeze({ quote, delivery, submit, status });
}
