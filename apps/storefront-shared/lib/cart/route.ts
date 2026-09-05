import {
  StorefrontCommerceRepositoryError,
  StorefrontHostedCheckoutRepositoryError,
} from "@celebix/saas-data";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import {
  StandardHostedCheckoutRuntimeError,
  type StandardHostedCheckoutRuntime,
} from "../checkout/standard-hosted-payment.ts";
import { readCartMutationRequest, readCheckoutRequest } from "./request.ts";
import {
  StorefrontCommerceRuntimeError,
  type StorefrontCommerceRuntime,
} from "./runtime.ts";

type Dependencies = Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRuntime(): Promise<Pick<
    StorefrontCommerceRuntime,
    "resolveCart" | "mutateCart" | "quote" | "complete"
  > | null>;
}>;
type RecoveryDependencies = Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRuntime(): Promise<Pick<
    StorefrontCommerceRuntime,
    "restoreCart"
  > | null>;
}>;
type HostedDependencies = Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRuntime(): Promise<Pick<
    StandardHostedCheckoutRuntime,
    "start"
  > | null>;
  audit?(
    event: Readonly<{
      stage:
        | "authority_unavailable"
        | "request_invalid"
        | "runtime_unavailable"
        | "runtime_failure"
        | "destination_invalid";
      code?: string;
    }>,
  ): void;
}>;

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  const selected = new Headers(headers);
  selected.set("cache-control", "no-store");
  selected.set("x-content-type-options", "nosniff");
  return Response.json(body, { status, headers: selected });
}
function authority(
  dependencies: Readonly<{
    selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  }>,
  request: Request,
): Readonly<{ hostname: string; origin: string }> | null {
  try {
    const selected = dependencies.selectAuthority(request.headers);
    return selected.kind === "trusted"
      ? Object.freeze({
          hostname: selected.hostname,
          origin: `https://${selected.hostname}`,
        })
      : null;
  } catch {
    return null;
  }
}
function safeErrorCode(error: unknown): string | undefined {
  if (
    error instanceof StorefrontCommerceRepositoryError ||
    error instanceof StorefrontHostedCheckoutRepositoryError ||
    error instanceof StorefrontCommerceRuntimeError ||
    error instanceof StandardHostedCheckoutRuntimeError
  )
    return error.code;
  return undefined;
}
function failure(error: unknown): Response {
  const code = safeErrorCode(error) ?? "unavailable";
  if (code === "invalid_input") return json({ code }, 400);
  if (code === "not_found") return json({ code }, 404);
  if (
    [
      "cart_expired",
      "version_conflict",
      "cart_empty",
      "price_changed",
      "stock_unavailable",
      "shipping_unavailable",
      "payment_unavailable",
      "operation_mismatch",
    ].includes(code)
  )
    return json({ code }, 409);
  return json({ code: "unavailable" }, 503);
}
async function runtime<T>(
  dependencies: Readonly<{ resolveRuntime(): Promise<T | null> }>,
): Promise<T | null> {
  try {
    return await dependencies.resolveRuntime();
  } catch {
    return null;
  }
}
function hostedAudit(
  dependencies: HostedDependencies,
  stage: Parameters<NonNullable<HostedDependencies["audit"]>>[0]["stage"],
  code?: string,
): void {
  try {
    dependencies.audit?.(Object.freeze({ stage, ...(code ? { code } : {}) }));
  } catch {
    /* diagnostics cannot affect checkout */
  }
}

export function createCartGetRoute(dependencies: Dependencies) {
  return async function GET(request: Request): Promise<Response> {
    const selected = authority(dependencies, request);
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return json({ code: "invalid_input" }, 400);
    }
    if (!selected) return json({ code: "unavailable" }, 503);
    if (
      request.method !== "GET" ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/api/cart" ||
      url.search ||
      url.hash
    )
      return json({ code: "invalid_input" }, 400);
    const selectedRuntime = await runtime(dependencies);
    if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try {
      const result = await selectedRuntime.resolveCart(
        selected.hostname,
        request.headers.get("cookie"),
      );
      return json(
        { cart: result.cart },
        200,
        result.setCookie ? { "set-cookie": result.setCookie } : undefined,
      );
    } catch (error) {
      return failure(error);
    }
  };
}

export function createCartRecoveryRoute(dependencies: RecoveryDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request);
    if (!selected) return json({ code: "unavailable" }, 503);
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return json({ code: "invalid_input" }, 400);
    }
    if (
      request.method !== "POST" ||
      url.pathname !== "/api/cart/recover" ||
      url.search ||
      url.hash ||
      request.headers.get("origin") !== selected.origin ||
      request.headers.get("content-type") !== "application/json" ||
      request.body === null
    )
      return json({ code: "invalid_input" }, 400);
    let token = "";
    try {
      const declared = request.headers.get("content-length");
      if (
        declared !== null &&
        (!/^[1-9][0-9]{0,2}$/.test(declared) || Number(declared) > 128)
      )
        throw Error();
      const body = await request.json();
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).join(",") !== "token" ||
        !/^[A-Za-z0-9_-]{43}$/.test(
          String((body as Record<string, unknown>).token),
        )
      )
        throw Error();
      token = String((body as Record<string, unknown>).token);
    } catch {
      return json({ code: "invalid_input" }, 400, {
        "referrer-policy": "no-referrer",
      });
    }
    const selectedRuntime = await runtime(dependencies);
    if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try {
      const result = await selectedRuntime.restoreCart(
        selected.hostname,
        token,
      );
      const location = `/cart?recovered=1&omitted=${result.omittedItems}&adjusted=${result.adjustedItems}`;
      return json({ location }, 200, {
        "set-cookie": result.setCookie,
        "referrer-policy": "no-referrer",
      });
    } catch (caught) {
      return failure(caught);
    }
  };
}

export function createCartActionRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request);
    if (!selected) return json({ code: "unavailable" }, 503);
    let command;
    try {
      command = await readCartMutationRequest(request, selected.origin);
    } catch {
      return json({ code: "invalid_input" }, 400);
    }
    const selectedRuntime = await runtime(dependencies);
    if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try {
      const result = await selectedRuntime.mutateCart(
        selected.hostname,
        request.headers.get("cookie"),
        command,
      );
      const headers = new Headers();
      if (result.setCookie) headers.set("set-cookie", result.setCookie);
      return command.kind === "buy_now"
        ? json({ destination: result.destination }, 200, headers)
        : json({ cart: result.cart }, 200, headers);
    } catch (error) {
      return failure(error);
    }
  };
}

export function createCheckoutQuoteRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request);
    if (!selected) return json({ code: "unavailable" }, 503);
    let input;
    try {
      input = await readCheckoutRequest(request, selected.origin);
    } catch {
      return json({ code: "invalid_input" }, 400);
    }
    if (input.kind !== "quote") return json({ code: "invalid_input" }, 400);
    const selectedRuntime = await runtime(dependencies);
    if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try {
      return json(
        {
          quote: await selectedRuntime.quote(
            selected.hostname,
            request.headers.get("cookie"),
            input.intentKind,
            input.attribution,
            input.normalizedCodes,
          ),
        },
        200,
      );
    } catch (error) {
      return failure(error);
    }
  };
}

export function createCheckoutCompleteRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request);
    if (!selected) return json({ code: "unavailable" }, 503);
    let input;
    try {
      input = await readCheckoutRequest(request, selected.origin);
    } catch {
      return json({ code: "invalid_input" }, 400);
    }
    if (input.kind !== "complete") return json({ code: "invalid_input" }, 400);
    const selectedRuntime = await runtime(dependencies);
    if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try {
      const result = await selectedRuntime.complete(
        selected.hostname,
        request.headers.get("cookie"),
        input,
      );
      const headers = new Headers({
        "cache-control": "no-store",
        location: "/checkout/success",
        "x-content-type-options": "nosniff",
      });
      for (const cookie of result.setCookies)
        headers.append("set-cookie", cookie);
      return new Response(null, { status: 303, headers });
    } catch (error) {
      return failure(error);
    }
  };
}

export function createHostedCheckoutStartRoute(
  dependencies: HostedDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request);
    if (!selected) {
      hostedAudit(dependencies, "authority_unavailable");
      return json({ code: "unavailable" }, 503);
    }
    let input;
    try {
      input = await readCheckoutRequest(request, selected.origin);
    } catch {
      hostedAudit(dependencies, "request_invalid");
      return json({ code: "invalid_input" }, 400);
    }
    if (input.kind !== "hosted_start") {
      hostedAudit(dependencies, "request_invalid");
      return json({ code: "invalid_input" }, 400);
    }
    const selectedRuntime = await runtime(dependencies);
    if (!selectedRuntime) {
      hostedAudit(dependencies, "runtime_unavailable");
      return json({ code: "unavailable" }, 503);
    }
    try {
      const result = await selectedRuntime.start({
        hostname: selected.hostname,
        cookieHeader: request.headers.get("cookie"),
        headers: new Headers(request.headers),
        request: input,
      });
      if (result.destination !== "/checkout/payment") {
        hostedAudit(dependencies, "destination_invalid");
        return json({ code: "unavailable" }, 503);
      }
      const headers = new Headers();
      for (const cookie of result.setCookies)
        headers.append("set-cookie", cookie);
      return json({ destination: "/checkout/payment" }, 200, headers);
    } catch (error) {
      hostedAudit(dependencies, "runtime_failure", safeErrorCode(error));
      return failure(error);
    }
  };
}
