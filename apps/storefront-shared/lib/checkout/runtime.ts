import type { PublicQuickOrderRepository, PublicStorefrontRepository } from "@celebix/saas-data";

export type CheckoutRuntime = Readonly<{
  storefrontRepository: PublicStorefrontRepository;
  quickOrderRepository: PublicQuickOrderRepository;
}>;

function invalid(): never {
  throw new Error("checkout_runtime_invalid");
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const selected = value as Record<string, unknown>;
  if (Object.keys(selected).length !== keys.length || keys.some((key) => !Object.hasOwn(selected, key))) invalid();
  return selected;
}

function methods(value: unknown, names: readonly string[]): void {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) invalid();
  for (const name of names) {
    let member: unknown;
    try { member = (value as Record<string, unknown>)[name]; } catch { return invalid(); }
    if (typeof member !== "function") invalid();
  }
}

export function createCheckoutRuntime(input: Readonly<{
  storefrontRepository: PublicStorefrontRepository;
  quickOrderRepository: PublicQuickOrderRepository;
}>): CheckoutRuntime {
  const parsed = exactObject(input, ["storefrontRepository", "quickOrderRepository"]);
  methods(parsed.storefrontRepository, ["getPublicStorefront", "listPublicProducts", "getPublicProductBySlug", "listPublicProductMedia"]);
  methods(parsed.quickOrderRepository, ["claimRedemption", "resolveRedemption", "getStatus", "revokeRedemption"]);
  return Object.freeze({
    storefrontRepository: parsed.storefrontRepository as PublicStorefrontRepository,
    quickOrderRepository: parsed.quickOrderRepository as PublicQuickOrderRepository,
  });
}
