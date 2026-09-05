import { createHash } from "node:crypto";

import type {
  PublicCart,
  PublicCheckoutQuote,
  PublicCheckoutQuoteV2,
  PublicCheckoutReceipt,
  PublicCheckoutReceiptV2,
  PublicPaymentMethod,
} from "@celebix/saas-contracts";
import { normalizePromotionCode } from "@celebix/saas-contracts";
import type { StorefrontCommerceRepository } from "@celebix/saas-data";
import { StorefrontCommerceRepositoryError } from "@celebix/saas-data";

import {
  createStorefrontCredential,
  createStorefrontRecoveryCartCredential,
  createStorefrontOperationCredential,
  credentialDigestCandidates,
  readStorefrontCredentialCookie,
  serializeStorefrontCredentialDeletionCookie,
  serializeStorefrontCredentialCookie,
  type StorefrontCommerceCredentialKeyring,
} from "./credential.ts";
import type {
  CartCommand,
  CheckoutIntentKind,
  CheckoutRequest,
} from "./types.ts";

const EMPTY_CART: PublicCart = Object.freeze({
  version: 0,
  currency: "TRY",
  itemCount: 0,
  subtotalCents: 0,
  shippingCents: 0,
  totalCents: 0,
  checkoutReady: false,
  checkoutBlocker: "empty_cart",
  items: Object.freeze([]),
});

export class StorefrontCommerceRuntimeError extends Error {
  readonly code: "invalid_input" | "unavailable";
  constructor(code: "invalid_input" | "unavailable") {
    super(code);
    this.name = "StorefrontCommerceRuntimeError";
    this.code = code;
    Object.freeze(this);
  }
}

export type StorefrontCommerceRuntime = Readonly<{
  restoreCart(
    hostname: string,
    token: string,
  ): Promise<
    Readonly<{
      cart: PublicCart;
      restoredItems: number;
      omittedItems: number;
      adjustedItems: number;
      setCookie: string;
    }>
  >;
  resolveCart(
    hostname: string,
    cookieHeader: string | null,
  ): Promise<Readonly<{ cart: PublicCart; setCookie?: string }>>;
  mutateCart(
    hostname: string,
    cookieHeader: string | null,
    command: CartCommand,
  ): Promise<
    Readonly<{
      cart?: PublicCart;
      destination?: "/checkout?intent=buy-now";
      setCookie?: string;
    }>
  >;
  quote(
    hostname: string,
    cookieHeader: string | null,
    intentKind: CheckoutIntentKind,
    attribution?: Extract<CheckoutRequest, { kind: "quote" }>["attribution"],
    normalizedCodes?: readonly string[],
  ): Promise<PublicCheckoutQuote | PublicCheckoutQuoteV2>;
  complete(
    hostname: string,
    cookieHeader: string | null,
    request: Extract<CheckoutRequest, { kind: "complete" }>,
  ): Promise<
    Readonly<{
      receipt: PublicCheckoutReceipt | PublicCheckoutReceiptV2;
      setCookies: readonly string[];
    }>
  >;
  getReceipt(
    hostname: string,
    cookieHeader: string | null,
  ): Promise<PublicCheckoutReceipt | PublicCheckoutReceiptV2>;
  listAccountOrders(
    hostname: string,
    cookieHeader: string | null,
    limit: number,
  ): Promise<readonly (PublicCheckoutReceipt | PublicCheckoutReceiptV2)[]>;
}>;

type Dependencies = Readonly<{
  repository: StorefrontCommerceRepository;
  keyring: StorefrontCommerceCredentialKeyring;
  now(): Date;
  randomBytes(size: number): Uint8Array;
  randomUuid(): string;
  hostedPaymentAvailable?(
    method: Extract<PublicPaymentMethod, { kind: "hosted_card" }>,
  ): Promise<boolean>;
}>;

function date(dependencies: Dependencies): Date {
  const selected = dependencies.now();
  if (!(selected instanceof Date) || !Number.isFinite(selected.getTime()))
    throw new StorefrontCommerceRuntimeError("unavailable");
  return new Date(selected);
}
function purpose(intentKind: CheckoutIntentKind): "cart" | "intent" {
  return intentKind === "cart" ? "cart" : "intent";
}
function candidates(
  selectedPurpose: "cart" | "intent" | "receipt" | "customer",
  cookieHeader: string | null,
  keyring: StorefrontCommerceCredentialKeyring,
) {
  const cookie = readStorefrontCredentialCookie(selectedPurpose, cookieHeader);
  if (cookie.kind !== "present")
    throw new StorefrontCommerceRuntimeError("invalid_input");
  const selected = credentialDigestCandidates(
    selectedPurpose,
    cookie.value,
    keyring,
  );
  if (selected.length < 1)
    throw new StorefrontCommerceRuntimeError("invalid_input");
  return selected;
}
function generated(
  dependencies: Dependencies,
  selectedPurpose: "cart" | "intent" | "receipt" | "customer",
  now: Date,
  lifetimeMs: number,
) {
  const credential = createStorefrontCredential(
    selectedPurpose,
    dependencies.keyring,
    dependencies.randomBytes,
  );
  return Object.freeze({
    raw: credential.value,
    persisted: Object.freeze({
      id: dependencies.randomUuid(),
      keyId: credential.keyId,
      digest: credential.digest,
      expiresAt: new Date(now.getTime() + lifetimeMs),
    }),
  });
}
function operationGenerated(
  dependencies: Dependencies,
  selectedPurpose: "receipt" | "customer",
  operationId: string,
  now: Date,
  lifetimeMs: number,
) {
  const credential = createStorefrontOperationCredential(
    selectedPurpose,
    operationId,
    dependencies.keyring,
  );
  return Object.freeze({
    raw: credential.value,
    persisted: Object.freeze({
      id: dependencies.randomUuid(),
      keyId: credential.keyId,
      digest: credential.digest,
      expiresAt: new Date(now.getTime() + lifetimeMs),
    }),
  });
}
function derivedV2Uuid(
  selectedPurpose:
    | "order"
    | "customer"
    | "address"
    | "event"
    | "receipt"
    | "customer-credential",
  hostname: string,
  operationId: string,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "celebix-storefront-checkout",
        2,
        selectedPurpose,
        hostname,
        operationId,
      ]),
      "utf8",
    )
    .digest();
  try {
    digest[6] = (digest[6]! & 0x0f) | 0x40;
    digest[8] = (digest[8]! & 0x3f) | 0x80;
    const hex = digest.subarray(0, 16).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } finally {
    digest.fill(0);
  }
}
function operationGeneratedV2(
  dependencies: Dependencies,
  selectedPurpose: "receipt" | "customer",
  idPurpose: "receipt" | "customer-credential",
  hostname: string,
  operationId: string,
  now: Date,
  lifetimeMs: number,
) {
  const credential = createStorefrontOperationCredential(
    selectedPurpose,
    operationId,
    dependencies.keyring,
  );
  return Object.freeze({
    raw: credential.value,
    persisted: Object.freeze({
      id: derivedV2Uuid(idPurpose, hostname, operationId),
      keyId: credential.keyId,
      digest: credential.digest,
      expiresAt: new Date(now.getTime() + lifetimeMs),
    }),
  });
}
function promotionCodes(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 5
  )
    throw new StorefrontCommerceRuntimeError("invalid_input");
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1)
    throw new StorefrontCommerceRuntimeError("invalid_input");
  const output: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new StorefrontCommerceRuntimeError("invalid_input");
    let normalized: string;
    try {
      normalized = normalizePromotionCode(descriptor.value);
    } catch {
      throw new StorefrontCommerceRuntimeError("invalid_input");
    }
    if (normalized !== descriptor.value || seen.has(normalized))
      throw new StorefrontCommerceRuntimeError("invalid_input");
    seen.add(normalized);
    output.push(normalized);
  }
  return Object.freeze(output);
}
function optionalCandidates(
  selectedPurpose: "customer",
  cookieHeader: string | null,
  keyring: StorefrontCommerceCredentialKeyring,
) {
  const cookie = readStorefrontCredentialCookie(selectedPurpose, cookieHeader);
  if (cookie.kind !== "present") return Object.freeze([]);
  return credentialDigestCandidates(selectedPurpose, cookie.value, keyring);
}
function delivery(request: Extract<CheckoutRequest, { kind: "complete" }>) {
  const normalizedName = request.contact.name.trim().replace(/ +/gu, " ");
  const split = normalizedName.lastIndexOf(" ");
  const firstName = split > 0 ? normalizedName.slice(0, split) : normalizedName;
  const lastName = split > 0 ? normalizedName.slice(split + 1) : "-";
  const digits = request.contact.phone.replace(/[^0-9+]/gu, "");
  const phone = digits.startsWith("+")
    ? digits
    : digits.startsWith("0")
      ? `+90${digits.slice(1)}`
      : `+${digits}`;
  return Object.freeze({
    contact: Object.freeze({
      firstName,
      lastName,
      email: request.contact.email,
      phone,
    }),
    shippingAddress: Object.freeze({
      line1: request.shippingAddress.addressLine1,
      ...(request.shippingAddress.addressLine2
        ? { line2: request.shippingAddress.addressLine2 }
        : {}),
      city: request.shippingAddress.city,
      district: request.shippingAddress.district,
      ...(request.shippingAddress.postalCode
        ? { postalCode: request.shippingAddress.postalCode }
        : {}),
      country: "TR" as const,
    }),
    ...(request.note ? { note: request.note } : {}),
  });
}

export function createStorefrontCommerceRuntime(
  dependencies: Dependencies,
): StorefrontCommerceRuntime {
  return Object.freeze({
    async restoreCart(hostname, token) {
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new StorefrontCommerceRuntimeError("invalid_input");
      const now = date(dependencies);
      const credential = createStorefrontRecoveryCartCredential(
        token,
        dependencies.keyring,
      );
      const digest = createHash("sha256")
        .update(`celebix\0cart-recovery-id\0${token}`, "utf8")
        .digest();
      digest[6] = (digest[6]! & 0x0f) | 0x40;
      digest[8] = (digest[8]! & 0x3f) | 0x80;
      const hex = digest.subarray(0, 16).toString("hex");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      digest.fill(0);
      const tokenDigest = createHash("sha256")
        .update(token, "utf8")
        .digest("hex");
      const result = await dependencies.repository.restoreCart({
        hostname,
        now,
        tokenDigest,
        cart: {
          id,
          keyId: credential.keyId,
          digest: credential.digest,
          expiresAt: new Date(now.getTime() + 30 * 86_400_000),
        },
      });
      return Object.freeze({
        ...result,
        setCookie: serializeStorefrontCredentialCookie(
          "cart",
          credential.value,
        ),
      });
    },
    async resolveCart(hostname, cookieHeader) {
      const cookie = readStorefrontCredentialCookie("cart", cookieHeader);
      if (cookie.kind === "missing") return Object.freeze({ cart: EMPTY_CART });
      if (cookie.kind === "invalid")
        return Object.freeze({
          cart: EMPTY_CART,
          setCookie: serializeStorefrontCredentialDeletionCookie("cart"),
        });
      const selected = credentialDigestCandidates(
        "cart",
        cookie.value,
        dependencies.keyring,
      );
      if (selected.length < 1)
        return Object.freeze({
          cart: EMPTY_CART,
          setCookie: serializeStorefrontCredentialDeletionCookie("cart"),
        });
      try {
        return Object.freeze({
          cart: await dependencies.repository.resolveCart({
            hostname,
            now: date(dependencies),
            candidates: selected,
          }),
        });
      } catch (error) {
        if (
          error instanceof StorefrontCommerceRepositoryError &&
          (error.code === "not_found" || error.code === "cart_expired")
        )
          return Object.freeze({
            cart: EMPTY_CART,
            setCookie: serializeStorefrontCredentialDeletionCookie("cart"),
          });
        throw error;
      }
    },
    async mutateCart(hostname, cookieHeader, command) {
      const now = date(dependencies);
      if (command.kind === "buy_now") {
        const intent = generated(dependencies, "intent", now, 15 * 60_000);
        await dependencies.repository.createBuyNow({
          hostname,
          now,
          intent: intent.persisted,
          productId: command.productId,
          variantId: command.variantId,
          quantity: command.quantity,
          ...(command.attribution ? { attribution: command.attribution } : {}),
        });
        return Object.freeze({
          destination: "/checkout?intent=buy-now" as const,
          setCookie: serializeStorefrontCredentialCookie("intent", intent.raw),
        });
      }
      const cookie = readStorefrontCredentialCookie("cart", cookieHeader);
      const recoverableAdd = command.kind === "add";
      const isNew =
        cookie.kind === "missing" ||
        (recoverableAdd && cookie.kind === "invalid");
      if (cookie.kind === "invalid" && !recoverableAdd)
        throw new StorefrontCommerceRuntimeError("invalid_input");
      if (isNew && command.kind !== "add")
        throw new StorefrontCommerceRuntimeError("invalid_input");
      let selectedCandidates = Object.freeze([]) as ReturnType<
        typeof credentialDigestCandidates
      >;
      let existingCart: PublicCart | undefined;
      let cartCredential: ReturnType<typeof generated> | undefined;
      if (cookie.kind === "present") {
        selectedCandidates = credentialDigestCandidates(
          "cart",
          cookie.value,
          dependencies.keyring,
        );
        if (selectedCandidates.length < 1) {
          if (!recoverableAdd)
            throw new StorefrontCommerceRuntimeError("invalid_input");
          selectedCandidates = Object.freeze([]);
          cartCredential = generated(
            dependencies,
            "cart",
            now,
            30 * 86_400_000,
          );
        } else {
          try {
            existingCart = await dependencies.repository.resolveCart({
              hostname,
              now,
              candidates: selectedCandidates,
            });
          } catch (error) {
            if (
              !recoverableAdd ||
              !(error instanceof StorefrontCommerceRepositoryError) ||
              (error.code !== "not_found" && error.code !== "cart_expired")
            )
              throw error;
            selectedCandidates = Object.freeze([]);
            cartCredential = generated(
              dependencies,
              "cart",
              now,
              30 * 86_400_000,
            );
          }
        }
      } else {
        cartCredential = generated(dependencies, "cart", now, 30 * 86_400_000);
      }
      const line =
        command.kind === "add"
          ? undefined
          : existingCart?.items.find(
              ({ variantId }) => variantId === command.variantId,
            );
      if (command.kind !== "add" && !line)
        throw new StorefrontCommerceRuntimeError("invalid_input");
      const result = await dependencies.repository.mutateCart({
        hostname,
        now,
        candidates: selectedCandidates,
        customerCandidates: optionalCandidates(
          "customer",
          cookieHeader,
          dependencies.keyring,
        ),
        ...(cartCredential ? { cart: cartCredential.persisted } : {}),
        operationId: command.operationId,
        action: command.kind === "set_quantity" ? "quantity" : command.kind,
        expectedVersion:
          command.kind === "add"
            ? (command.expectedVersion ?? existingCart?.version ?? 0)
            : command.expectedVersion,
        productId: command.kind === "add" ? command.productId : line!.productId,
        variantId: command.variantId,
        ...(command.kind === "remove" ? {} : { quantity: command.quantity }),
      });
      if (Boolean(cartCredential) !== result.credentialCreated)
        throw new StorefrontCommerceRuntimeError("unavailable");
      if (
        command.attribution &&
        typeof dependencies.repository.recordCartAttribution === "function"
      ) {
        const attributionCandidates = cartCredential
          ? Object.freeze([
              Object.freeze({
                keyId: cartCredential.persisted.keyId,
                digest: cartCredential.persisted.digest,
              }),
            ])
          : selectedCandidates;
        try {
          await dependencies.repository.recordCartAttribution({
            hostname,
            now,
            candidates: attributionCandidates,
            attribution: command.attribution,
          });
        } catch {
          /* analytics enrichment must never fail the cart mutation */
        }
      }
      return Object.freeze({
        cart: result.cart,
        ...(cartCredential
          ? {
              setCookie: serializeStorefrontCredentialCookie(
                "cart",
                cartCredential.raw,
              ),
            }
          : {}),
      });
    },
    async quote(
      hostname,
      cookieHeader,
      intentKind,
      attribution,
      normalizedCodes,
    ) {
      if (normalizedCodes !== undefined) {
        const selectedCodes = promotionCodes(normalizedCodes);
        const quoted = (
          await dependencies.repository.quoteV2({
            hostname,
            now: date(dependencies),
            intentKind,
            candidates: candidates(
              purpose(intentKind),
              cookieHeader,
              dependencies.keyring,
            ),
            customerCandidates: optionalCandidates(
              "customer",
              cookieHeader,
              dependencies.keyring,
            ),
            normalizedCodes: selectedCodes,
            ...(attribution ? { attribution } : {}),
          })
        ).quote;
        const methods = [] as PublicPaymentMethod[];
        for (const method of quoted.paymentMethods) {
          if (method.kind !== "hosted_card") {
            methods.push(method);
            continue;
          }
          let available = false;
          try {
            available =
              (await dependencies.hostedPaymentAvailable?.(method)) === true;
          } catch {
            available = false;
          }
          if (available) methods.push(method);
        }
        if (methods.length === quoted.paymentMethods.length) return quoted;
        const paymentUnavailable =
          methods.length === 0 && quoted.cart.checkoutBlocker === null;
        const cart = paymentUnavailable
          ? Object.freeze({
              ...quoted.cart,
              checkoutReady: false,
              checkoutBlocker: "payment_unavailable" as const,
            })
          : quoted.cart;
        return Object.freeze({
          ...quoted,
          cart,
          paymentMethods: Object.freeze(methods),
        });
      }
      const quoted = await dependencies.repository.quote({
        hostname,
        now: date(dependencies),
        intentKind,
        candidates: candidates(
          purpose(intentKind),
          cookieHeader,
          dependencies.keyring,
        ),
        ...(attribution ? { attribution } : {}),
      });
      const methods = [] as PublicCheckoutQuote["paymentMethods"][number][];
      for (const method of quoted.paymentMethods) {
        if (method.kind !== "hosted_card") {
          methods.push(method);
          continue;
        }
        let available = false;
        try {
          available =
            (await dependencies.hostedPaymentAvailable?.(method)) === true;
        } catch {
          available = false;
        }
        if (available) methods.push(method);
      }
      if (methods.length === quoted.paymentMethods.length) return quoted;
      const paymentUnavailable =
        methods.length === 0 && quoted.cart.checkoutBlocker === null;
      const cart = paymentUnavailable
        ? Object.freeze({
            ...quoted.cart,
            checkoutReady: false,
            checkoutBlocker: "payment_unavailable" as const,
          })
        : quoted.cart;
      return Object.freeze({
        cart,
        paymentMethods: Object.freeze(methods),
        ...(quoted.estimatedDays === undefined
          ? {}
          : { estimatedDays: quoted.estimatedDays }),
      });
    },
    async complete(hostname, cookieHeader, request) {
      const selectedCodes = Object.hasOwn(request, "normalizedCodes")
        ? promotionCodes(request.normalizedCodes)
        : null;
      const now = date(dependencies);
      const intentCandidates = candidates(
        purpose(request.intentKind),
        cookieHeader,
        dependencies.keyring,
      );
      const receipt = selectedCodes === null
        ? operationGenerated(
            dependencies,
            "receipt",
            request.operationId,
            now,
            15 * 60_000,
          )
        : operationGeneratedV2(
            dependencies,
            "receipt",
            "receipt",
            hostname,
            request.operationId,
            now,
            15 * 60_000,
          );
      const customer = selectedCodes === null
        ? operationGenerated(
            dependencies,
            "customer",
            request.operationId,
            now,
            30 * 86_400_000,
          )
        : operationGeneratedV2(
            dependencies,
            "customer",
            "customer-credential",
            hostname,
            request.operationId,
            now,
            30 * 86_400_000,
          );
      const customerCandidates = optionalCandidates(
        "customer",
        cookieHeader,
        dependencies.keyring,
      );
      const common = Object.freeze({
        hostname,
        now,
        intentKind: request.intentKind,
        candidates: intentCandidates,
        customerCandidates,
        operationId: request.operationId,
        cartVersion: request.cartVersion,
        delivery: delivery(request),
        paymentKind: request.paymentKind,
      });
      const result = selectedCodes === null
        ? await dependencies.repository.complete({
            ...common,
            generated: Object.freeze({
              orderId: dependencies.randomUuid(),
              customerId: dependencies.randomUuid(),
              addressId: dependencies.randomUuid(),
              eventId: dependencies.randomUuid(),
              receipt: receipt.persisted,
              customer: customer.persisted,
            }),
          })
        : await dependencies.repository.completeV2({
            ...common,
            generated: Object.freeze({
              orderId: derivedV2Uuid("order", hostname, request.operationId),
              customerId: derivedV2Uuid(
                "customer",
                hostname,
                request.operationId,
              ),
              addressId: derivedV2Uuid(
                "address",
                hostname,
                request.operationId,
              ),
              eventId: derivedV2Uuid("event", hostname, request.operationId),
              receipt: receipt.persisted,
              customer: customer.persisted,
            }),
            normalizedCodes: selectedCodes,
          });
      const persistedReceipt = createStorefrontOperationCredential(
        "receipt",
        request.operationId,
        dependencies.keyring,
        result.credentialPersistence.receiptKeyId,
      );
      const persistedCustomer = result.credentialPersistence.customer
        ? createStorefrontOperationCredential(
            "customer",
            request.operationId,
            dependencies.keyring,
            result.credentialPersistence.customerKeyId,
          )
        : undefined;
      const setCookies = [
        ...(persistedCustomer
          ? [
              serializeStorefrontCredentialCookie(
                "customer",
                persistedCustomer.value,
              ),
            ]
          : []),
        ...(result.credentialPersistence.receipt
          ? [
              serializeStorefrontCredentialCookie(
                "receipt",
                persistedReceipt.value,
              ),
            ]
          : []),
      ];
      return Object.freeze({
        receipt: result.receipt,
        setCookies: Object.freeze(setCookies),
      });
    },
    async getReceipt(hostname, cookieHeader) {
      return dependencies.repository.getReceipt({
        hostname,
        now: date(dependencies),
        receiptCandidates: candidates(
          "receipt",
          cookieHeader,
          dependencies.keyring,
        ),
        customerCandidates: candidates(
          "customer",
          cookieHeader,
          dependencies.keyring,
        ),
      });
    },
    async listAccountOrders(hostname, cookieHeader, limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
        throw new StorefrontCommerceRuntimeError("invalid_input");
      return dependencies.repository.listAccountOrders({
        hostname,
        now: date(dependencies),
        candidates: candidates("customer", cookieHeader, dependencies.keyring),
        limit,
      });
    },
  });
}
