export type CheckoutAddress = Readonly<{
  firstName: string;
  lastName: string;
  company?: string;
  line1: string;
  line2?: string;
  district: string;
  city: string;
  postalCode?: string;
  countryCode: "TR";
  phone: string;
}>;

export type CheckoutQuoteItem = Readonly<{
  id: string;
  title: string;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  imagePath: string | null;
}>;

export type CheckoutShippingOption = Readonly<{
  id: "standard";
  label: string;
  description: string | null;
  priceCents: number;
}>;

export type CheckoutPaymentMethod =
  | Readonly<{ id: string; kind: "provider"; label: string; providerCode: "paytr_iframe" | "iyzico_iframe"; logoPath: string }>
  | Readonly<{ id: string; kind: "cash_on_delivery"; label: string; instructions: string }>
  | Readonly<{ id: string; kind: "bank_transfer"; label: string; bankName: string; accountHolder: string; iban: string; instructions: string }>;

export type CheckoutPolicyLink = Readonly<{
  policyType: "distance_sales" | "pre_information" | "privacy" | "returns" | "shipping";
  label: string;
  href: string;
}>;

export type CheckoutPolicy = Readonly<{
  policyType: CheckoutPolicyLink["policyType"];
  label: string;
  body: string;
  effectiveAt: string;
}>;

export type CheckoutQuote = Readonly<{
  schemaVersion: 1;
  cartId: string;
  cartVersion: number;
  checkoutNonce: string;
  storeName: string;
  currency: "TRY";
  locale: "tr";
  items: readonly CheckoutQuoteItem[];
  shippingOptions: readonly CheckoutShippingOption[];
  selectedShippingId: "standard" | null;
  paymentMethods: readonly CheckoutPaymentMethod[];
  policyLinks: readonly CheckoutPolicyLink[];
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  discountCode: string | null;
}>;

export type CheckoutDeliveryInput = Readonly<{
  cartVersion: number;
  checkoutNonce: string;
  operationId: string;
  email: string;
  marketingOptIn: boolean;
  shippingAddress: CheckoutAddress;
  billingAddress: CheckoutAddress | null;
  shippingId: "standard" | null;
  discountCode: string | null;
}>;

export type CheckoutSubmitInput = Readonly<{
  cartVersion: number;
  checkoutNonce: string;
  operationId: string;
  paymentMethodId: string;
  consents: Readonly<{ distanceSales: true; preInformation: true }>;
}>;

export type CheckoutSubmissionResult =
  | Readonly<{ kind: "placed"; orderNumber: string; statusPath: string }>
  | Readonly<{ kind: "hosted"; location: string }>;

export type CheckoutHttpError =
  | "invalid_input" | "origin_denied" | "cart_not_found" | "cart_changed"
  | "discount_invalid" | "stock_unavailable" | "payment_unavailable"
  | "processing" | "unavailable";

export type CheckoutStatus =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "processing"; orderNumber: string }>
  | Readonly<{ kind: "placed"; orderNumber: string; paymentStatus: "pending"; method: Extract<CheckoutPaymentMethod, { kind: "cash_on_delivery" | "bank_transfer" }> }>
  | Readonly<{ kind: "paid"; orderNumber: string }>
  | Readonly<{ kind: "failed"; orderNumber: string }>;
