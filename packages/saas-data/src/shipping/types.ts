import type {
  Shipment, ShippingConnection, ShippingPackage, ShippingProviderCode, ShippingQuoteSession,
  ShippingResource, TenantContext,
} from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { SealedShippingCredential, ShippingCredentialKeyring } from "./credential-crypto.ts";

export type ShippingAuthorityInput = Readonly<{ tenantContext: TenantContext; now: Date; providerCode: ShippingProviderCode }>;
export type ShippingConnectionSetup = Readonly<{ connection: ShippingConnection; resources: readonly ShippingResource[] }>;
export type SaveShippingConnectionInput = ShippingAuthorityInput & Readonly<{ operationId: string; token: string }>;
export type SaveShippingConnectionResult = Readonly<{ connection: ShippingConnection; validationJobId: string }>;
export type SelectShippingResourcesInput = ShippingAuthorityInput & Readonly<{
  operationId: string; brandResourceId: string; addressResourceId: string; codDeliveredMarksPaid: boolean;
}>;
export type RevokeShippingConnectionInput = ShippingAuthorityInput & Readonly<{ operationId: string }>;
export type BeginShippingQuoteInput = Readonly<{
  tenantContext: TenantContext; now: Date; orderId: string; expectedOrderVersion: number;
  packages: readonly ShippingPackage[]; operationId: string;
}>;
export type BeginShippingQuoteResult = Readonly<{
  credential: string; quoteId: string; jobId: string; expiresAt: string;
  packages: readonly ShippingPackage[]; replayed: boolean;
}>;
export type CurrentShippingQuoteInput = Readonly<{ tenantContext: TenantContext; now: Date; credential: string }>;
export type BeginShippingShipmentInput = Readonly<{
  tenantContext: TenantContext; now: Date; orderId: string; expectedOrderVersion: number;
  quoteCredential: string; optionId: string; operationId: string;
}>;
export type BeginShippingShipmentResult = Readonly<{ shipment: Shipment; jobId: string; replayed: boolean }>;
export type CurrentShippingShipmentInput = Readonly<{ tenantContext: TenantContext; now: Date; shipmentId: string }>;
export type CurrentShippingShipmentForOrderInput = Readonly<{ tenantContext: TenantContext; now: Date; orderId: string }>;
export type ShippingShipmentActionKind = "refresh" | "label" | "cancel" | "return";
export type BeginShippingShipmentActionInput = Readonly<{
  tenantContext: TenantContext; now: Date; orderId: string; shipmentId: string;
  expectedShipmentVersion: number; actionKind: ShippingShipmentActionKind; operationId: string;
}>;
export type BeginShippingShipmentActionResult = Readonly<{ jobId: string; replayed: boolean }>;
export type CurrentShippingShipmentLabelInput = Readonly<{
  tenantContext: TenantContext; now: Date; orderId: string; shipmentId: string;
}>;
export type ShippingShipmentLabel = Readonly<{
  contentType: "image/svg+xml"; bytes: Uint8Array; sha256: string; version: number;
}>;

export interface ShippingAdminRepository {
  current(input: ShippingAuthorityInput): Promise<ShippingConnection | null>;
  setup(input: ShippingAuthorityInput): Promise<ShippingConnectionSetup | null>;
  saveConnection(input: SaveShippingConnectionInput): Promise<SaveShippingConnectionResult>;
  selectResources(input: SelectShippingResourcesInput): Promise<ShippingConnection>;
  revokeConnection(input: RevokeShippingConnectionInput): Promise<ShippingConnection>;
  beginQuote(input: BeginShippingQuoteInput): Promise<BeginShippingQuoteResult>;
  currentQuote(input: CurrentShippingQuoteInput): Promise<ShippingQuoteSession | null>;
  beginShipment(input: BeginShippingShipmentInput): Promise<BeginShippingShipmentResult>;
  currentShipment(input: CurrentShippingShipmentInput): Promise<Shipment | null>;
  currentShipmentForOrder(input: CurrentShippingShipmentForOrderInput): Promise<Shipment | null>;
  beginShipmentAction(input: BeginShippingShipmentActionInput): Promise<BeginShippingShipmentActionResult>;
  currentShipmentLabel(input: CurrentShippingShipmentLabelInput): Promise<ShippingShipmentLabel | null>;
}

export interface PostgresShippingAdminRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly keyring: ShippingCredentialKeyring;
  readonly generateId: () => string;
  readonly audit: (event: Readonly<{ type: "shipping_commit_unknown" }>) => void | Promise<void>;
  readonly timeouts: PostgresTimeoutOptions;
}

export type ShippingValidationClaim = Readonly<{
  jobId: string; storeId: string; profileId: string; providerCode: "basit_kargo"; credentialVersion: number;
  leaseId: string; workerId: string; fenceToken: number; version: number;
}>;
export type ClaimShippingValidationInput = Readonly<{
  jobId: string; workerId: string; now: Date; leaseSeconds: number; leaseId: string;
}>;
export type OpenShippingCredentialInput = Readonly<{ claim: ShippingValidationClaim; now: Date }>;
export type OpenedShippingCredential = Readonly<{ providerCode: "basit_kargo"; tokenBytes: Uint8Array }>;
export type ShippingValidationResource = Readonly<{
  id: string; kind: "brand" | "address" | "handler"; providerResourceId: string;
  label: string; active: boolean; digest: string;
}>;
export type CompleteShippingValidationInput = Readonly<{
  claim: ShippingValidationClaim; now: Date; accountIdentityDigest: string; resources: readonly ShippingValidationResource[];
}>;
export type FailShippingValidationInput = Readonly<{
  claim: ShippingValidationClaim; now: Date; failureKind: "credential_invalid" | "rejected" | "throttled" | "temporary_failure";
  safeCode: string; retryAfterSeconds: number | null;
}>;

export interface ShippingWorkflowRepository {
  claimValidation(input: ClaimShippingValidationInput): Promise<ShippingValidationClaim | null>;
  openClaimedCredential(input: OpenShippingCredentialInput): Promise<OpenedShippingCredential>;
  completeValidation(input: CompleteShippingValidationInput): Promise<"completed">;
  failValidation(input: FailShippingValidationInput): Promise<"failed" | "requeued">;
  claimFulfillment(input: ClaimShippingFulfillmentInput): Promise<ShippingFulfillmentClaim | null>;
  openFulfillment(input: OpenShippingFulfillmentInput): Promise<OpenedShippingFulfillment>;
  completeQuote(input: CompleteShippingQuoteInput): Promise<"completed">;
  failFulfillment(input: FailShippingFulfillmentInput): Promise<"failed" | "requeued">;
  completeShipment(input: CompleteShippingShipmentInput): Promise<"completed">;
  markShipmentUnknown(input: MarkShippingShipmentUnknownInput): Promise<"marked_unknown">;
  claimShipmentAction(input: ClaimShippingShipmentActionInput): Promise<ShippingShipmentActionClaim | null>;
  openShipmentAction(input: OpenShippingShipmentActionInput): Promise<OpenedShippingShipmentAction>;
  completeShipmentAction(input: CompleteShippingShipmentActionInput): Promise<"completed">;
  failShipmentAction(input: FailShippingShipmentActionInput): Promise<"failed">;
  markShipmentActionUnknown(input: MarkShippingShipmentActionUnknownInput): Promise<"marked_unknown">;
}

export interface PostgresShippingWorkflowRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_workflow";
  readonly keyring: ShippingCredentialKeyring;
  readonly timeouts: PostgresTimeoutOptions;
}

export type ShippingCredentialAuthority = Readonly<{
  providerCode: "basit_kargo"; credentialEnvelope: SealedShippingCredential; credentialDigest: string;
  credentialKeyId: string; credentialVersion: number;
}>;

export type ShippingFulfillmentJobKind = "quote" | "create_shipment";
export type ShippingFulfillmentClaim = Readonly<{
  jobId: string; jobKind: ShippingFulfillmentJobKind; storeId: string; profileId: string;
  quoteId: string; shipmentId: string | null; credentialVersion: number; leaseId: string;
  workerId: string; fenceToken: number; version: number;
}>;
export type ClaimShippingFulfillmentInput = Readonly<{
  jobId: string; workerId: string; now: Date; leaseSeconds: number; leaseId: string;
}>;
export type ShippingFulfillmentOrder = Readonly<{
  orderId: string; orderNumber: string; customerName: string; customerEmail: string | null;
  customerPhone: string | null; shippingAddress: Readonly<Record<string, unknown>>; codAmountCents: number;
  handlerCode: string; items: readonly Readonly<{ orderItemId: string; productName: string; sku: string | null; quantity: number }>[];
}>;
export type OpenedShippingFulfillment = Readonly<{
  claim: ShippingFulfillmentClaim; providerCode: "basit_kargo"; tokenBytes: Uint8Array;
  packages: readonly ShippingPackage[]; brandProviderResourceId: string | null;
  addressProviderResourceId: string | null;
  handlers: readonly Readonly<{ id: string; handlerCode: string }>[]; order: ShippingFulfillmentOrder | null;
}>;
export type OpenShippingFulfillmentInput = Readonly<{ claim: ShippingFulfillmentClaim; now: Date }>;
export type ShippingFulfillmentQuoteOption = Readonly<{
  id: string; handlerResourceId: string; handlerCode: string; handlerName: string; desiKg: number;
  priceCents: number; codFeeCents: number | null; digest: string;
}>;
export type CompleteShippingQuoteInput = Readonly<{
  claim: ShippingFulfillmentClaim; now: Date; options: readonly ShippingFulfillmentQuoteOption[];
}>;
export type FailShippingFulfillmentInput = Readonly<{
  claim: ShippingFulfillmentClaim; now: Date; failureKind: "rejected" | "throttled" | "temporary_failure";
  safeCode: string; retryAfterSeconds: number | null;
}>;
export type CompleteShippingShipmentInput = Readonly<{
  claim: ShippingFulfillmentClaim; now: Date; eventId: string; providerShipmentId: string; barcode: string;
  trackingNumber: string | null; trackingUrl: string | null; carrier: string | null; priceCents: number | null;
}>;
export type MarkShippingShipmentUnknownInput = Readonly<{
  claim: ShippingFulfillmentClaim; now: Date; eventId: string; safeCode: string;
}>;

export type ShippingShipmentActionClaim = Readonly<{
  jobId: string; actionKind: ShippingShipmentActionKind; storeId: string; profileId: string;
  shipmentId: string; credentialVersion: number; leaseId: string; workerId: string;
  fenceToken: number; version: number;
}>;
export type ClaimShippingShipmentActionInput = Readonly<{
  jobId: string; workerId: string; now: Date; leaseSeconds: number; leaseId: string;
}>;
export type OpenShippingShipmentActionInput = Readonly<{ claim: ShippingShipmentActionClaim; now: Date }>;
export type OpenedShippingShipmentAction = Readonly<{
  claim: ShippingShipmentActionClaim; providerCode: "basit_kargo"; tokenBytes: Uint8Array;
  providerReference: string; barcode: string | null;
}>;
export type CompleteShippingShipmentActionInput = Readonly<{
  claim: ShippingShipmentActionClaim; now: Date; eventId: string;
  providerShipmentId: string | null; barcode: string | null; trackingNumber: string | null;
  carrier: string | null; status: Shipment["status"] | null; priceCents: number | null;
  labelBytes: Uint8Array | null; labelSha256: string | null;
}>;
export type FailShippingShipmentActionInput = Readonly<{
  claim: ShippingShipmentActionClaim; now: Date;
  failureKind: "credential_invalid" | "rejected" | "throttled" | "temporary_failure";
  safeCode: string;
}>;
export type MarkShippingShipmentActionUnknownInput = Readonly<{
  claim: ShippingShipmentActionClaim; now: Date; eventId: string; safeCode: string;
}>;
