"use client";

import {
  parsePublicCart,
  parsePublicCheckoutQuote,
  type PublicCart,
  type PublicCheckoutQuote,
} from "@celebix/saas-contracts";
import type { StorefrontCartClient } from "./types.ts";
import { readCommerceAttribution } from "../analytics/attribution.ts";

const MAXIMUM = 524_288;
type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type PublicCartClientFailure =
  | "cart_empty"
  | "price_changed"
  | "stock_unavailable"
  | "shipping_unavailable"
  | "payment_unavailable";
type StorefrontCartClientErrorCode =
  "invalid_response" | "request_failed" | PublicCartClientFailure;
const PUBLIC_FAILURES = new Set<PublicCartClientFailure>([
  "cart_empty",
  "price_changed",
  "stock_unavailable",
  "shipping_unavailable",
  "payment_unavailable",
]);

export class StorefrontCartClientError extends Error {
  constructor(readonly code: StorefrontCartClientErrorCode) {
    super(code);
    this.name = "StorefrontCartClientError";
  }
}
function exact(
  value: unknown,
  required: readonly string[],
): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return null;
  const keys = Object.keys(value);
  return keys.length === required.length &&
    required.every((key) => Object.hasOwn(value, key))
    ? (value as Record<string, unknown>)
    : null;
}
function cart(value: unknown): PublicCart {
  try {
    return parsePublicCart(value);
  } catch {
    throw new StorefrontCartClientError("invalid_response");
  }
}
function quote(value: unknown): PublicCheckoutQuote {
  try {
    return parsePublicCheckoutQuote(value);
  } catch {
    throw new StorefrontCartClientError("invalid_response");
  }
}
function publicFailure(value: unknown): PublicCartClientFailure | null {
  const row = exact(value, ["code"]);
  return row &&
    typeof row.code === "string" &&
    PUBLIC_FAILURES.has(row.code as PublicCartClientFailure)
    ? (row.code as PublicCartClientFailure)
    : null;
}
async function payload(response: Response): Promise<unknown> {
  if (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json" ||
    response.body === null
  )
    throw new StorefrontCartClientError("invalid_response");
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > MAXIMUM)
  )
    throw new StorefrontCartClientError("invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM) {
        await reader.cancel().catch(() => undefined);
        throw new StorefrontCartClientError("invalid_response");
      }
      chunks.push(new Uint8Array(next.value));
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } finally {
      bytes.fill(0);
    }
  } catch (error) {
    if (error instanceof StorefrontCartClientError) throw error;
    throw new StorefrontCartClientError("invalid_response");
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

export function createStorefrontCartClient(
  fetcher: Fetcher = fetch,
  uuid: () => string = crypto.randomUUID.bind(crypto),
): StorefrontCartClient {
  async function call(path: string, body?: unknown, method = "POST") {
    try {
      const response = await fetcher(path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        ...(body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      const value = await payload(response);
      if (!response.ok)
        throw new StorefrontCartClientError(
          publicFailure(value) ?? "request_failed",
        );
      return value;
    } catch (error) {
      if (error instanceof StorefrontCartClientError) throw error;
      throw new StorefrontCartClientError("request_failed");
    }
  }
  const mutation = async (path: string, body: Record<string, unknown>) => {
    const root = exact(
      await call(path, { ...body, attribution: readCommerceAttribution() }),
      ["cart"],
    );
    if (!root) throw new StorefrontCartClientError("invalid_response");
    return cart(root.cart);
  };
  return Object.freeze({
    async resolve() {
      const root = exact(await call("/api/cart", undefined, "GET"), ["cart"]);
      if (!root) throw new StorefrontCartClientError("invalid_response");
      return cart(root.cart);
    },
    async add(input) {
      return mutation("/api/cart/add", { operationId: uuid(), ...input });
    },
    async setQuantity(input) {
      return mutation("/api/cart/quantity", { operationId: uuid(), ...input });
    },
    async remove(input) {
      return mutation("/api/cart/remove", { operationId: uuid(), ...input });
    },
    async buyNow(input) {
      const root = exact(
        await call("/api/cart/buy-now", {
          operationId: uuid(),
          ...input,
          attribution: readCommerceAttribution(),
        }),
        ["destination"],
      );
      if (!root || root.destination !== "/checkout?intent=buy-now")
        throw new StorefrontCartClientError("invalid_response");
      return Object.freeze({
        destination: "/checkout?intent=buy-now" as const,
      });
    },
    async quote(intentKind) {
      const root = exact(
        await call("/api/checkout/quote", {
          intentKind,
          attribution: readCommerceAttribution(),
        }),
        ["quote"],
      );
      if (!root) throw new StorefrontCartClientError("invalid_response");
      return quote(root.quote);
    },
    async startHosted(input) {
      const root = exact(
        await call("/api/checkout/payment/start", {
          operationId: uuid(),
          ...input,
        }),
        ["destination"],
      );
      if (!root || root.destination !== "/checkout/payment")
        throw new StorefrontCartClientError("invalid_response");
      return Object.freeze({ destination: "/checkout/payment" as const });
    },
  });
}

export const storefrontCartClient = createStorefrontCartClient();

type CartAddInput = Parameters<StorefrontCartClient["add"]>[0];

export async function addCartLineAndOpenDrawer<TTrigger>(
  input: CartAddInput,
  trigger: TTrigger,
  dependencies: Readonly<{
    add(value: CartAddInput): Promise<PublicCart>;
    openDrawer(value: TTrigger): void;
    replaceCart(value: PublicCart): void;
  }>,
): Promise<PublicCart> {
  dependencies.openDrawer(trigger);
  const nextCart = await dependencies.add(input);
  dependencies.replaceCart(nextCart);
  return nextCart;
}
