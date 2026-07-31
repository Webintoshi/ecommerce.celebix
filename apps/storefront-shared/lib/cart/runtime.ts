import type {
  PublicCart,
  PublicCheckoutQuote,
  PublicCheckoutReceipt,
} from "@celebix/saas-contracts";
import type { StorefrontCommerceRepository } from "@celebix/saas-data";

import {
  createStorefrontCredential,
  credentialDigestCandidates,
  readStorefrontCredentialCookie,
  serializeStorefrontCredentialCookie,
  type StorefrontCommerceCredentialKeyring,
} from "./credential.ts";
import type { CartCommand, CheckoutIntentKind, CheckoutRequest } from "./types.ts";

const EMPTY_CART: PublicCart = Object.freeze({
  version: 0,
  currency: "TRY",
  itemCount: 0,
  subtotalCents: 0,
  shippingCents: 0,
  totalCents: 0,
  checkoutReady: false,
  items: Object.freeze([]),
});

export class StorefrontCommerceRuntimeError extends Error {
  readonly code: "invalid_input" | "unavailable";
  constructor(code: "invalid_input" | "unavailable") { super(code); this.name = "StorefrontCommerceRuntimeError"; this.code = code; Object.freeze(this); }
}

export type StorefrontCommerceRuntime = Readonly<{
  resolveCart(hostname: string, cookieHeader: string | null): Promise<PublicCart>;
  mutateCart(hostname: string, cookieHeader: string | null, command: CartCommand): Promise<Readonly<{ cart?: PublicCart; destination?: "/checkout?intent=buy-now"; setCookie?: string }>>;
  quote(hostname: string, cookieHeader: string | null, intentKind: CheckoutIntentKind): Promise<PublicCheckoutQuote>;
  complete(hostname: string, cookieHeader: string | null, request: Extract<CheckoutRequest, { kind: "complete" }>): Promise<Readonly<{ receipt: PublicCheckoutReceipt; setCookies: readonly string[] }>>;
  getReceipt(hostname: string, cookieHeader: string | null): Promise<PublicCheckoutReceipt>;
  listAccountOrders(hostname: string, cookieHeader: string | null, limit: number): Promise<readonly PublicCheckoutReceipt[]>;
}>;

type Dependencies = Readonly<{
  repository: StorefrontCommerceRepository;
  keyring: StorefrontCommerceCredentialKeyring;
  now(): Date;
  randomBytes(size: number): Uint8Array;
  randomUuid(): string;
}>;

function date(dependencies: Dependencies): Date {
  const selected = dependencies.now();
  if (!(selected instanceof Date) || !Number.isFinite(selected.getTime())) throw new StorefrontCommerceRuntimeError("unavailable");
  return new Date(selected);
}
function purpose(intentKind: CheckoutIntentKind): "cart" | "intent" { return intentKind === "cart" ? "cart" : "intent"; }
function candidates(selectedPurpose: "cart" | "intent" | "receipt" | "customer", cookieHeader: string | null, keyring: StorefrontCommerceCredentialKeyring) {
  const cookie = readStorefrontCredentialCookie(selectedPurpose, cookieHeader);
  if (cookie.kind !== "present") throw new StorefrontCommerceRuntimeError("invalid_input");
  const selected = credentialDigestCandidates(selectedPurpose, cookie.value, keyring);
  if (selected.length < 1) throw new StorefrontCommerceRuntimeError("invalid_input");
  return selected;
}
function generated(dependencies: Dependencies, selectedPurpose: "cart" | "intent" | "receipt" | "customer", now: Date, lifetimeMs: number) {
  const credential = createStorefrontCredential(selectedPurpose, dependencies.keyring, dependencies.randomBytes);
  return Object.freeze({
    raw: credential.value,
    persisted: Object.freeze({ id: dependencies.randomUuid(), keyId: credential.keyId, digest: credential.digest, expiresAt: new Date(now.getTime() + lifetimeMs) }),
  });
}
function delivery(request: Extract<CheckoutRequest, { kind: "complete" }>) {
  const split = request.contact.name.lastIndexOf(" ");
  const firstName = split > 0 ? request.contact.name.slice(0, split) : request.contact.name;
  const lastName = split > 0 ? request.contact.name.slice(split + 1) : "-";
  const digits = request.contact.phone.replace(/[^0-9+]/gu, "");
  const phone = digits.startsWith("+") ? digits : digits.startsWith("0") ? `+90${digits.slice(1)}` : `+${digits}`;
  return Object.freeze({
    contact: Object.freeze({ firstName, lastName, email: request.contact.email, phone }),
    shippingAddress: Object.freeze({
      line1: request.shippingAddress.addressLine1,
      ...(request.shippingAddress.addressLine2 ? { line2: request.shippingAddress.addressLine2 } : {}),
      city: request.shippingAddress.city,
      district: request.shippingAddress.district,
      postalCode: request.shippingAddress.postalCode,
      country: "TR" as const,
    }),
    ...(request.note ? { note: request.note } : {}),
  });
}

export function createStorefrontCommerceRuntime(dependencies: Dependencies): StorefrontCommerceRuntime {
  return Object.freeze({
    async resolveCart(hostname, cookieHeader) {
      const cookie = readStorefrontCredentialCookie("cart", cookieHeader);
      if (cookie.kind === "missing") return EMPTY_CART;
      if (cookie.kind === "invalid") throw new StorefrontCommerceRuntimeError("invalid_input");
      const selected = credentialDigestCandidates("cart", cookie.value, dependencies.keyring);
      if (selected.length < 1) throw new StorefrontCommerceRuntimeError("invalid_input");
      return dependencies.repository.resolveCart({ hostname, now: date(dependencies), candidates: selected });
    },
    async mutateCart(hostname, cookieHeader, command) {
      const now = date(dependencies);
      if (command.kind === "buy_now") {
        const intent = generated(dependencies, "intent", now, 15 * 60_000);
        await dependencies.repository.createBuyNow({ hostname, now, intent: intent.persisted, productId: command.productId, variantId: command.variantId, quantity: command.quantity });
        return Object.freeze({ destination: "/checkout?intent=buy-now" as const, setCookie: serializeStorefrontCredentialCookie("intent", intent.raw) });
      }
      const cookie = readStorefrontCredentialCookie("cart", cookieHeader);
      if (cookie.kind === "invalid") throw new StorefrontCommerceRuntimeError("invalid_input");
      const isNew = cookie.kind === "missing";
      if (isNew && command.kind !== "add") throw new StorefrontCommerceRuntimeError("invalid_input");
      let selectedCandidates = Object.freeze([]) as ReturnType<typeof credentialDigestCandidates>;
      let existingCart: PublicCart | undefined;
      let cartCredential: ReturnType<typeof generated> | undefined;
      if (cookie.kind === "present") {
        selectedCandidates = credentialDigestCandidates("cart", cookie.value, dependencies.keyring);
        if (selectedCandidates.length < 1) throw new StorefrontCommerceRuntimeError("invalid_input");
        existingCart = await dependencies.repository.resolveCart({ hostname, now, candidates: selectedCandidates });
      } else {
        cartCredential = generated(dependencies, "cart", now, 30 * 86_400_000);
      }
      const line = command.kind === "add" ? undefined : existingCart?.items.find(({ variantId }) => variantId === command.variantId);
      if (command.kind !== "add" && !line) throw new StorefrontCommerceRuntimeError("invalid_input");
      const result = await dependencies.repository.mutateCart({
        hostname, now, candidates: selectedCandidates,
        ...(cartCredential ? { cart: cartCredential.persisted } : {}),
        operationId: command.operationId,
        action: command.kind === "set_quantity" ? "quantity" : command.kind,
        expectedVersion: command.kind === "add" ? (command.expectedVersion ?? existingCart?.version ?? 0) : command.expectedVersion,
        productId: command.kind === "add" ? command.productId : line!.productId,
        variantId: command.variantId,
        ...(command.kind === "remove" ? {} : { quantity: command.quantity }),
      });
      if (Boolean(cartCredential) !== result.credentialCreated) throw new StorefrontCommerceRuntimeError("unavailable");
      return Object.freeze({ cart: result.cart, ...(cartCredential ? { setCookie: serializeStorefrontCredentialCookie("cart", cartCredential.raw) } : {}) });
    },
    async quote(hostname, cookieHeader, intentKind) {
      return dependencies.repository.quote({ hostname, now: date(dependencies), intentKind, candidates: candidates(purpose(intentKind), cookieHeader, dependencies.keyring) });
    },
    async complete(hostname, cookieHeader, request) {
      const now = date(dependencies);
      const intentCandidates = candidates(purpose(request.intentKind), cookieHeader, dependencies.keyring);
      const receipt = generated(dependencies, "receipt", now, 15 * 60_000);
      const customer = generated(dependencies, "customer", now, 30 * 86_400_000);
      const result = await dependencies.repository.complete({
        hostname, now, intentKind: request.intentKind, candidates: intentCandidates,
        operationId: request.operationId, cartVersion: request.cartVersion,
        delivery: delivery(request), paymentKind: request.paymentKind,
        generated: Object.freeze({
          orderId: dependencies.randomUuid(), customerId: dependencies.randomUuid(), addressId: dependencies.randomUuid(), eventId: dependencies.randomUuid(),
          receipt: receipt.persisted, customer: customer.persisted,
        }),
      });
      return Object.freeze({ receipt: result, setCookies: Object.freeze([serializeStorefrontCredentialCookie("customer", customer.raw), serializeStorefrontCredentialCookie("receipt", receipt.raw)]) });
    },
    async getReceipt(hostname, cookieHeader) {
      return dependencies.repository.getReceipt({ hostname, now: date(dependencies), candidates: candidates("receipt", cookieHeader, dependencies.keyring) });
    },
    async listAccountOrders(hostname, cookieHeader, limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new StorefrontCommerceRuntimeError("invalid_input");
      return dependencies.repository.listAccountOrders({ hostname, now: date(dependencies), candidates: candidates("customer", cookieHeader, dependencies.keyring), limit });
    },
  });
}
