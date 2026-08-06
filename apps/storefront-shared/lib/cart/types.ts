import type { PublicCart, PublicCheckoutQuote } from "@celebix/saas-contracts";

export type StorefrontCredentialPurpose = "cart" | "intent" | "customer" | "receipt" | "hosted_checkout";

export type CartCommand =
  | Readonly<{ kind: "add"; operationId: string; productId: string; variantId: string; quantity: number; expectedVersion?: number }>
  | Readonly<{ kind: "set_quantity"; operationId: string; variantId: string; quantity: number; expectedVersion: number }>
  | Readonly<{ kind: "remove"; operationId: string; variantId: string; expectedVersion: number }>
  | Readonly<{ kind: "buy_now"; operationId: string; productId: string; variantId: string; quantity: number }>;

export type CheckoutIntentKind = "cart" | "buy_now";
export type CheckoutContact = Readonly<{ name: string; email: string; phone: string }>;
export type CheckoutShippingAddress = Readonly<{ addressLine1: string; addressLine2?: string; city: string; district: string; postalCode?: string }>;
export type CheckoutRequest =
  | Readonly<{ kind: "quote"; intentKind: CheckoutIntentKind }>
  | Readonly<{ kind: "complete"; operationId: string; cartVersion: number; intentKind: CheckoutIntentKind; contact: CheckoutContact; shippingAddress: CheckoutShippingAddress; shippingMethod: "standard"; paymentKind: "bank_transfer" | "cash_on_delivery"; note?: string }>
  | HostedCheckoutStartRequest;

export type HostedCheckoutStartRequest = Readonly<{
  kind: "hosted_start";
  operationId: string;
  cartVersion: number;
  intentKind: CheckoutIntentKind;
  contact: CheckoutContact;
  shippingAddress: CheckoutShippingAddress;
  shippingMethod: "standard";
  paymentMethodId: string;
  identityNumber?: string;
  note?: string;
}>;

export type HostedCheckoutStartClientInput = Omit<HostedCheckoutStartRequest, "kind" | "operationId">;

export type StorefrontCartClient = Readonly<{
  resolve(): Promise<PublicCart>;
  add(input: Readonly<{ productId: string; variantId: string; quantity: number; expectedVersion?: number }>): Promise<PublicCart>;
  setQuantity(input: Readonly<{ variantId: string; quantity: number; expectedVersion: number }>): Promise<PublicCart>;
  remove(input: Readonly<{ variantId: string; expectedVersion: number }>): Promise<PublicCart>;
  buyNow(input: Readonly<{ productId: string; variantId: string; quantity: number }>): Promise<Readonly<{ destination: "/checkout?intent=buy-now" }>>;
  quote(intentKind: CheckoutIntentKind): Promise<PublicCheckoutQuote>;
  startHosted(input: HostedCheckoutStartClientInput): Promise<Readonly<{ destination: "/checkout/payment" }>>;
}>;
