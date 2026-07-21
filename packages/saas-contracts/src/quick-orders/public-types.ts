export interface QuickOrderPublicQuote {
  readonly schemaVersion: 1;
  readonly status: "active" | "opened";
  readonly merchantName: string;
  readonly currency: "TRY";
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly expiresAt: string;
  readonly items: readonly Readonly<{
    productName: string;
    variantName?: string;
    imageUrl?: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }>[];
}

export interface QuickOrderMerchantUrl {
  readonly url: string;
  readonly expiresAt: string;
}

export type CheckoutState =
  | Readonly<{ kind: "ready"; quote: QuickOrderPublicQuote }>
  | Readonly<{ kind: "processing" }>
  | Readonly<{ kind: "paid"; orderNumber: string }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "unavailable" }>;
