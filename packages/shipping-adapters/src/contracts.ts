import type {
  ShipmentDirection,
  ShipmentStatus,
  ShippingPackage,
  ShippingProviderCode,
} from "@celebix/saas-contracts";

export type ShippingProviderReadFailure =
  | Readonly<{ kind: "credential_invalid"; safeCode: string }>
  | Readonly<{ kind: "rejected"; safeCode: string }>
  | Readonly<{ kind: "throttled"; retryAfterSeconds: number }>
  | Readonly<{ kind: "temporary_failure"; safeCode: string }>;

export type ShippingProviderMutationFailure =
  | ShippingProviderReadFailure
  | Readonly<{ kind: "provider_outcome_unknown"; providerReference: string | null }>;

export type ShippingCredentialVerification =
  | Readonly<{ kind: "succeeded"; accountIdentity: string }>
  | ShippingProviderReadFailure;

export type ProviderShippingResource = Readonly<{
  providerResourceId: string;
  label: string;
  active: boolean;
}>;

export type ShippingResourceListResult =
  | Readonly<{ kind: "succeeded"; resources: readonly ProviderShippingResource[] }>
  | ShippingProviderReadFailure;

export type ProviderShippingHandler = Readonly<{
  handlerCode: string;
  handlerName: string;
  active: boolean;
}>;

export type ShippingHandlerListResult =
  | Readonly<{ kind: "succeeded"; handlers: readonly ProviderShippingHandler[] }>
  | ShippingProviderReadFailure;

export type ProviderShippingQuote = Readonly<{
  handlerCode: string;
  handlerName: string;
  desiKg: number;
  priceCents: number;
  codFeeCents?: number;
  currency: "TRY";
}>;

export type ShippingQuoteResult =
  | Readonly<{ kind: "succeeded"; options: readonly ProviderShippingQuote[] }>
  | ShippingProviderReadFailure;

export type ProviderShipment = Readonly<{
  providerReference: string;
  direction: ShipmentDirection;
  status: ShipmentStatus;
  providerStatus: string;
  handlerCode?: string;
  handlerName?: string;
  barcode?: string;
  trackingNumber?: string;
  priceCents?: number;
  currency: "TRY";
}>;

export type CreateProviderShipmentResult =
  | Readonly<{ kind: "succeeded"; shipment: ProviderShipment }>
  | ShippingProviderMutationFailure;

export type GetProviderShipmentResult =
  | Readonly<{ kind: "succeeded"; shipment: ProviderShipment }>
  | ShippingProviderReadFailure;

export type ProviderShipmentMutationResult =
  | Readonly<{ kind: "succeeded"; shipment: ProviderShipment }>
  | ShippingProviderMutationFailure;

export type ShippingLabelDownloadResult =
  | Readonly<{ kind: "succeeded"; contentType: "image/svg+xml"; bytes: Uint8Array }>
  | ShippingProviderReadFailure;

export type VerifyShippingCredentialInput<TCredential extends object> = Readonly<{
  credential: TCredential;
  signal: AbortSignal;
}>;

export type ShippingCredentialResourceInput<TCredential extends object> = VerifyShippingCredentialInput<TCredential>;

export type QuoteShippingPackagesInput<TCredential extends object> = Readonly<{
  credential: TCredential;
  packages: readonly ShippingPackage[];
  codAmountCents: number;
  signal: AbortSignal;
}>;

export type ProviderShipmentItemInput = Readonly<{
  reference: string;
  name: string;
  quantity: number;
}>;

export type ProviderShipmentRecipientInput = Readonly<{
  name: string;
  phone: string;
  city: string;
  town: string;
  address: string;
}>;

export type CreateProviderShipmentInput<TCredential extends object> = Readonly<{
  credential: TCredential;
  reference: string;
  handlerCode: string;
  direction: ShipmentDirection;
  brandId?: string;
  addressId?: string;
  recipient: ProviderShipmentRecipientInput;
  items: readonly ProviderShipmentItemInput[];
  packages: readonly ShippingPackage[];
  codAmountCents: number;
  codPaymentType?: "cash" | "credit_card";
  signal: AbortSignal;
}>;

export type GetProviderShipmentInput<TCredential extends object> = Readonly<{
  credential: TCredential;
  providerReference: string;
  signal: AbortSignal;
}>;

export type CancelProviderShipmentInput<TCredential extends object> = Readonly<{
  credential: TCredential;
  providerReference: string;
  barcode: string;
  signal: AbortSignal;
}>;

export type CreateReturnShipmentInput<TCredential extends object> = Readonly<{
  credential: TCredential;
  providerReference: string;
  barcode: string;
  signal: AbortSignal;
}>;

export type DownloadShippingLabelInput<TCredential extends object> = Readonly<{
  credential: TCredential;
  providerReference: string;
  signal: AbortSignal;
}>;

export interface ShippingProviderAdapter<TCredential extends object> {
  readonly providerCode: ShippingProviderCode;
  parseCredential(value: unknown): TCredential;
  verifyCredential(input: VerifyShippingCredentialInput<TCredential>): Promise<ShippingCredentialVerification>;
  listBrands(input: ShippingCredentialResourceInput<TCredential>): Promise<ShippingResourceListResult>;
  listSenderAddresses(input: ShippingCredentialResourceInput<TCredential>): Promise<ShippingResourceListResult>;
  listHandlers(input: ShippingCredentialResourceInput<TCredential>): Promise<ShippingHandlerListResult>;
  quotePackages(input: QuoteShippingPackagesInput<TCredential>): Promise<ShippingQuoteResult>;
  createShipment(input: CreateProviderShipmentInput<TCredential>): Promise<CreateProviderShipmentResult>;
  getShipment(input: GetProviderShipmentInput<TCredential>): Promise<GetProviderShipmentResult>;
  cancelShipment(input: CancelProviderShipmentInput<TCredential>): Promise<ProviderShipmentMutationResult>;
  createReturnShipment(input: CreateReturnShipmentInput<TCredential>): Promise<CreateProviderShipmentResult>;
  downloadLabel(input: DownloadShippingLabelInput<TCredential>): Promise<ShippingLabelDownloadResult>;
}
